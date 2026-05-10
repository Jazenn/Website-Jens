import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const AMBIENT_AUDIO_SRC = '/audio/Space Ambient  Music ★ Pure Cosmic Relaxation ★ Mind Relaxation [gCWaRhNUvfc].mp3'
const AmbientAudioContext = createContext(null)

function createAmbientPlayer() {
  const audio = new Audio(AMBIENT_AUDIO_SRC)
  const fadeDuration = 6
  const maxVolume = 0.42
  let fadeFrame = null
  let loopFrame = null
  let manuallyStopped = false

  audio.preload = 'auto'
  audio.volume = 0

  const fadeTo = (targetVolume, duration = fadeDuration, onComplete) => {
    if (fadeFrame) cancelAnimationFrame(fadeFrame)
    const startVolume = audio.volume
    const startedAt = performance.now()

    const tick = (time) => {
      const progress = Math.min((time - startedAt) / (duration * 1000), 1)
      audio.volume = startVolume + (targetVolume - startVolume) * progress

      if (progress < 1) {
        fadeFrame = requestAnimationFrame(tick)
        return
      }

      fadeFrame = null
      onComplete?.()
    }

    fadeFrame = requestAnimationFrame(tick)
  }

  const play = async (fadeSeconds = 2.2) => {
    manuallyStopped = false
    await audio.play()
    fadeTo(maxVolume, fadeSeconds)
  }

  const monitorLoop = () => {
    if (!manuallyStopped && audio.duration && audio.duration - audio.currentTime <= fadeDuration) {
      fadeTo(0, fadeDuration, () => {
        audio.currentTime = 0
        audio.play().catch((error) => {
          console.error('Kon achtergrondmuziek niet opnieuw starten:', error)
        })
        fadeTo(maxVolume, fadeDuration)
      })
    }

    loopFrame = requestAnimationFrame(monitorLoop)
  }

  loopFrame = requestAnimationFrame(monitorLoop)

  return {
    play,
    duck() {
      fadeTo(0, 4)
    },
    unduck() {
      if (!manuallyStopped && !audio.paused) fadeTo(maxVolume, 4)
    },
    stop(reset = false) {
      manuallyStopped = true
      fadeTo(0, 1.2, () => {
        audio.pause()
        if (reset) audio.currentTime = 0
      })
    },
    destroy() {
      manuallyStopped = true
      if (fadeFrame) cancelAnimationFrame(fadeFrame)
      if (loopFrame) cancelAnimationFrame(loopFrame)
      audio.pause()
    },
  }
}

export function AmbientAudioProvider({ children }) {
  const [enabled, setEnabled] = useState(true)
  const playerRef = useRef(createAmbientPlayer())
  const [blocked, setBlocked] = useState(false)

  const start = async () => {
    if (!playerRef.current) playerRef.current = createAmbientPlayer()

    try {
      await playerRef.current.play()
      setBlocked(false)
    } catch (error) {
      console.error('Kon achtergrondmuziek niet starten:', error)
      setBlocked(true)
    }
  }

  const stop = () => {
    playerRef.current?.stop()
  }

  const duck = () => {
    playerRef.current?.duck()
  }

  const unduck = () => {
    if (enabled) playerRef.current?.unduck()
  }

  const toggle = async () => {
    if (enabled) {
      setEnabled(false)
      stop()
      return
    }

    setEnabled(true)
    await start()
  }

  useEffect(() => {
    if (!enabled) {
      stop()
      return
    }

    start()
  }, [enabled])

  useEffect(() => {
    const unlockAudio = () => {
      if (enabled && blocked) start()
    }

    document.addEventListener('pointerdown', unlockAudio)
    document.addEventListener('keydown', unlockAudio)

    return () => {
      document.removeEventListener('pointerdown', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
    }
  }, [enabled, blocked])

  useEffect(() => {
    const handleVideoPlay = (event) => {
      const video = event.target
      if (video instanceof HTMLVideoElement && !video.muted && video.volume > 0) {
        playerRef.current?.duck()
      }
    }

    const handleVideoEnd = (event) => {
      const video = event.target
      if (video instanceof HTMLVideoElement) {
        playerRef.current?.unduck()
      }
    }

    document.addEventListener('play', handleVideoPlay, true)
    document.addEventListener('pause', handleVideoEnd, true)
    document.addEventListener('ended', handleVideoEnd, true)

    return () => {
      document.removeEventListener('play', handleVideoPlay, true)
      document.removeEventListener('pause', handleVideoEnd, true)
      document.removeEventListener('ended', handleVideoEnd, true)
    }
  }, [])

  useEffect(() => {
    return () => {
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  const value = useMemo(() => ({ enabled, blocked, toggle, start, duck, unduck }), [enabled, blocked])

  return <AmbientAudioContext.Provider value={value}>{children}</AmbientAudioContext.Provider>
}

export function useAmbientAudio() {
  const context = useContext(AmbientAudioContext)
  if (!context) throw new Error('useAmbientAudio must be used within AmbientAudioProvider')
  return context
}
