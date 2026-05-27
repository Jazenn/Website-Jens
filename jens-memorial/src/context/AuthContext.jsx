import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

const AuthContext = createContext(null)
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.toLowerCase()
const AUTH_TIMEOUT_MS = 10000

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), AUTH_TIMEOUT_MS)
    }),
  ])
}

function isAdminUser(authUser) {
  return authUser?.email?.toLowerCase() === adminEmail
}

async function notifyAccessRequest(authUser, name) {
  try {
    await supabase.functions.invoke('notify-access-request', {
      body: {
        email: authUser.email,
        name,
      },
    })
  } catch (error) {
    console.error('notifyAccessRequest error:', error)
  }
}

async function loadUserRecord(authUser) {
  try {
    console.log('[Auth] loadUserRecord started for:', authUser.email)
    const admin = isAdminUser(authUser)
    
    console.log('[Auth] Fetching existing user record...')
    const fetchStart = Date.now()
    const { data: existing, error: existingError } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle(),
      'load existing user record'
    )
    console.log(`[Auth] Fetch completed in ${Date.now() - fetchStart}ms`)

    if (existingError) {
      console.error('[Auth] Fetch existing error:', existingError)
      throw existingError
    }

    if (existing) {
      console.log('[Auth] Existing record found:', existing.email)
      if (admin && (!existing.approved || !existing.is_admin)) {
        const { data: updated, error: updateError } = await withTimeout(
          supabase
            .from('users')
            .update({ approved: true, is_admin: true })
            .eq('email', authUser.email)
            .select('*')
            .maybeSingle(),
          'update admin user record'
        )

        if (updateError) throw updateError

        return updated ?? { ...existing, approved: true, is_admin: true }
      }

      return existing
    }

    const name =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.email.split('@')[0]

    const newRecord = {
      email: authUser.email,
      name,
      approved: admin,
      is_admin: admin,
    }

    const { error: insertError } = await withTimeout(supabase.from('users').insert(newRecord), 'insert user record')
    if (insertError) throw insertError
    if (!admin) notifyAccessRequest(authUser, name)

    const { data: fresh, error: freshError } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle(),
      'load fresh user record'
    )

    if (freshError) throw freshError

    return fresh ?? newRecord
  } catch (e) {
    console.error('[Auth] loadUserRecord threw error:', e)
    if (isAdminUser(authUser)) {
      console.log('[Auth] Falling back to dummy admin record due to error')
      return {
        email: authUser.email,
        name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email.split('@')[0],
        approved: true,
        is_admin: true,
      }
    }
    throw e
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRecord, setUserRecord] = useState(null)
  const [loading, setLoading] = useState(!supabaseConfigError)
  const [sessionReady, setSessionReady] = useState(false)
  const initStart = useRef(Date.now())

  useEffect(() => {
    if (supabaseConfigError) return

    // Ensure we parse the URL hash (OAuth redirect) before finalizing the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] getSession finished, user:', session?.user?.email)
      setUser(session?.user ?? null)
      setSessionReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(`[Auth] onAuthStateChange event: ${event}`)
        setUser(session?.user ?? null)
      }
    )

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (supabaseConfigError) return
    if (!sessionReady) return // Wait for initial session parse to avoid premature redirect to /login

    let mounted = true
    let loadingTimeout;

    async function fetchRecord() {
      try {
        if (user) {
          const record = await loadUserRecord(user)
          if (mounted) {
            console.log('[Auth] loaded record for:', user.email)
            setUserRecord(record)
          }
        } else {
          if (mounted) {
            console.log('[Auth] user is null')
            setUserRecord(null)
          }
        }
      } catch (e) {
        console.error('[Auth] fatal error loading record:', e)
        if (mounted) {
          setUserRecord(prev => prev)
        }
      } finally {
        if (!mounted) return
        
        // Enforce the 1 second minimum UI timer
        const elapsed = Date.now() - initStart.current
        if (elapsed < 1000) {
          loadingTimeout = setTimeout(() => {
            if (mounted) setLoading(false)
          }, 1000 - elapsed)
        } else {
          setLoading(false)
        }
      }
    }

    fetchRecord()

    return () => {
      mounted = false
      if (loadingTimeout) clearTimeout(loadingTimeout)
    }
  }, [user?.id, sessionReady])

  const signOut = () => supabase.auth.signOut()
  const isAdmin = userRecord?.is_admin === true
  const isApproved = userRecord?.approved === true

  const refreshUserRecord = async () => {
    if (user) {
      try {
        const record = await loadUserRecord(user)
        setUserRecord(record)
      } catch (e) {
        console.error('Failed to refresh user record:', e)
      }
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      userRecord,
      loading,
      configError: supabaseConfigError,
      signOut,
      isAdmin,
      isApproved,
      refreshUserRecord
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
