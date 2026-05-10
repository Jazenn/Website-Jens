import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileText, Flame, Image, Music, Quote, RefreshCw, Star, Trash2, Video } from 'lucide-react'
import { deleteMemory, fetchMemories, updateMemoryCoreStatus } from '../lib/memories'
import { deleteTrack, fetchTracks } from '../lib/tracks'

const TABS = [
  { id: 'foto', label: "Foto's", icon: Image },
  { id: 'video', label: "Video's", icon: Video },
  { id: 'quote', label: 'Quotes', icon: Quote },
  { id: 'tekst', label: 'Teksten', icon: FileText },
  { id: 'music', label: 'Muziek', icon: Music },
]

const TYPE_ICONS = {
  foto: Image,
  video: Video,
  quote: Quote,
  tekst: FileText,
}

function sortNewestFirst(items) {
  return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('foto')
  const [memories, setMemories] = useState([])
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const groupedMemories = useMemo(
    () => ({
      foto: sortNewestFirst(memories.filter((memory) => memory.type === 'foto')),
      video: sortNewestFirst(memories.filter((memory) => memory.type === 'video')),
      quote: sortNewestFirst(memories.filter((memory) => memory.type === 'quote')),
      tekst: sortNewestFirst(memories.filter((memory) => memory.type === 'tekst')),
    }),
    [memories]
  )
  const sortedTracks = useMemo(() => sortNewestFirst(tracks), [tracks])

  async function loadAdminContent() {
    try {
      setLoading(true)
      setError('')
      const [loadedMemories, loadedTracks] = await Promise.all([fetchMemories(), fetchTracks()])
      setMemories(loadedMemories)
      setTracks(loadedTracks)
    } catch (loadError) {
      setError(loadError.message || 'Kon admin content niet laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdminContent()
  }, [])

  async function handleDeleteMemory(memory) {
    const confirmed = window.confirm(`Weet je zeker dat je "${memory.title}" wilt verwijderen?`)
    if (!confirmed) return

    try {
      setBusyId(memory.id)
      await deleteMemory(memory.id)
      setMemories((currentMemories) => currentMemories.filter((item) => item.id !== memory.id))
    } catch (deleteError) {
      setError(deleteError.message || 'Verwijderen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteTrack(track) {
    const confirmed = window.confirm(`Weet je zeker dat je "${track.title}" wilt verwijderen?`)
    if (!confirmed) return

    try {
      setBusyId(track.id)
      await deleteTrack(track.id)
      setTracks((currentTracks) => currentTracks.filter((item) => item.id !== track.id))
    } catch (deleteError) {
      setError(deleteError.message || 'Nummer verwijderen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleCore(memory) {
    try {
      setBusyId(memory.id)
      const updatedMemory = await updateMemoryCoreStatus(memory.id, !memory.isPinnedCoreMemory)
      setMemories((currentMemories) => currentMemories.map((item) => (item.id === memory.id ? updatedMemory : item)))
    } catch (updateError) {
      setError(updateError.message || 'Core memory aanpassen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  const activeItems = activeTab === 'music' ? sortedTracks : groupedMemories[activeTab]

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6" style={{ background: 'var(--cosmic-bg)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(245,158,11,0.12), transparent 28%), radial-gradient(circle at 80% 15%, rgba(153,127,255,0.16), transparent 30%), radial-gradient(circle at 50% 90%, rgba(125,211,252,0.09), transparent 34%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur-md transition hover:border-white/25 hover:text-white"
          >
            <ArrowLeft size={16} />
            Terug
          </Link>

          <button
            type="button"
            onClick={loadAdminContent}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-purple-200/15 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/60 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Ververs
          </button>
        </header>

        <section className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/35">Alleen admin</p>
          <h1 className="text-4xl font-extralight tracking-[0.16em] text-white">Content beheer</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
            Bekijk en beheer alle foto's, video's, quotes, teksten en muziek. Alles staat gesorteerd op laatst toegevoegd.
          </p>
        </section>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="mb-5 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const count = tab.id === 'music' ? sortedTracks.length : groupedMemories[tab.id].length
            const active = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition ${
                  active
                    ? 'border-purple-200/40 bg-purple-200/15 text-white'
                    : 'border-white/10 bg-black/20 text-white/45 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                <Icon size={14} />
                {tab.label}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.6rem]">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-black/30 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-white/45">Content laden...</div>
          ) : activeItems.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-center text-sm text-white/45">
              Geen items in dit tabblad.
            </div>
          ) : activeTab === 'music' ? (
            <div className="grid gap-4">
              {sortedTracks.map((track) => (
                <TrackAdminCard key={track.id} track={track} busy={busyId === track.id} onDelete={handleDeleteTrack} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4">
              {groupedMemories[activeTab].map((memory) => (
                <MemoryAdminCard
                  key={memory.id}
                  memory={memory}
                  busy={busyId === memory.id}
                  onDelete={handleDeleteMemory}
                  onToggleCore={handleToggleCore}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MemoryAdminCard({ memory, busy, onDelete, onToggleCore }) {
  const Icon = TYPE_ICONS[memory.type] ?? Quote

  return (
    <article className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[8rem_1fr_auto]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {memory.mediaUrl ? (
          memory.mediaResourceType === 'video' || memory.type === 'video' ? (
            <video src={memory.mediaUrl} poster={memory.mediaThumbnailUrl || undefined} className="h-32 w-full object-cover" muted />
          ) : (
            <img src={memory.mediaThumbnailUrl || memory.mediaUrl} alt={memory.title} className="h-32 w-full object-cover" />
          )
        ) : (
          <div className="flex h-32 items-center justify-center text-white/35">
            <Icon size={28} />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{memory.type}</span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{formatDate(memory.createdAt)}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">
            <Flame size={12} />
            {memory.candleCount} kaarsjes
          </span>
          {memory.isCoreMemory && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/30 bg-amber-300/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-amber-100">
              <Star size={12} />
              Core
            </span>
          )}
        </div>

        <h2 className="text-xl font-light text-white">{memory.title}</h2>
        {memory.author && <p className="mt-1 text-xs text-white/45">Toegevoegd door {memory.author}</p>}
        {memory.body && <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/55">{memory.body}</p>}
        <p className="mt-3 break-all text-[0.7rem] text-white/25">{memory.id}</p>
      </div>

      <div className="flex items-start gap-2 sm:flex-col">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleCore(memory)}
          className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 px-4 py-2 text-xs text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-50"
        >
          <Star size={14} />
          {memory.isPinnedCoreMemory ? 'Core uit' : 'Core aan'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(memory)}
          className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 px-4 py-2 text-xs text-rose-100 transition hover:bg-rose-300/10 disabled:opacity-50"
        >
          <Trash2 size={14} />
          Verwijder
        </button>
      </div>
    </article>
  )
}

function TrackAdminCard({ track, busy, onDelete }) {
  return (
    <article className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[8rem_1fr_auto]">
      <div className="flex h-32 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-white/35">
        <Music size={30} />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{track.sourceType === 'audio' ? 'site-player' : 'link only'}</span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{formatDate(track.createdAt)}</span>
          {track.durationSeconds && <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{Math.round(track.durationSeconds)} sec</span>}
        </div>

        <h2 className="text-xl font-light text-white">{track.title}</h2>
        {track.artist && <p className="mt-1 text-xs text-white/45">{track.artist}</p>}
        {track.externalUrl && (
          <a href={track.externalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs text-purple-100/70 transition hover:text-purple-100">
            <ExternalLink size={13} />
            Open originele link
          </a>
        )}
        <p className="mt-3 break-all text-[0.7rem] text-white/25">{track.id}</p>
      </div>

      <div className="flex items-start gap-2 sm:flex-col">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(track)}
          className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 px-4 py-2 text-xs text-rose-100 transition hover:bg-rose-300/10 disabled:opacity-50"
        >
          <Trash2 size={14} />
          Verwijder
        </button>
      </div>
    </article>
  )
}
