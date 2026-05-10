import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAmbientAudio } from './AmbientAudioContext'

const MusicPlayerContext = createContext(null)

function createAnalyser(audio) {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return null

  const audioContext = new AudioContext()
  const source = audioContext.createMediaElementSource(audio)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 64
  source.connect(analyser)
  analyser.connect(audioContext.destination)

  return { audioContext, analyser, values: new Uint8Array(analyser.frequencyBinCount) }
}

export function MusicPlayerProvider({ children }) {
  const location = useLocation()
  const ambientAudio = useAmbientAudio()
  const audioRef = useRef(null)
  const analyserRef = useRef(null)
  const frameRef = useRef(null)
  const playlistRef = useRef([])
  const currentTrackRef = useRef(null)
  const locationPathRef = useRef(location.pathname)
  const ambientAudioRef = useRef(ambientAudio)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [levels, setLevels] = useState(Array.from({ length: 16 }, () => 0.2))

  useEffect(() => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'metadata'
    audioRef.current = audio

    const handleTimeUpdate = () => setProgress(audio.currentTime || 0)
    const handleLoadedMetadata = () => setDuration(audio.duration || 0)
    const handleEnded = () => {
      playNext()
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      audio.pause()
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      analyserRef.current?.audioContext?.close()
    }
  }, [])

  useEffect(() => {
    currentTrackRef.current = currentTrack
  }, [currentTrack])

  useEffect(() => {
    locationPathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    ambientAudioRef.current = ambientAudio
  }, [ambientAudio])

  useEffect(() => {
    if (location.pathname === '/music') {
      ambientAudio.duck()
      return
    }

    if (isPlaying) ambientAudio.duck()
    else ambientAudio.unduck()
  }, [location.pathname, isPlaying, ambientAudio])

  useEffect(() => {
    if (!isPlaying) return

    const tick = () => {
      const analyserData = analyserRef.current

      if (analyserData) {
        analyserData.analyser.getByteFrequencyData(analyserData.values)
        setLevels(Array.from(analyserData.values.slice(0, 16), (value) => Math.max(value / 255, 0.08)))
      } else {
        setLevels((currentLevels) => currentLevels.map((_, index) => 0.18 + Math.abs(Math.sin(Date.now() / 280 + index)) * 0.55))
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [isPlaying])

  async function playTrack(track) {
    if (!track) return

    if (track.sourceType !== 'audio') {
      audioRef.current?.pause()
      setCurrentTrack(track)
      setIsPlaying(false)
      ambientAudio.duck()
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (currentTrack?.id !== track.id) {
      audio.src = track.sourceUrl
      setProgress(0)
      setDuration(0)
      setCurrentTrack(track)
    }

    if (!analyserRef.current) analyserRef.current = createAnalyser(audio)
    await analyserRef.current?.audioContext?.resume()
    await audio.play()
    ambientAudio.duck()
    setIsPlaying(true)
  }

  function pause() {
    audioRef.current?.pause()
    setIsPlaying(false)

    if (locationPathRef.current !== '/music') ambientAudioRef.current.unduck()
  }

  async function toggle() {
    if (!currentTrack) return
    if (isPlaying) pause()
    else await playTrack(currentTrack)
  }

  function seek(seconds) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    setProgress(seconds)
  }

  function setPlaylist(tracks) {
    playlistRef.current = tracks.filter((track) => track.sourceType === 'audio')
  }

  async function playNext() {
    const playlist = playlistRef.current

    if (playlist.length === 0) {
      setIsPlaying(false)
      if (locationPathRef.current !== '/music') ambientAudioRef.current.unduck()
      return
    }

    const candidates = playlist.filter((track) => track.id !== currentTrackRef.current?.id)
    const nextTrack = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null

    if (!nextTrack) {
      setIsPlaying(false)
      if (locationPathRef.current !== '/music') ambientAudioRef.current.unduck()
      return
    }

    await playTrack(nextTrack)
  }

  const value = useMemo(
    () => ({ currentTrack, isPlaying, progress, duration, levels, playTrack, pause, toggle, seek, setPlaylist, playNext }),
    [currentTrack, isPlaying, progress, duration, levels]
  )

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (!context) throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  return context
}
