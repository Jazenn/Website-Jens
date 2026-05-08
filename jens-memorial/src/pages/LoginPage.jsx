import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STARS = Array.from({ length: 120 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  delay: Math.random() * 4,
  duration: Math.random() * 3 + 2,
}))

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, isApproved } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState('idle') // idle | email | sent | loading | hyperspace
  const [error, setError] = useState('')
  const [showEmailForm, setShowEmailForm] = useState(false)

  useEffect(() => {
    if (user && isApproved) navigate('/', { replace: true })
  }, [user, isApproved, navigate])

  async function handleGoogleLogin() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setError('')
    setStep('loading')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: { name },
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setError(error.message)
      setStep('idle')
    } else {
      setStep('sent')
    }
  }

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--cosmic-bg)' }}
    >
      {/* Sterren achtergrond */}
      {STARS.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            background: star.id % 7 === 0 ? 'var(--accent-gold)' : 'var(--accent-lilac)',
          }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.4, 1] }}
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Nevel gloed */}
      <div
        className="absolute rounded-full pointer-events-none animate-nebula"
        style={{
          width: '60vw',
          height: '60vw',
          maxWidth: 600,
          maxHeight: 600,
          background: 'radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '40vw',
          height: '40vw',
          maxWidth: 400,
          maxHeight: 400,
          background: 'radial-gradient(ellipse, rgba(167,139,250,0.1) 0%, transparent 70%)',
          top: '30%',
          left: '60%',
          transform: 'translate(-50%, -50%)',
          animation: 'nebula-drift 25s ease-in-out infinite reverse',
        }}
      />

      {/* Centrale content */}
      <motion.div
        className="relative z-10 flex flex-col items-center text-center px-6 w-full max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2 }}
      >
        {/* Naam */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 0.5 }}
        >
          <h1
            className="text-5xl sm:text-6xl font-extralight tracking-widest mb-3"
            style={{ color: 'var(--text-primary)', letterSpacing: '0.3em' }}
          >
            Jens
          </h1>
          <p
            className="text-sm font-light tracking-widest"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}
          >
            21 april 2001 — 13 juni 2025
          </p>
        </motion.div>

        {/* Dunne scheidingslijn */}
        <motion.div
          className="w-16 my-10"
          style={{ height: '1px', background: 'rgba(167,139,250,0.3)' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
        />

        {/* Login opties */}
        <AnimatePresence mode="wait">
          {step === 'sent' ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-2xl mb-4">✉️</div>
              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                Controleer je inbox
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                We hebben een link gestuurd naar <span className="opacity-80">{email}</span>
              </p>
            </motion.div>
          ) : showEmailForm ? (
            <motion.form
              key="emailform"
              onSubmit={handleEmailSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col gap-3"
            >
              <input
                type="text"
                placeholder="Jouw naam"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 text-sm rounded-lg outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(167,139,250,0.25)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(167,139,250,0.7)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(167,139,250,0.25)')}
              />
              <input
                type="email"
                placeholder="jouw@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 text-sm rounded-lg outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(167,139,250,0.25)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(167,139,250,0.7)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(167,139,250,0.25)')}
              />
              <button
                type="submit"
                disabled={step === 'loading'}
                className="w-full py-3 text-sm rounded-lg transition-all disabled:opacity-50"
                style={{
                  background: 'rgba(124,58,237,0.3)',
                  border: '1px solid rgba(167,139,250,0.4)',
                  color: 'var(--accent-lilac)',
                }}
              >
                {step === 'loading' ? 'Verzenden...' : 'Stuur inloglink'}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="text-xs opacity-40 hover:opacity-70 transition-opacity mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Terug
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="buttons"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 2 }}
              className="w-full flex flex-col gap-3"
            >
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-lg text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(167,139,250,0.25)',
                  color: 'var(--text-primary)',
                }}
              >
                <GoogleIcon />
                Inloggen met Google
              </button>
              <button
                onClick={() => setShowEmailForm(true)}
                className="w-full py-3 px-5 rounded-lg text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(167,139,250,0.2)',
                  color: 'var(--text-muted)',
                }}
              >
                Inloggen met e-mail
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-xs text-red-400 text-center"
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
