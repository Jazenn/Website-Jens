import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, LogOut, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ProfilePage() {
  const { user, signOut } = useAuth()

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6" style={{ background: 'var(--cosmic-bg)' }}>
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
      </div>
    </div>
  )
}
