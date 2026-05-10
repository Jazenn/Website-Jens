import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import WaitingPage from './pages/WaitingPage'
import ConstellationPage from './pages/ConstellationPage'
import AddMemoryPage from './pages/AddMemoryPage'
import MusicPage from './pages/MusicPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import JourneyIntroPage from './pages/JourneyIntroPage'
import { AmbientAudioProvider } from './context/AmbientAudioContext'
import { MusicPlayerProvider } from './context/MusicPlayerContext'

function App() {
  return (
    <AmbientAudioProvider>
      <MusicPlayerProvider>
        <Routes>
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
          path="/about"
          element={
            <ProtectedRoute>
              <AboutPage />
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
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MusicPlayerProvider>
    </AmbientAudioProvider>
  )
}

export default App
