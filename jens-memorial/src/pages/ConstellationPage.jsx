import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Music, Pause, PenLine, Play, SkipBack, SkipForward, Shield, Volume2, VolumeX, X } from 'lucide-react'
import { useAmbientAudio } from '../context/AmbientAudioContext'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { JOURNEY_TRANSITION_KEY } from '../lib/journey'
import { CORE_MEMORY_CANDLE_THRESHOLD, fetchMemories, fetchUserCandleIds, lightCandle, removeCandle } from '../lib/memories'

const CUSTOM_MEMORIES_KEY = 'jens-custom-memories'
const PULSING_MEMORIES_KEY = 'jens-pulsing-memory-ids'
const LIT_CANDLES_KEY = 'jens-lit-candle-memory-ids'
const MEMORY_TYPES = ['foto', 'video', 'quote', 'tekst']
const REVEAL_STARS = Array.from({ length: 90 }, (_, index) => ({
  id: index,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  delay: Math.random() * 4,
  duration: Math.random() * 3 + 2,
}))
const MEMORY_TYPE_COLORS = {
  foto: '#ffffff',
  video: '#997fff',
  quote: '#95ff9a',
  tekst: '#7dd3fc',
}
const CORE_MEMORY_COLOR = '#f59e0b'
const CONSTELLATION_REVEAL_MIN_MS = 1700

function getMemoryPosition(index, total) {
  const cluster = index % 4
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total)
  const theta = index * Math.PI * (3 - Math.sqrt(5))
  const radius = 140 + Math.sin(index * 1.7) * 4 + cluster * 1.4

  return {
    x: radius * Math.cos(theta) * Math.sin(phi),
    y: radius * Math.sin(theta) * Math.sin(phi),
    z: radius * Math.cos(phi),
  }
}

function createCustomMemories(savedMemories) {
  const total = Math.max(savedMemories.length, 1)

  return savedMemories.map((memory, customIndex) => {
    const { x, y, z } = getMemoryPosition(customIndex, total)

    return {
      ...memory,
      special: false,
      x,
      y,
      z,
      fx: x,
      fy: y,
      fz: z,
    }
  })
}

function createLinks(nodes) {
  const linksByKey = new Map()

  nodes.forEach((node) => {
    const nearest = nodes
      .filter((candidate) => candidate.id !== node.id)
      .map((candidate) => ({
        candidate,
        distance: Math.hypot(node.x - candidate.x, node.y - candidate.y, node.z - candidate.z),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, node.special ? 5 : 4)

    nearest.forEach(({ candidate }, nearestIndex) => {
      const key = [node.id, candidate.id].sort().join('-')
      if (!linksByKey.has(key)) {
        linksByKey.set(key, {
          source: node.id,
          target: candidate.id,
          strength: node.special || candidate.special ? 1 : 0.65 + nearestIndex * 0.08,
        })
      }
    })
  })

  return Array.from(linksByKey.values())
}

function createStarField(count, radius, color, size, opacity) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const baseColor = new THREE.Color(color)

  for (let index = 0; index < count; index += 1) {
    const phi = Math.acos(1 - (2 * (index + 0.5)) / count)
    const theta = index * Math.PI * (3 - Math.sqrt(5))
    const drift = radius + Math.sin(index * 12.9898) * 140 + Math.cos(index * 4.711) * 55
    const warmth = 0.82 + ((Math.sin(index * 78.233) + 1) / 2) * 0.32
    const scale =
      index % 41 === 0 ? 3.1 : index % 17 === 0 ? 2.25 : 0.9 + ((Math.cos(index * 19.19) + 1) / 2) * 1.15
    const starColor = baseColor.clone().multiplyScalar(warmth)

    positions[index * 3] = drift * Math.cos(theta) * Math.sin(phi)
    positions[index * 3 + 1] = drift * Math.sin(theta) * Math.sin(phi)
    positions[index * 3 + 2] = drift * Math.cos(phi)

    colors[index * 3] = starColor.r
    colors[index * 3 + 1] = starColor.g
    colors[index * 3 + 2] = starColor.b
    sizes[index] = size * scale
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {},
    vertexColors: true,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (660.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;
        float core = smoothstep(0.5, 0.22, dist);
        gl_FragColor = vec4(vColor * (0.82 + core * 0.35), 1.0);
      }
    `,
  })

  return new THREE.Points(geometry, material)
}

export default function ConstellationPage() {
  const graphRef = useRef(null)
  const graphInstanceRef = useRef(null)
  const animationFrameRef = useRef(null)
  const mobileWaveCanvasRef = useRef(null)
  const levelsRef = useRef([])
  const pointerRef = useRef({ active: false, x: 0 })
  const passiveDirectionRef = useRef(1)
  const [selectedMemory, setSelectedMemory] = useState(null)
  const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false)
  const { enabled: soundEnabled, toggle: toggleSound } = useAmbientAudio()
  const { currentTrack, isPlaying, levels, toggle: toggleMusic, playNext, playPrevious } = useMusicPlayer()
  const { user } = useAuth()
  const [remoteMemories, setRemoteMemories] = useState([])
  const [revealReady, setRevealReady] = useState(() => sessionStorage.getItem(JOURNEY_TRANSITION_KEY) !== 'true')
  const [loadingMemories, setLoadingMemories] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [litCandleIds, setLitCandleIds] = useState([])
  const [visitedMemoryIds, setVisitedMemoryIds] = useState([])
  const revealOverlayActive = sessionStorage.getItem(JOURNEY_TRANSITION_KEY) === 'true'

  useEffect(() => {
    levelsRef.current = levels
  }, [levels])

  useEffect(() => {
    const canvas = mobileWaveCanvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    const colors = ['#fef3c7', '#f59e0b', '#fb7185', '#e879f9', '#7dd3fc']
    let frame = 0
    let animationFrame = null

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      canvas.width = rect.width * scale
      canvas.height = rect.height * scale
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const audioEnergy = levelsRef.current.length
        ? levelsRef.current.reduce((sum, level) => sum + level, 0) / levelsRef.current.length
        : 0.22
      const centerX = width * 0.43
      const centerY = height * 0.5
      const baseRadius = Math.min(width, height) * 0.22
      const pulse = Math.sin(frame * 0.045) * 1.4

      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'

      const coreGradient = context.createRadialGradient(centerX, centerY, 1, centerX, centerY, baseRadius * 2.2)
      coreGradient.addColorStop(0, `rgba(254, 243, 199, ${0.24 + audioEnergy * 0.2})`)
      coreGradient.addColorStop(0.38, `rgba(232, 121, 249, ${0.12 + audioEnergy * 0.12})`)
      coreGradient.addColorStop(1, 'rgba(125, 211, 252, 0)')
      context.fillStyle = coreGradient
      context.beginPath()
      context.arc(centerX, centerY, baseRadius * 2.15 + audioEnergy * 7, 0, Math.PI * 2)
      context.fill()

      colors.forEach((color, index) => {
        const points = 96
        const layerRadius = baseRadius + index * 1.7 + pulse
        const warp = 2.2 + audioEnergy * 7 + index * 0.9
        const rotation = frame * (0.006 + index * 0.0018)

        context.beginPath()
        for (let point = 0; point <= points; point += 1) {
          const angle = (point / points) * Math.PI * 2
          const level = levelsRef.current[(point + index * 7) % Math.max(levelsRef.current.length, 1)] ?? audioEnergy
          const radius =
            layerRadius +
            Math.sin(angle * 3 + rotation * 9 + index) * warp * 0.45 +
            Math.sin(angle * 7 - rotation * 13 + index * 1.8) * warp * 0.22 +
            level * (3.5 + index * 0.6)
          const x = centerX + Math.cos(angle + rotation) * radius
          const y = centerY + Math.sin(angle + rotation) * radius * 0.96

          if (point === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.closePath()

        context.strokeStyle = color
        context.lineWidth = 1.05
        context.shadowColor = color
        context.shadowBlur = 7 + audioEnergy * 12
        context.globalAlpha = 0.34 + index * 0.09
        context.stroke()
      })

      context.beginPath()
      context.arc(centerX, centerY, baseRadius * 0.34 + audioEnergy * 2, 0, Math.PI * 2)
      context.fillStyle = `rgba(254, 243, 199, ${0.22 + audioEnergy * 0.24})`
      context.shadowColor = '#fef3c7'
      context.shadowBlur = 12 + audioEnergy * 12
      context.fill()

      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      frame += 1
      animationFrame = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      if (animationFrame) cancelAnimationFrame(animationFrame)
    }
  }, [])

  const [customMemories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_MEMORIES_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [pulsingMemoryIds, setPulsingMemoryIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PULSING_MEMORIES_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const pulsingMemoryIdsRef = useRef(pulsingMemoryIds)
  const memories = useMemo(() => createCustomMemories([...customMemories, ...remoteMemories]), [customMemories, remoteMemories])
  const graphData = useMemo(() => ({ nodes: memories, links: createLinks(memories) }), [memories])
  const showRevealOverlay = !revealReady || loadingMemories

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRevealReady(true)
    }, CONSTELLATION_REVEAL_MIN_MS)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (showRevealOverlay) return

    if (sessionStorage.getItem(JOURNEY_TRANSITION_KEY) === 'true') {
      sessionStorage.removeItem(JOURNEY_TRANSITION_KEY)
    }
  }, [showRevealOverlay])


  useEffect(() => {
    pulsingMemoryIdsRef.current = pulsingMemoryIds
  }, [pulsingMemoryIds])

  useEffect(() => {
    if (!user?.id) {
      setLoadingMemories(false)
      return
    }

    let cancelled = false

    async function loadRemoteData() {
      try {
        setLoadingMemories(true)
        const [loadedMemories, loadedCandleIds] = await Promise.all([fetchMemories(), fetchUserCandleIds(user.id)])
        if (cancelled) return
        setRemoteMemories(loadedMemories)
        setLitCandleIds(loadedCandleIds)
      } catch (error) {
        console.error('Kon herinneringen niet laden uit Supabase:', error)
      } finally {
        if (!cancelled) setLoadingMemories(false)
      }
    }

    loadRemoteData()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (!graphRef.current) return

    const graph = ForceGraph3D()(graphRef.current)
      .graphData(graphData)
      .backgroundColor('rgba(0,0,0,0)')
      .nodeLabel((node) => `${node.title} · ${node.type}`)
      .nodeColor((node) => (node.isCoreMemory ? CORE_MEMORY_COLOR : MEMORY_TYPE_COLORS[node.type] ?? '#c4b5fd'))
      .nodeVal((node) => (node.isCoreMemory ? 5.4 : 2.4))
      .linkColor((link) => (link.source?.isCoreMemory || link.target?.isCoreMemory ? 'rgba(245,158,11,0.34)' : 'rgba(190,174,255,0.24)'))
      .linkWidth((link) => (link.source?.isCoreMemory || link.target?.isCoreMemory ? 0.72 : 0.44 * link.strength))
      .linkOpacity(0.58)
      .enableNodeDrag(false)
      .showNavInfo(false)
      .onNodeClick((node) => {
        setSelectedMemory(node)

        if (pulsingMemoryIdsRef.current.includes(node.id)) {
          const nextIds = pulsingMemoryIdsRef.current.filter((id) => id !== node.id)
          pulsingMemoryIdsRef.current = nextIds
          setPulsingMemoryIds(nextIds)
          localStorage.setItem(PULSING_MEMORIES_KEY, JSON.stringify(nextIds))
          const pulse = node.__threeObj?.userData?.pulse

          if (pulse) {
            pulse.userData.isPulse = false
            pulse.material.opacity = 0
          }
        }
      })
      .nodeThreeObject((node) => {
        const color = node.isCoreMemory ? CORE_MEMORY_COLOR : MEMORY_TYPE_COLORS[node.type] ?? '#c4b5fd'
        const isPulsing = pulsingMemoryIdsRef.current.includes(node.id)
        const group = new THREE.Group()
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(node.isCoreMemory ? 3.9 : 2.4, 24, 24),
          new THREE.MeshBasicMaterial({ color })
        )
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(node.isCoreMemory ? 9.5 : 5, 24, 24),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: node.isCoreMemory ? 0.24 : 0.09,
            blending: THREE.AdditiveBlending,
          })
        )
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(node.isCoreMemory ? 13 : 8.5, 24, 24),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: isPulsing ? 0.28 : 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
        pulse.userData = { isPulse: isPulsing }
        group.userData = { pulse }
        group.add(pulse)
        group.add(glow)
        group.add(sphere)
        return group
      })

    const cameraDistance = window.innerWidth < 768 ? 1050 : 500
    graph.cameraPosition({ x: 0, y: 0, z: cameraDistance }, { x: 0, y: 0, z: 0 }, 1200)
    graph.cooldownTicks(1)
    graph.d3Force('charge', null)
    graph.d3Force('center', null)
    graph.controls().enableDamping = true
    graph.controls().dampingFactor = 0.045
    graph.controls().rotateSpeed = 0.45
    graph.controls().autoRotate = true
    graph.controls().autoRotateSpeed = 0.32
    graph.controls().minDistance = window.innerWidth < 768 ? 180 : 100
    graph.controls().maxDistance = window.innerWidth < 768 ? 1050 : 910
    graph.resumeAnimation()
    graphInstanceRef.current = graph

    const universe = new THREE.Group()
    universe.add(createStarField(320, 2600, '#f8fbff', 5.4, 0.78))
    universe.add(createStarField(180, 3400, '#dbeafe', 7.2, 0.52))
    universe.add(createStarField(42, 3000, '#fecdd3', 9.6, 0.44))
    graph.scene().add(universe)

    let lastTime = performance.now()
    let elapsed = 0

    const animateScene = (time) => {
      const delta = Math.min((time - lastTime) / 1000, 0.04)
      lastTime = time
      elapsed += delta

      graph.scene().rotation.y += delta * 0.055 * passiveDirectionRef.current
      graph.scene().rotation.x = Math.sin(elapsed * 0.32) * 0.025
      graph.graphData().nodes.forEach((node) => {
        const object = node.__threeObj
        const pulse = object?.userData?.pulse

        if (pulse?.userData?.isPulse) {
          const scale = 1 + Math.sin(elapsed * 3.2) * 0.22
          pulse.scale.setScalar(scale)
          pulse.material.opacity = 0.16 + ((Math.sin(elapsed * 3.2) + 1) / 2) * 0.22
        }
      })

      graph.controls().update()

      animationFrameRef.current = requestAnimationFrame(animateScene)
    }

    animationFrameRef.current = requestAnimationFrame(animateScene)

    const handleResize = () => {
      graph.controls().minDistance = window.innerWidth < 768 ? 180 : 100
      graph.controls().maxDistance = window.innerWidth < 768 ? 1050 : 910
      graph.width(window.innerWidth)
      graph.height(window.innerHeight)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      graph.scene().remove(universe)
      universe.children.forEach((child) => {
        child.geometry?.dispose()
        child.material?.dispose()
      })
      graph._destructor()
      graphInstanceRef.current = null
    }
  }, [graphData])

  function goToMemory(direction) {
    if (!selectedMemory) return
    const currentIndex = memories.findIndex((memory) => memory.id === selectedMemory.id)
    const nextIndex = (currentIndex + direction + memories.length) % memories.length
    setSelectedMemory(memories[nextIndex])
  }

  async function toggleCandle(memoryId) {
    const candleWasLit = litCandleIds.includes(memoryId)
    const candleDelta = candleWasLit ? -1 : 1

    const updateMemoryCandleCount = (memory) => {
      if (memory.id !== memoryId) return memory

      const candleCount = Math.max((memory.candleCount ?? 0) + candleDelta, 0)
      return {
        ...memory,
        candleCount,
        isCoreMemory: memory.isPinnedCoreMemory || candleCount >= CORE_MEMORY_CANDLE_THRESHOLD,
      }
    }

    setLitCandleIds((currentIds) => {
      const nextIds = currentIds.includes(memoryId)
        ? currentIds.filter((id) => id !== memoryId)
        : [...currentIds, memoryId]

      localStorage.setItem(LIT_CANDLES_KEY, JSON.stringify(nextIds))
      return nextIds
    })
    setRemoteMemories((currentMemories) => currentMemories.map(updateMemoryCandleCount))
    setSelectedMemory((currentMemory) => (currentMemory?.id === memoryId ? updateMemoryCandleCount(currentMemory) : currentMemory))

    if (!user?.id) return

    try {
      if (candleWasLit) await removeCandle(memoryId, user.id)
      else await lightCandle(memoryId, user.id)
    } catch (error) {
      console.error('Kon kaarsje niet opslaan:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      setLitCandleIds((currentIds) => {
        const rollbackIds = candleWasLit
          ? [...new Set([...currentIds, memoryId])]
          : currentIds.filter((id) => id !== memoryId)

        localStorage.setItem(LIT_CANDLES_KEY, JSON.stringify(rollbackIds))
        return rollbackIds
      })
      setRemoteMemories((currentMemories) =>
        currentMemories.map((memory) => {
          if (memory.id !== memoryId) return memory

          const candleCount = Math.max((memory.candleCount ?? 0) - candleDelta, 0)
          return {
            ...memory,
            candleCount,
            isCoreMemory: memory.isPinnedCoreMemory || candleCount >= CORE_MEMORY_CANDLE_THRESHOLD,
          }
        })
      )
    }
  }

  function handlePointerDown(event) {
    pointerRef.current = { active: true, x: event.clientX }
  }

  function handlePointerMove(event) {
    if (!pointerRef.current.active || !graphInstanceRef.current) return

    const deltaX = event.clientX - pointerRef.current.x
    pointerRef.current.x = event.clientX

    if (Math.abs(deltaX) > 1.5) {
      const direction = deltaX > 0 ? 1 : -1
      passiveDirectionRef.current = direction
      graphInstanceRef.current.controls().autoRotateSpeed = 0.32 * direction
    }
  }

  function handlePointerUp() {
    pointerRef.current.active = false
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'var(--cosmic-bg)' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${showRevealOverlay ? 'opacity-0' : 'opacity-100'}`}
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(124,58,237,0.18), transparent 35%), radial-gradient(circle at 20% 80%, rgba(167,139,250,0.12), transparent 30%), radial-gradient(ellipse at 70% 20%, rgba(245,158,11,0.08), transparent 28%), radial-gradient(ellipse at 15% 25%, rgba(245,158,11,0.08), transparent 32%), radial-gradient(ellipse at 80% 78%, rgba(124,58,237,0.1), transparent 34%)',
        }}
      />
      <div ref={graphRef} className={`absolute inset-0 transition-opacity duration-700 ${showRevealOverlay ? 'opacity-0' : 'opacity-100'}`} />

      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundEnabled ? 'Ambient geluid uitzetten' : 'Ambient geluid aanzetten'}
        title={soundEnabled ? 'Ambient geluid uitzetten' : 'Ambient geluid aanzetten'}
        className={`absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-purple-300/20 bg-black/35 px-3 py-3 text-xs uppercase tracking-[0.22em] text-white/75 shadow-2xl backdrop-blur-md transition hover:border-purple-200/40 hover:text-white sm:px-4 sm:py-2 ${showRevealOverlay ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        <span className="hidden sm:inline">Ambient</span>
      </button>

      <div className={`pointer-events-none absolute left-5 top-6 z-10 max-w-[14rem] transition-opacity duration-700 sm:left-6 sm:max-w-sm ${showRevealOverlay ? 'opacity-0' : 'opacity-100'}`}>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 text-[0.65rem] uppercase tracking-[0.32em] sm:text-xs sm:tracking-[0.35em]"
          style={{ color: 'var(--text-muted)' }}
        >
          Voor Jens
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl font-extralight tracking-[0.2em] sm:text-3xl sm:tracking-[0.22em]"
          style={{ color: 'var(--text-primary)' }}
        >
          Constellatie
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4 hidden text-sm leading-relaxed sm:block"
          style={{ color: 'var(--text-muted)' }}
        >
          Draai door de herinneringen. Klik op een ster om een moment te openen.
        </motion.p>
      </div>

      <AnimatePresence>
        {showRevealOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: 'easeInOut' }}
            className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-[var(--cosmic-bg)]"
          >
            {REVEAL_STARS.map((star) => (
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
            <div className="relative z-10 flex items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.82, opacity: 0 }}
                animate={{ scale: [0.82, 1.05, 1.22], opacity: [0, 0.92, 0.72] }}
                transition={{ duration: 1.7, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                className="h-44 w-44 rounded-full border border-purple-200/30 bg-purple-200/10 shadow-[0_0_90px_rgba(196,181,253,0.32)]"
              />
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.25 }}
                className="absolute mt-64 text-xs uppercase tracking-[0.38em] text-white/45"
              >
                De sterren vormen zich
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loadingMemories && memories.length === 0 && !showRevealOverlay && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 top-1/2 z-10 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-purple-200/15 bg-black/35 p-7 text-center shadow-2xl backdrop-blur-md"
        >
          <p className="text-xs uppercase tracking-[0.32em] text-white/40">Nog geen sterren</p>
          <h2 className="mt-3 text-2xl font-light tracking-[0.12em] text-white">Begin de constellatie</h2>
          <p className="mt-4 text-sm leading-7 text-white/55">
            Voeg de eerste foto, video, quote of herinnering toe om Jens zijn constellatie te vullen.
          </p>
          <Link
            to="/add"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-purple-100"
          >
            <PenLine size={16} />
            Eerste herinnering toevoegen
          </Link>
        </motion.div>
      )}

      <nav
        className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-purple-300/15 bg-black/45 px-3 py-2 shadow-2xl backdrop-blur-md transition-opacity duration-700 ${showRevealOverlay ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        style={{ bottom: 'clamp(4.5rem, calc(env(safe-area-inset-bottom, 0px) + 8svh), 7rem)' }}
      >
        <NavItem to="/add" label="Toevoegen" icon={<PenLine size={16} />} />
        <NavItem to="/music" label="Muziek" icon={<Music size={16} />} />
        <NavItem to="/admin" label="Admin" icon={<Shield size={16} />} />
      </nav>

      {currentTrack && (
        <div
          className="absolute right-4 z-20 hidden w-[min(23rem,calc(100vw-2rem))] rounded-3xl border border-purple-200/15 bg-black/35 p-4 shadow-2xl backdrop-blur-md sm:right-5 sm:block"
          style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5.75rem))' }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={playPrevious}
              disabled={currentTrack.sourceType !== 'audio'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 disabled:opacity-40"
            >
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              onClick={toggleMusic}
              disabled={currentTrack.sourceType !== 'audio'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-purple-200/25 bg-purple-200/15 text-white transition hover:bg-purple-200/25 disabled:opacity-40"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={playNext}
              disabled={currentTrack.sourceType !== 'audio'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 disabled:opacity-40"
            >
              <SkipForward size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{currentTrack.title}</p>
              <p className="truncate text-xs text-white/40">
                {currentTrack.artist || (currentTrack.sourceType === 'audio' ? 'Audio speelt door' : 'Link geselecteerd op muziekpagina')}
              </p>
              <div className="mt-2 flex h-5 items-end gap-0.5">
                {levels.slice(0, 14).map((level, index) => (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-purple-200"
                    style={{ height: `${Math.max(level * 100, 15)}%`, opacity: 0.35 + level * 0.65 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {currentTrack && (
        <div
          className={`fixed right-0 z-30 overflow-hidden transition-all duration-500 ease-out sm:hidden ${showRevealOverlay ? 'pointer-events-none opacity-0' : 'opacity-100'} ${mobilePlayerOpen ? 'w-[min(22rem,calc(100vw-1rem))]' : 'w-16'}`}
          style={{ bottom: 'clamp(9rem, calc(env(safe-area-inset-bottom, 0px) + 17svh), 13rem)' }}
        >
          <div className="h-16 overflow-hidden rounded-l-full border border-r-0 border-purple-200/15 bg-black/60 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMobilePlayerOpen(true)}
              className={`absolute left-0 top-0 flex h-16 w-16 items-center justify-center transition-opacity duration-300 ${mobilePlayerOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            >
              <span className="h-16 w-16 overflow-hidden rounded-l-full">
                <canvas ref={mobileWaveCanvasRef} className="h-full w-full" aria-hidden="true" />
              </span>
            </button>

            <div className={`flex h-16 min-w-[min(22rem,calc(100vw-1rem))] items-center gap-2.5 px-3 pr-4 transition-all duration-300 ${mobilePlayerOpen ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}>
                <button
                  type="button"
                  onClick={playPrevious}
                  disabled={currentTrack.sourceType !== 'audio'}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 disabled:opacity-40"
                >
                  <SkipBack size={15} />
                </button>
                <button
                  type="button"
                  onClick={toggleMusic}
                  disabled={currentTrack.sourceType !== 'audio'}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-200/25 bg-purple-200/15 text-white disabled:opacity-40"
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={playNext}
                  disabled={currentTrack.sourceType !== 'audio'}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 disabled:opacity-40"
                >
                  <SkipForward size={15} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-white">{currentTrack.title}</p>
                  <p className="truncate text-[0.65rem] text-white/40">{currentTrack.artist || 'Muziekspeler'}</p>
                </div>
                <div className="h-11 w-24 shrink-0 overflow-hidden">
                  <div className="flex h-full items-end justify-end gap-0.5">
                    {levels.slice(0, 16).map((level, index) => (
                      <span
                        key={index}
                        className="w-0.5 rounded-full bg-purple-200"
                        style={{ height: `${Math.max(level * 34, 6)}px`, opacity: 0.24 + level * 0.62 }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobilePlayerOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/60"
                >
                  <X size={14} />
                </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedMemory && (
          <MemoryOverlay
            memory={selectedMemory}
            candleLit={litCandleIds.includes(selectedMemory.id)}
            onToggleCandle={() => toggleCandle(selectedMemory.id)}
            onClose={() => setSelectedMemory(null)}
            onPrevious={() => goToMemory(-1)}
            onNext={() => goToMemory(1)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function NavItem({ to, label, icon }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-full px-3 py-2 text-xs transition hover:bg-white/10"
      style={{ color: 'var(--text-muted)' }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
}

function MemoryOverlay({ memory, candleLit, onToggleCandle, onClose, onPrevious, onNext }) {
  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-5 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.article
        className="relative w-full max-w-xl rounded-3xl border border-purple-200/15 bg-[#090616]/90 p-7 shadow-2xl"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-purple-100/50 transition hover:bg-white/10 hover:text-purple-100"
        >
          <X size={18} />
        </button>

        <p className="mb-4 text-xs uppercase tracking-[0.3em]" style={{ color: memory.special ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
          {memory.type} · {memory.date}
        </p>
        <h2 className="pr-10 text-3xl font-light leading-tight" style={{ color: 'var(--text-primary)' }}>
          {memory.title}
        </h2>
        {memory.author && (
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Toegevoegd door {memory.author}
          </p>
        )}

        {memory.mediaUrl && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-purple-200/10 bg-black/25">
            {memory.mediaResourceType === 'video' || memory.type === 'video' ? (
              <video src={memory.mediaUrl} poster={memory.mediaThumbnailUrl || undefined} className="max-h-[52vh] w-full object-contain" controls />
            ) : (
              <img src={memory.mediaUrl} alt={memory.title} className="max-h-[52vh] w-full object-contain" />
            )}
          </div>
        )}

        {memory.body && (
          <div className="my-7 rounded-2xl border border-purple-200/10 bg-white/[0.03] p-6">
            <p className={memory.type === 'quote' ? 'text-2xl font-light leading-relaxed' : 'text-sm leading-7'} style={{ color: 'var(--text-primary)' }}>
              {memory.body}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggleCandle()
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition ${
              candleLit ? 'border-rose-200/35 bg-rose-300/12 text-rose-100' : 'border-purple-200/15 hover:bg-white/10'
            }`}
            style={{ color: candleLit ? '#fecdd3' : 'var(--text-muted)' }}
          >
            <Heart size={15} fill={candleLit ? 'currentColor' : 'none'} />
            Kaarsje
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrevious}
              className="rounded-full border border-purple-200/15 px-4 py-2 text-xs transition hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
            >
              Vorige
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-full border border-purple-200/15 px-4 py-2 text-xs transition hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
            >
              Volgende
            </button>
          </div>
        </div>
      </motion.article>
    </motion.div>
  )
}
