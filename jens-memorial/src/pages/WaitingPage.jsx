import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

export default function WaitingPage() {
  const { user, isApproved, signOut, refreshUserRecord } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
    } else if (isApproved) {
      navigate('/', { replace: true })
    }
  }, [user, isApproved, navigate])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isApproved && refreshUserRecord) {
        refreshUserRecord()
      }
    }, 3000)
    
    return () => clearInterval(interval)
  }, [isApproved, refreshUserRecord])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--cosmic-bg)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="max-w-md"
      >
        <div className="w-16 h-16 mx-auto mb-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
          <span className="text-2xl">✦</span>
        </div>
        <h1 className="text-2xl font-light mb-4" style={{ color: 'var(--text-primary)' }}>
          Wachten op toegang
        </h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-muted)' }}>
          Je aanvraag is ontvangen. Zodra je wordt goedgekeurd krijg je automatisch toegang.
          {user?.email && (
            <span className="block mt-2 opacity-60">{user.email}</span>
          )}
        </p>
        <button
          onClick={signOut}
          className="text-xs underline opacity-40 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          Uitloggen
        </button>
      </motion.div>
    </div>
  )
}
