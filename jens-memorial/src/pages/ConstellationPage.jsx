import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Music, Pause, PenLine, Play, SkipBack, SkipForward, Shield, User, Volume2, VolumeX, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const { user, isAdmin } = useAuth()
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
    const colors = ['#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed']
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
      const bands = colors.map((_, index) => {
        const bandSize = Math.max(1, Math.floor((levelsRef.current.length || 1) / colors.length))
        const start = index * bandSize
        const band = levelsRef.current.slice(start, start + bandSize)
        if (!band.length) return audioEnergy
        return band.reduce((sum, level) => sum + level, 0) / band.length
      })
      const centerX = width * 0.48
      const centerY = height * 0.5
      const baseRadius = Math.min(width, height) * 0.22
      const pulse = Math.sin(frame * 0.026) * 0.35

      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'

      const coreGradient = context.createRadialGradient(centerX, centerY, 1, centerX, centerY, baseRadius * 2.2)
      coreGradient.addColorStop(0, `rgba(254, 243, 199, ${0.24 + audioEnergy * 0.2})`)
      coreGradient.addColorStop(0.38, `rgba(232, 121, 249, ${0.12 + audioEnergy * 0.12})`)
      coreGradient.addColorStop(1, 'rgba(125, 211, 252, 0)')
      context.fillStyle = coreGradient
      context.beginPath()
      context.arc(centerX, centerY, baseRadius * 2.05 + audioEnergy * 3.5, 0, Math.PI * 2)
      context.fill()

      colors.forEach((color, index) => {
        const bandEnergy = bands[index] ?? audioEnergy
        const layerRadius = baseRadius * 0.7 + index * 3.4 + pulse + bandEnergy * (3.8 + index * 0.7)
        const ringAlpha = 0.24 + index * 0.06 + bandEnergy * 0.16

        context.beginPath()
        context.arc(centerX, centerY, layerRadius, 0, Math.PI * 2)

        context.strokeStyle = color
        context.lineWidth = 0.9 + bandEnergy * 0.6
        context.shadowColor = color
        context.shadowBlur = 5 + bandEnergy * 9
        context.globalAlpha = ringAlpha
        context.stroke()
      })

      context.beginPath()
      context.arc(centerX, centerY, baseRadius * 0.34 + audioEnergy * 1.1, 0, Math.PI * 2)
      context.fillStyle = `rgba(254, 243, 199, ${0.18 + audioEnergy * 0.18})`
      context.shadowColor = '#fef3c7'
      context.shadowBlur = 9 + audioEnergy * 8
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

  const selectedMemoryRef = useRef(null)
  const showRevealOverlayRef = useRef(true)
  const hoveredNodeRef = useRef(null)

  useEffect(() => {
    selectedMemoryRef.current = selectedMemory
  }, [selectedMemory])

  useEffect(() => {
    showRevealOverlayRef.current = showRevealOverlay
  }, [showRevealOverlay])

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
      .nodeColor((node) => (node.isCoreMemory ? CORE_MEMORY_COLOR : MEMORY_TYPE_COLORS[node.type] ?? '#c4b5fd'))
      .nodeVal((node) => (node.isCoreMemory ? 5.4 : 2.4))
      .linkColor((link) => (link.source?.isCoreMemory || link.target?.isCoreMemory ? 'rgba(245,158,11,0.34)' : 'rgba(190,174,255,0.24)'))
      .linkWidth((link) => (link.source?.isCoreMemory || link.target?.isCoreMemory ? 0.72 : 0.44 * link.strength))
      .linkOpacity(0.58)
      .enableNodeDrag(false)
      .showNavInfo(false)
      .onNodeHover((node) => {
        hoveredNodeRef.current = node
        const canvasEl = graphRef.current?.querySelector('canvas')
        if (canvasEl) {
          canvasEl.style.cursor = node ? 'pointer' : 'default'
        }
      })
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

    const cameraDistance = window.innerWidth < 768 ? 800 : 500
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
    graph.controls().enablePan = false

    const ctrl = graph.controls()

    // Completely opt out of OrbitControls' 2-finger handling.
    // Setting touches.TWO to -1 makes it fall through to `default: state = NONE`
    // in the OrbitControls source — no dolly, no pan, no rotate from 2 fingers.
    ctrl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: -1 }

    // Desktop: remap right-click from pan to zoom
    ctrl.mouseButtons.RIGHT = THREE.MOUSE.DOLLY

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

      // Lock the camera target to (0,0,0) every frame to guarantee panning can never occur.
      const controls = graph.controls()
      if (controls) {
        controls.target.set(0, 0, 0)
        controls.update()
      }

      // Mobile & PC node hover/focus custom tooltip update
      const tooltip = document.getElementById('node-hover-tooltip')
      const tooltipTitle = document.getElementById('node-tooltip-title')
      const tooltipType = document.getElementById('node-tooltip-type')
      const tooltipDot = document.getElementById('node-tooltip-dot')

      if (tooltip && tooltipTitle && tooltipType && tooltipDot) {
        const isMobile = window.innerWidth < 768
        let activeNode = null

        if (selectedMemoryRef.current || showRevealOverlayRef.current) {
          activeNode = null
        } else if (isMobile) {
          // Mobile center-node focus logic
          const camera = graph.camera()
          const nodes = graph.graphData().nodes
          let minDistance = Infinity
          const tempV = new THREE.Vector3()
          const tempV2 = new THREE.Vector3()
          const camPos = camera.position

          nodes.forEach((node) => {
            let wx = node.x
            let wy = node.y
            let wz = node.z

            if (node.__threeObj) {
              node.__threeObj.getWorldPosition(tempV2)
              wx = tempV2.x
              wy = tempV2.y
              wz = tempV2.z
            } else if (node.x === undefined || node.y === undefined || node.z === undefined) {
              return
            }

            // Hemisphere check: only select nodes on the side facing the camera.
            // (0,0,0) is the center of the constellation.
            const dot = wx * camPos.x + wy * camPos.y + wz * camPos.z
            if (dot <= 0) return // Skip nodes on the backside

            tempV.set(wx, wy, wz)
            tempV.project(camera)

            if (tempV.z <= 1) {
              const distance = Math.hypot(tempV.x, tempV.y)
              if (distance < minDistance) {
                minDistance = distance
                activeNode = node
              }
            }
          })

          // Only show if the closest frontside node is within a 35% radius of the screen center
          if (minDistance > 0.35) {
            activeNode = null
          }
        } else {
          // PC hovered-node logic
          activeNode = hoveredNodeRef.current
        }

        // Project and position the tooltip exactly above the node in 2D pixels using world position
        if (activeNode && activeNode.x !== undefined && activeNode.y !== undefined && activeNode.z !== undefined) {
          const camera = graph.camera()
          const tempV = new THREE.Vector3()
          
          if (activeNode.__threeObj) {
            activeNode.__threeObj.getWorldPosition(tempV)
          } else {
            tempV.set(activeNode.x, activeNode.y, activeNode.z)
          }
          
          tempV.project(camera)

          const width = window.innerWidth
          const height = window.innerHeight

          const screenX = (tempV.x * 0.5 + 0.5) * width
          const screenY = (-tempV.y * 0.5 + 0.5) * height

          const typeColors = {
            foto: '#ffffff',
            video: '#997fff',
            quote: '#95ff9a',
            tekst: '#7dd3fc',
          }

          tooltipTitle.textContent = activeNode.title
          tooltipType.textContent = activeNode.type
          tooltipDot.style.backgroundColor = typeColors[activeNode.type] || '#ffffff'

          tooltip.style.left = `${screenX}px`
          tooltip.style.top = `${screenY}px`
          tooltip.style.opacity = '1'
        } else {
          tooltip.style.opacity = '0'
        }
      }

      animationFrameRef.current = requestAnimationFrame(animateScene)
    }

    animationFrameRef.current = requestAnimationFrame(animateScene)

    const handleResize = () => {
      graph.controls().minDistance = window.innerWidth < 768 ? 180 : 100
      graph.controls().maxDistance = window.innerWidth < 768 ? 1050 : 910
      graph.width(window.innerWidth)
      graph.height(window.innerHeight)
    }

    // ── Manual pinch-to-zoom ──────────────────────────────────────────────
    // Since we disabled OrbitControls' 2-finger handling entirely, we handle
    // pinch zoom ourselves by calling OrbitControls' internal _dollyIn/_dollyOut
    // methods directly. To prevent accidental camera rotation from touch jitter,
    // we disable rotate when 2+ fingers are down, and reset it when touches are 0.
    const canvasEl = graphRef.current?.querySelector('canvas')
    let lastPinchDist = null

    const onPinchStart = (e) => {
      if (e.touches.length >= 2) {
        ctrl.enableRotate = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastPinchDist = Math.sqrt(dx * dx + dy * dy)
        e.preventDefault()
      }
    }

    const onPinchMove = (e) => {
      if (e.touches.length >= 2 && lastPinchDist !== null) {
        ctrl.enableRotate = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const ratio = dist / lastPinchDist
        if (ratio > 1) {
          ctrl._dollyIn(ratio)
        } else {
          ctrl._dollyOut(1 / ratio)
        }
        lastPinchDist = dist
        e.preventDefault()
      }
    }

    const onPinchEnd = (e) => {
      if (e.touches.length === 0) {
        ctrl.enableRotate = true
      }
      if (e.touches.length < 2) {
        lastPinchDist = null
      }
    }

    if (canvasEl) {
      canvasEl.addEventListener('touchstart', onPinchStart, { passive: false })
      canvasEl.addEventListener('touchmove', onPinchMove, { passive: false })
      canvasEl.addEventListener('touchend', onPinchEnd)
      canvasEl.addEventListener('touchcancel', onPinchEnd)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (canvasEl) {
        canvasEl.removeEventListener('touchstart', onPinchStart)
        canvasEl.removeEventListener('touchmove', onPinchMove)
        canvasEl.removeEventListener('touchend', onPinchEnd)
        canvasEl.removeEventListener('touchcancel', onPinchEnd)
      }
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

      {/* Dynamic connected tooltip (floats exactly above target node on both PC and Mobile) */}
      <div
        id="node-hover-tooltip"
        className="pointer-events-none absolute z-20 flex flex-col items-center -translate-x-1/2 -translate-y-[calc(100%+6px)] transition-opacity duration-200 opacity-0 select-none"
        style={{ left: 0, top: 0 }}
      >
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/75 px-3 py-1.5 text-xs text-white/95 shadow-2xl backdrop-blur-md">
          <span id="node-tooltip-dot" className="h-1.5 w-1.5 rounded-full bg-white transition-colors duration-300"></span>
          <span id="node-tooltip-title" className="font-light truncate max-w-[140px]"></span>
          <span id="node-tooltip-type" className="opacity-45 uppercase tracking-wider text-[8px] font-semibold"></span>
        </div>
      </div>

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
        className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-purple-300/15 bg-black/45 px-3 py-2 shadow-2xl backdrop-blur-md transition-opacity duration-700 ${showRevealOverlay || selectedMemory ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <NavItem to="/add" label="Toevoegen" icon={<PenLine size={16} />} />
        <NavItem to="/music" label="Muziek" icon={<Music size={16} />} />
        {isAdmin ? (
          <NavItem to="/admin" label="Admin" icon={<Shield size={16} />} />
        ) : (
          <NavItem to="/profile" label="Profiel" icon={<User size={16} />} />
        )}
      </nav>

      {currentTrack && (
        <div
          className={`absolute right-4 z-20 hidden w-[min(23rem,calc(100vw-2rem))] rounded-3xl border border-purple-200/15 bg-black/35 p-4 shadow-2xl backdrop-blur-md transition-opacity duration-700 sm:right-5 sm:block ${selectedMemory ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom, 0px) + 5.75rem))' }}
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
          className={`fixed right-0 z-30 overflow-hidden transition-all duration-500 ease-out sm:hidden ${showRevealOverlay || selectedMemory ? 'pointer-events-none opacity-0' : 'opacity-100'} ${mobilePlayerOpen ? 'w-[min(22rem,calc(100vw-1rem))]' : 'w-16'}`}
          style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="h-16 overflow-hidden rounded-l-full border border-r-0 border-purple-200/15 bg-black/60 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMobilePlayerOpen(true)}
              className={`absolute left-0 top-0 z-10 flex h-16 w-16 items-center justify-center transition-opacity duration-300 ${mobilePlayerOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            >
              <span className="h-16 w-16 overflow-hidden rounded-l-full">
                <canvas ref={mobileWaveCanvasRef} className="h-full w-full" aria-hidden="true" />
              </span>
            </button>

            <div className={`flex h-16 min-w-[min(22rem,calc(100vw-1rem))] items-center gap-2.5 px-3 pr-4 transition-all duration-300 ${mobilePlayerOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-8 opacity-0'}`}>
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

function VideoPlayer({ src, poster }) {
  const videoRef = useRef(null)

  const optimizedSrc = useMemo(() => {
    if (!src || !src.includes('cloudinary.com/')) return src
    // Inject video codec auto, format auto, and quality auto parameters to ensure Cloudinary transcodes HEVC to supported formats
    return src.replace('/upload/', '/upload/vc_auto,f_auto,q_auto/')
  }, [src])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [optimizedSrc])

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      preload="metadata"
      poster={poster}
      className="max-h-[52vh] w-full object-contain bg-black/20"
      controlsList="nodownload"
      disablePictureInPicture
      disableRemotePlayback
    >
      <source src={optimizedSrc} />
      Uw browser ondersteunt geen HTML5 video.
    </video>
  )
}

function MemoryOverlay({ memory, candleLit, onToggleCandle, onClose, onPrevious, onNext }) {
  const { unduck } = useAmbientAudio()
  const [carouselIndex, setCarouselIndex] = useState(0)

  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX
  }

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].screenX
    const diff = touchStartX.current - touchEndX.current
    const assets = memory.collageData?.assets || []
    if (!assets.length) return

    if (diff > 50) {
      // Swipe left -> next slide
      setCarouselIndex((prev) => Math.min(prev + 1, assets.length - 1))
    } else if (diff < -50) {
      // Swipe right -> prev slide
      setCarouselIndex((prev) => Math.max(prev - 1, 0))
    }
  }

  useEffect(() => {
    return () => {
      // Ensure we unduck when the overlay is closed, in case a video was playing
      unduck()
    }
  }, [unduck])

  useEffect(() => {
    setCarouselIndex(0)

    const assets = memory.collageData?.assets || []
    if (assets.length <= 1) return

    let active = true

    async function preloadSequentially() {
      for (let i = 0; i < assets.length; i++) {
        if (!active) break
        const asset = assets[i]

        try {
          await new Promise((resolve) => {
            if (asset.resourceType === 'video') {
              const video = document.createElement('video')
              video.src = asset.url
              video.preload = 'auto'
              video.muted = true
              
              // Resolve when metadata is loaded (starts buffering successfully)
              video.onloadedmetadata = () => {
                resolve()
              }
              video.onerror = () => {
                resolve()
              }
              video.load()
            } else {
              const img = new Image()
              img.onload = () => {
                resolve()
              }
              img.onerror = () => {
                resolve()
              }
              img.src = asset.url
            }
          })
        } catch (e) {
          // Ignore error and continue to the next asset
        }
      }
    }

    preloadSequentially()

    return () => {
      active = false
    }
  }, [memory])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 px-5 py-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.article
        className="relative my-auto max-h-[calc(100vh-3rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-purple-200/15 bg-[#090616]/90 p-7 shadow-2xl"
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
          {memory.collageData ? 'collage' : memory.type} · {memory.date}
        </p>
        <h2 className="pr-10 text-3xl font-light leading-tight" style={{ color: 'var(--text-primary)' }}>
          {memory.title}
        </h2>
        {memory.author && (
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Ingezonden door {memory.author}
          </p>
        )}

        {(() => {
          const isCollage = (memory.type === 'foto' || memory.type === 'video') && memory.collageData
          if (isCollage) {
            const assets = memory.collageData.assets || []
            if (assets.length === 0) return null
            const currentAsset = assets[carouselIndex]

            return (
              <div className="relative mt-6 overflow-hidden rounded-2xl border border-purple-200/10 bg-black/25 select-none">
                <div
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  className="w-full flex items-center justify-center min-h-[200px]"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={carouselIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22 }}
                      className="w-full flex items-center justify-center"
                    >
                      {currentAsset.resourceType === 'video' ? (
                        <VideoPlayer src={currentAsset.url} poster={currentAsset.thumbnailUrl || undefined} />
                      ) : (
                        <img src={currentAsset.url} alt={`${memory.title} slide ${carouselIndex + 1}`} className="max-h-[52vh] w-full object-contain" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Navigation Arrows */}
                {assets.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCarouselIndex((prev) => Math.max(prev - 1, 0))}
                      disabled={carouselIndex === 0}
                      className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/70 backdrop-blur-sm transition hover:bg-black/75 hover:text-white disabled:opacity-0 disabled:pointer-events-none"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCarouselIndex((prev) => Math.min(prev + 1, assets.length - 1))}
                      disabled={carouselIndex === assets.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/70 backdrop-blur-sm transition hover:bg-black/75 hover:text-white disabled:opacity-0 disabled:pointer-events-none"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}

                {/* Dot Indicators */}
                {assets.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 bg-black/45 px-3 py-1.5 rounded-full backdrop-blur-md">
                    {assets.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCarouselIndex(i)}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === carouselIndex ? 'w-3.5 bg-white' : 'w-1.5 bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          }

          if (memory.mediaUrl) {
            return (
              <div className="mt-6 overflow-hidden rounded-2xl border border-purple-200/10 bg-black/25">
                {memory.mediaResourceType === 'video' || memory.type === 'video' ? (
                  <VideoPlayer src={memory.mediaUrl} poster={memory.mediaThumbnailUrl || undefined} />
                ) : (
                  <img src={memory.mediaUrl} alt={memory.title} className="max-h-[52vh] w-full object-contain" />
                )}
              </div>
            )
          }

          return null
        })()}

        {(() => {
          const isQuoteJson = memory.type === 'quote' && memory.quoteData
          const quoteText = isQuoteJson ? memory.quoteData.quote : memory.body
          const quoteBy = isQuoteJson ? memory.quoteData.quoteBy : null
          const month = isQuoteJson ? memory.quoteData.month : null
          const year = isQuoteJson ? memory.quoteData.year : null
          const context = isQuoteJson ? memory.quoteData.context : null

          const dateParts = []
          if (month) dateParts.push(month)
          if (year) dateParts.push(year)
          const dateString = dateParts.join(' ')

          if (memory.type === 'quote') {
            return (
              <div className="my-7">
                <div className="rounded-2xl border border-purple-200/10 bg-white/[0.03] p-6">
                  <p className="text-2xl font-light leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                    {quoteText}
                  </p>
                  {(quoteBy || dateString) && (
                    <p className="mt-4 text-right text-sm italic" style={{ color: 'var(--text-muted)' }}>
                      — {quoteBy || ''}{quoteBy && dateString ? ', ' : ''}{dateString}
                    </p>
                  )}
                </div>
                {context && (
                  <div className="mt-4 rounded-2xl border border-purple-200/10 bg-white/[0.01] p-5">
                    <p className="text-sm leading-7 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {context}
                    </p>
                  </div>
                )}
              </div>
            )
          }

          const isCollage = (memory.type === 'foto' || memory.type === 'video') && memory.collageData
          const bodyText = isCollage ? memory.collageData.caption : memory.body

          return (
            bodyText && (
              <div className="my-7 rounded-2xl border border-purple-200/10 bg-white/[0.03] p-6">
                <p className="text-sm leading-7 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                  {bodyText}
                </p>
              </div>
            )
          )
        })()}

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
