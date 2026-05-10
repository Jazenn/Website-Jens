import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { JOURNEY_STARTED_KEY } from '../../lib/journey'

export function ProtectedRoute({ children, adminOnly = false, skipJourneyIntro = false }) {
  const { user, isApproved, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--cosmic-bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
          <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>laden...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user && !isApproved) return <Navigate to="/waiting" replace />
  if (!skipJourneyIntro && sessionStorage.getItem(JOURNEY_STARTED_KEY) !== 'true') return <Navigate to="/intro" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />

  return children
}
