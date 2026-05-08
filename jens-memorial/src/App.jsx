import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import WaitingPage from './pages/WaitingPage'
import ConstellationPage from './pages/ConstellationPage'
import AddMemoryPage from './pages/AddMemoryPage'
import MusicPage from './pages/MusicPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import { AmbientAudioProvider } from './context/AmbientAudioContext'

function App() {
  return (
    <AmbientAudioProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
    </AmbientAudioProvider>
  )
}

export default App
