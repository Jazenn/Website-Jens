import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useAmbientAudio } from '../context/AmbientAudioContext'
import { JOURNEY_STARTED_KEY } from '../lib/journey'

const STARS = Array.from({ length: 90 }, (_, index) => ({
  id: index,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  delay: Math.random() * 4,
  duration: Math.random() * 3 + 2,
}))

export default function JourneyIntroPage() {
  const navigate = useNavigate()
  const { start } = useAmbientAudio()

  async function beginJourney() {
    sessionStorage.setItem(JOURNEY_STARTED_KEY, 'true')
    await start()
    navigate('/', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-center" style={{ background: 'var(--cosmic-bg)' }}>
      {STARS.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            background: star.id % 8 === 0 ? 'var(--accent-gold)' : 'var(--accent-lilac)',
          }}
          animate={{ opacity: [0.15, 0.9, 0.15], scale: [1, 1.45, 1] }}
          transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(153,127,255,0.2),transparent_34%),radial-gradient(circle_at_50%_80%,rgba(245,158,11,0.1),transparent_32%)]" />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
        className="relative z-10 max-w-xl rounded-[2rem] border border-white/10 bg-black/25 px-7 py-10 shadow-2xl backdrop-blur-xl"
      >
        <p className="mb-4 text-xs uppercase tracking-[0.4em] text-white/35">Voor Jens</p>
        <h1 className="text-4xl font-extralight leading-tight tracking-[0.18em] text-white sm:text-5xl">The Journey</h1>
        <p className="mx-auto mt-6 max-w-md text-sm leading-7 text-white/55">
          Stap rustig binnen in de constellatie van herinneringen. Herinneringen uit elke periode van het leven van Jens. 
        </p>
        <button
          type="button"
          onClick={beginJourney}
          className="mt-9 inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-3 text-sm font-medium text-black shadow-[0_0_35px_rgba(255,255,255,0.12)] transition hover:bg-purple-100 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Sparkles size={17} />
          Begin reis
        </button>
      </motion.main>
    </div>
  )
}

