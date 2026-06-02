import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import WaitingPage from './pages/WaitingPage'
import ConstellationPage from './pages/ConstellationPage'
import AddMemoryPage from './pages/AddMemoryPage'
import MusicPage from './pages/MusicPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import JourneyIntroPage from './pages/JourneyIntroPage'
import { AmbientAudioProvider } from './context/AmbientAudioContext'
import { useAuth } from './context/AuthContext'
import { MusicPlayerProvider } from './context/MusicPlayerContext'
import { JOURNEY_STARTED_KEY, JOURNEY_TRANSITION_KEY } from './lib/journey'

function InitialisingScreen() {
  return (
    <motion.div
      key="initialising"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--cosmic-bg)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(153,127,255,0.18),transparent_34%),radial-gradient(circle_at_50%_82%,rgba(245,158,11,0.08),transparent_30%)]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center gap-8 text-center"
      >
        <div className="relative h-32 w-32">
          <div className="cosmic-loader-glow absolute inset-8 rounded-full bg-purple-200/15 shadow-[0_0_70px_rgba(196,181,253,0.45)]" />
          <div className="cosmic-loader-orbit-slow absolute inset-0 rounded-full border border-purple-200/10">
            <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-purple-100 shadow-[0_0_22px_rgba(221,214,254,0.95)]" />
          </div>
          <div className="cosmic-loader-orbit-medium absolute inset-4 rounded-full border border-white/5">
            <span className="absolute bottom-1 left-3 h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_18px_rgba(252,211,77,0.72)]" />
          </div>
          <div className="cosmic-loader-orbit-wide absolute inset-7 rounded-full">
            <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-purple-300 shadow-[0_0_18px_rgba(196,181,253,0.8)]" />
          </div>
          <div className="cosmic-loader-core absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_28px_rgba(255,255,255,0.9)]" />
        </div>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.8 }}
          className="text-xs uppercase tracking-[0.36em] text-white/35"
        >
          Loading
        </motion.p>
      </motion.div>
    </motion.div>
  )
}

function ConfigurationErrorScreen({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center" style={{ background: 'var(--cosmic-bg)' }}>
      <div className="max-w-lg rounded-[2rem] border border-red-300/20 bg-black/35 p-8 shadow-2xl backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">Configuratie mist</p>
        <h1 className="mt-4 text-2xl font-light tracking-[0.12em] text-white">De site kan nog niet starten</h1>
        <p className="mt-4 text-sm leading-7 text-white/60">{message}</p>
      </div>
    </div>
  )
}

function App() {
  const location = useLocation()
  const { loading, configError } = useAuth()

  useEffect(() => {
    if (loading) return
    if (sessionStorage.getItem(JOURNEY_TRANSITION_KEY) === 'true') return
    sessionStorage.removeItem(JOURNEY_STARTED_KEY)
  }, [loading])

  return (
    <AmbientAudioProvider>
      <MusicPlayerProvider>
        <AnimatePresence mode="wait" initial={false}>
          {configError ? (
            <ConfigurationErrorScreen message={configError} />
          ) : loading ? (
            <InitialisingScreen />
          ) : (
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="min-h-screen overflow-x-hidden"
            >
              <Routes location={location}>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/intro"
                  element={
                    <ProtectedRoute skipJourneyIntro>
                      <JourneyIntroPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/waiting" element={<WaitingPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <ConstellationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/add"
                  element={
                    <ProtectedRoute>
                      <AddMemoryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/music"
                  element={
                    <ProtectedRoute>
                      <MusicPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          )}
        </AnimatePresence>
      </MusicPlayerProvider>
    </AmbientAudioProvider>
  )
}

export default App
