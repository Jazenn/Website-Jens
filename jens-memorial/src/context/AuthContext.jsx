import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

const AuthContext = createContext(null)
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.toLowerCase()
const AUTH_TIMEOUT_MS = 5000

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
    const admin = isAdminUser(authUser)
    const { data: existing } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle(),
      'load existing user record'
    )

    if (existing) {
      if (admin && (!existing.approved || !existing.is_admin)) {
        const { data: updated } = await withTimeout(
          supabase
            .from('users')
            .update({ approved: true, is_admin: true })
            .eq('email', authUser.email)
            .select('*')
            .maybeSingle(),
          'update admin user record'
        )

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

    await withTimeout(supabase.from('users').insert(newRecord), 'insert user record')
    if (!admin) notifyAccessRequest(authUser, name)

    const { data: fresh } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle(),
      'load fresh user record'
    )

    return fresh ?? newRecord
  } catch (e) {
    console.error('loadUserRecord error:', e)
    if (isAdminUser(authUser)) {
      return {
        email: authUser.email,
        name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email.split('@')[0],
        approved: true,
        is_admin: true,
      }
    }
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRecord, setUserRecord] = useState(null)
  const [loading, setLoading] = useState(!supabaseConfigError)

  useEffect(() => {
    if (supabaseConfigError) return

    let mounted = true

    async function initialiseAuth() {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 'get session')
        if (!mounted) return

        const authUser = session?.user ?? null
        setUser(authUser)

        if (authUser) {
          const record = await loadUserRecord(authUser)
          if (!mounted) return
          setUserRecord(record)
        } else {
          setUserRecord(null)
        }
      } catch (e) {
        console.error('initialiseAuth error:', e)
        if (mounted) {
          setUser(null)
          setUserRecord(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initialiseAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          const authUser = session?.user ?? null
          setUser(authUser)
          if (authUser) {
            const record = await loadUserRecord(authUser)
            setUserRecord(record)
          } else {
            setUserRecord(null)
          }
        } catch (e) {
          console.error('onAuthStateChange error:', e)
          setUserRecord(null)
        } finally {
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = () => supabase.auth.signOut()
  const isAdmin = userRecord?.is_admin === true
  const isApproved = userRecord?.approved === true

  return (
    <AuthContext.Provider value={{
      user,
      userRecord,
      loading,
      configError: supabaseConfigError,
      signOut,
      isAdmin,
      isApproved
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
