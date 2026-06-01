import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, LogOut, MessageSquare, Send, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { submitFeedback, notifyFeedback } from '../lib/feedback'

export default function ProfilePage() {
  const { user, userRecord, signOut } = useAuth()
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return

    setSending(true)
    setError('')
    setSuccess(false)

    try {
      const email = userRecord?.email || user?.email || ''
      const name = userRecord?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || email.split('@')[0]
      const userId = user?.id || null
      const type = 'other'

      // Save to database
      await submitFeedback({
        userId,
        userEmail: email,
        userName: name,
        type,
        message: message.trim(),
        isAnonymous,
      })

      // Send email notification via Edge Function
      await notifyFeedback({
        email,
        name,
        type,
        message: message.trim(),
        isAnonymous,
      })

      setSuccess(true)
      setMessage('')
    } catch (err) {
      console.error('Feedback submit error:', err)
      setError(err.message || 'Kon bericht niet versturen. Probeer het later opnieuw.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6 pb-16" style={{ background: 'var(--cosmic-bg)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(245,158,11,0.08), transparent 28%), radial-gradient(circle at 80% 15%, rgba(153,127,255,0.12), transparent 30%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-lg mt-10">
        <header className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur-md transition hover:border-white/25 hover:text-white"
          >
            <ArrowLeft size={16} />
            Terug
          </Link>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="rounded-[2rem] border border-white/10 bg-black/30 p-8 shadow-2xl backdrop-blur-xl text-center"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-purple-300/20 bg-purple-300/10 mb-6 text-purple-200">
            <User size={32} />
          </div>
          
          <h1 className="text-2xl font-light text-white tracking-[0.1em] mb-2">Jouw Profiel</h1>
          <p className="text-sm text-white/55 mb-8">
            Ingelogd als <span className="text-white/80">{user?.email}</span>
          </p>

          <button
            onClick={signOut}
            className="mx-auto flex w-full max-w-xs items-center justify-center gap-3 rounded-full border border-rose-300/30 bg-rose-300/10 px-6 py-3 text-sm text-rose-200 transition hover:bg-rose-300/20 active:scale-[0.98]"
          >
            <LogOut size={16} />
            Uitloggen
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 rounded-[2rem] border border-white/10 bg-black/30 p-8 shadow-2xl backdrop-blur-xl text-left"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-purple-300/20 bg-purple-300/10 text-purple-200">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-xl font-light text-white tracking-wide">Berichtje voor Jason</h2>
              <p className="text-xs text-white/45">Vraag, bug, of een complimentje</p>
            </div>
          </div>

          <p className="text-sm leading-6 text-white/55 mb-6">
            Hier kan je een berichtje achter laten voor Jason als je een vraag hebt over de site, een stukje content zoals een foto of filmpje, een probleem hebt of een bug hebt gevonden, of als je gewoon een complimentje wil geven ;) Alle feedback is gewaardeerd en zorgt ervoor dat ik de site voor iedereen mooi en toegankelijk kan maken! Groetjes Jason joejoe &lt;3
          </p>

          {success && (
            <div className="mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Hartelijk dank! Je bericht is succesvol verzonden naar Jason.
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-white/35">
                <span>Jouw bericht</span>
                <span className="tracking-normal text-white/25">{message.length}/1000</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                rows={5}
                required
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-purple-200/40"
                placeholder="Typ hier je bericht..."
              />
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <input
                type="checkbox"
                id="isAnonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <label htmlFor="isAnonymous" className="text-xs text-white/55 cursor-pointer select-none leading-5">
                <span className="block font-medium text-white/80">Stuur anoniem</span>
                Ik vind het natuurlijk super leuk om te weten wie dit stuurt, maar voel je vrij om het anoniem te verzenden!
              </label>
            </div>

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-purple-100 disabled:opacity-50 active:scale-[0.98]"
            >
              <Send size={16} />
              {sending ? 'Verzenden...' : 'Verstuur bericht'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
