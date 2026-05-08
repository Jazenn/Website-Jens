import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Music, PenLine, Shield, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { useAmbientAudio } from '../context/AmbientAudioContext'

const CUSTOM_MEMORIES_KEY = 'jens-custom-memories'
const PULSING_MEMORIES_KEY = 'jens-pulsing-memory-ids'
const MEMORY_TYPES = ['foto', 'video', 'quote', 'tekst']
const MEMORY_TYPE_COLORS = {
  foto: '#ffffff',
  video: '#997fff',
  quote: '#95ff9a',
  tekst: '#7dd3fc',
}
const CORE_MEMORY_COLOR = '#f59e0b'
const MEMORY_TITLES = [
  'Een avond die bleef hangen',
  'Zijn lach in de kamer',
  'De rit naar huis',
  'Altijd nog één nummer',
  'Een stille grap',
  'Zomerlicht',
  'De plek aan tafel',
  'Iets wat hij zei',
  'Nachtelijke gesprekken',
  'Gouden moment',
  'Samen onderweg',
  'Een herinnering zonder woorden',
]

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

function createMemories() {
  return Array.from({ length: 96 }, (_, index) => {
    const type = MEMORY_TYPES[(index * 7 + Math.floor(index / 5)) % MEMORY_TYPES.length]
    const special = index % 13 === 0
    const { x, y, z } = getMemoryPosition(index, 96)

    return {
      id: `memory-${index}`,
      title: MEMORY_TITLES[index % MEMORY_TITLES.length],
      type,
      author: ['Griffin', 'Een vriend', 'Familie', 'Iemand die hem mist'][index % 4],
      date: `${String((index % 28) + 1).padStart(2, '0')}-06-2025`,
      special,
      candleCount: index % 13 === 0 ? 4 + (index % 5) : index % 4,
      isCoreMemory: index % 13 === 0,
      x,
      y,
      z,
      fx: x,
      fy: y,
      fz: z,
      body:
        type === 'quote'
          ? '“Sommige mensen laten licht achter, zelfs als ze er niet meer zijn.”'
          : 'Een plek voor een persoonlijke herinnering aan Jens. Later komt hier de echte tekst, foto of video die iemand heeft toegevoegd.',
    }
  })
}

function createCustomMemories(savedMemories) {
  const total = 96 + savedMemories.length

  return savedMemories.map((memory, customIndex) => {
    const index = 96 + customIndex
    const { x, y, z } = getMemoryPosition(index, total)

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
  const pointerRef = useRef({ active: false, x: 0 })
  const passiveDirectionRef = useRef(1)
  const [selectedMemory, setSelectedMemory] = useState(null)
  const { enabled: soundEnabled, toggle: toggleSound } = useAmbientAudio()
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
  const memories = useMemo(() => [...createMemories(), ...createCustomMemories(customMemories)], [customMemories])
  const graphData = useMemo(() => ({ nodes: memories, links: createLinks(memories) }), [memories])

  useEffect(() => {
    pulsingMemoryIdsRef.current = pulsingMemoryIds
  }, [pulsingMemoryIds])

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
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(124,58,237,0.18), transparent 35%), radial-gradient(circle at 20% 80%, rgba(167,139,250,0.12), transparent 30%), radial-gradient(ellipse at 70% 20%, rgba(245,158,11,0.08), transparent 28%), radial-gradient(ellipse at 15% 25%, rgba(245,158,11,0.08), transparent 32%), radial-gradient(ellipse at 80% 78%, rgba(124,58,237,0.1), transparent 34%)',
        }}
      />
      <div ref={graphRef} className="absolute inset-0" />

      <button
        type="button"
        onClick={toggleSound}
        className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-purple-300/20 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/75 shadow-2xl backdrop-blur-md transition hover:border-purple-200/40 hover:text-white"
      >
        {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        {soundEnabled ? 'Toon aan' : 'Toon uit'}
      </button>

      <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-sm">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 text-xs uppercase tracking-[0.35em]"
          style={{ color: 'var(--text-muted)' }}
        >
          Voor Jens
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl font-extralight tracking-[0.22em]"
          style={{ color: 'var(--text-primary)' }}
        >
          Constellatie
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4 text-sm leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          Draai door de herinneringen. Klik op een ster om een moment te openen.
        </motion.p>
      </div>

      <nav className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-purple-300/15 bg-black/30 px-3 py-2 shadow-2xl backdrop-blur-md">
        <NavItem to="/add" label="Toevoegen" icon={<PenLine size={16} />} />
        <NavItem to="/music" label="Muziek" icon={<Music size={16} />} />
        <NavItem to="/about" label="Over" icon={<UserRound size={16} />} />
        <NavItem to="/admin" label="Admin" icon={<Shield size={16} />} />
      </nav>

      <AnimatePresence>
        {selectedMemory && (
          <MemoryOverlay
            memory={selectedMemory}
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

function MemoryOverlay({ memory, onClose, onPrevious, onNext }) {
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
            className="flex items-center gap-2 rounded-full border border-purple-200/15 px-4 py-2 text-xs transition hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <Heart size={15} />
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
