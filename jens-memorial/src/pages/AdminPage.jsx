import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Edit3, ExternalLink, FileText, Flame, Image, LogOut, MessageSquare, Music, Quote, RefreshCw, Save, Shield, Star, Trash2, UserCheck, Video, X, AlertTriangle } from 'lucide-react'
import { deleteMemory, fetchMemories, updateMemory, updateMemoryCoreStatus } from '../lib/memories'
import { deleteTrack, fetchTracks, updateTrack } from '../lib/tracks'
import { createWhitelistedUser, fetchUsers, updateUserAccess } from '../lib/users'
import { useAuth } from '../context/AuthContext'
import { fetchFeedback, updateFeedbackResolved, deleteFeedback, updateFeedbackResolvedAndMessage } from '../lib/feedback'

const TABS = [
  { id: 'foto', label: "Foto's", icon: Image },
  { id: 'video', label: "Video's", icon: Video },
  { id: 'quote', label: 'Quotes', icon: Quote },
  { id: 'tekst', label: 'Teksten', icon: FileText },
  { id: 'music', label: 'Muziek', icon: Music },
  { id: 'requests', label: 'Aanvragen', icon: UserCheck },
  { id: 'feedback', label: 'Berichten', icon: MessageSquare },
  { id: 'removals', label: 'Verwijderverzoeken', icon: AlertTriangle },
]

const TYPE_ICONS = {
  foto: Image,
  video: Video,
  quote: Quote,
  tekst: FileText,
}
const ADMIN_FIELD_LIMITS = {
  title: 100,
  author: 60,
  trackTitle: 80,
  artist: 80,
  url: 500,
  submittedByName: 60,
  body: 1200,
  reason: 500,
}

function sortNewestFirst(items) {
  return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminPage() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('foto')
  const [memories, setMemories] = useState([])
  const [tracks, setTracks] = useState([])
  const [users, setUsers] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [whitelistForm, setWhitelistForm] = useState({ name: '', email: '' })

  const groupedMemories = useMemo(
    () => ({
      foto: sortNewestFirst(memories.filter((memory) => memory.type === 'foto' && !memory.title.startsWith('[HIDDEN]'))),
      video: sortNewestFirst(memories.filter((memory) => memory.type === 'video' && !memory.title.startsWith('[HIDDEN]'))),
      quote: sortNewestFirst(memories.filter((memory) => memory.type === 'quote' && !memory.title.startsWith('[HIDDEN]'))),
      tekst: sortNewestFirst(memories.filter((memory) => memory.type === 'tekst' && !memory.title.startsWith('[HIDDEN]'))),
    }),
    [memories]
  )
  const sortedTracks = useMemo(() => sortNewestFirst(tracks), [tracks])
  const pendingUsers = useMemo(() => sortNewestFirst(users.filter((user) => !user.approved && !user.isAdmin)), [users])
  const approvedUsers = useMemo(() => sortNewestFirst(users.filter((user) => user.approved && !user.isAdmin)), [users])

  async function loadAdminContent() {
    try {
      setLoading(true)
      setError('')
      const [loadedMemories, loadedTracks, loadedUsers, loadedFeedback] = await Promise.all([
        fetchMemories(),
        fetchTracks(),
        fetchUsers(),
        fetchFeedback(),
      ])
      setMemories(loadedMemories)
      setTracks(loadedTracks)
      setUsers(loadedUsers)
      setFeedback(loadedFeedback)

      // Automatic purge process for expired removal requests (older than 3 days)
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
      let needsRefresh = false

      for (const item of loadedFeedback) {
        if (item.type === 'removal' && item.resolved) {
          try {
            if (item.message.trim().startsWith('{')) {
              const requestData = JSON.parse(item.message)
              if (requestData.resolvedAt) {
                const resolvedTime = new Date(requestData.resolvedAt).getTime()
                if (resolvedTime < threeDaysAgo) {
                  const memoryId = requestData.memoryId
                  const targetMem = loadedMemories.find((m) => m.id === memoryId)

                  if (requestData.actionType === 'delete_entire') {
                    if (targetMem) {
                      await deleteMemory(memoryId)
                    }
                  } else if (requestData.actionType === 'delete_assets') {
                    if (targetMem && targetMem.collageData) {
                      const selectedAssets = requestData.selectedAssets || []
                      const remainingAssets = targetMem.collageData.assets.filter(
                        (asset) => !selectedAssets.includes(asset.url)
                      )
                      if (remainingAssets.length === 0) {
                        await deleteMemory(memoryId)
                      } else {
                        const updatedBody = JSON.stringify({
                          ...targetMem.collageData,
                          assets: remainingAssets,
                        })
                        await updateMemory(memoryId, {
                          title: targetMem.title,
                          author: targetMem.author,
                          body: updatedBody,
                        })
                      }
                    }
                  }

                  // Delete the feedback record itself
                  await deleteFeedback(item.id)
                  needsRefresh = true
                }
              }
            }
          } catch (e) {
            console.error('Error during auto-purging:', e)
          }
        }
      }

      if (needsRefresh) {
        const [refreshedMemories, refreshedFeedback] = await Promise.all([
          fetchMemories(),
          fetchFeedback(),
        ])
        setMemories(refreshedMemories)
        setFeedback(refreshedFeedback)
      }
    } catch (loadError) {
      setError(loadError.message || 'Kon admin content niet laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdminContent()
  }, [])

  async function handleToggleFeedbackResolved(item) {
    try {
      setBusyId(item.id)
      const updated = await updateFeedbackResolved(item.id, !item.resolved)
      setFeedback((current) => current.map((f) => (f.id === item.id ? updated : f)))
    } catch (updateError) {
      setError(updateError.message || 'Kon status niet aanpassen.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleResolveRemovalRequest(item, resolved, updatedMessage) {
    try {
      setBusyId(item.id)
      const updated = await updateFeedbackResolvedAndMessage(item.id, resolved, updatedMessage)
      setFeedback((current) => current.map((f) => (f.id === item.id ? updated : f)))
    } catch (updateError) {
      setError(updateError.message || 'Kon status niet aanpassen.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteFeedback(item) {
    const confirmed = window.confirm(
      item.type === 'removal'
        ? 'Weet je zeker dat je dit verwijderverzoek definitief wilt verwijderen? Eventuele verborgen content die aan dit verzoek is gekoppeld, wordt nu ook definitief verwijderd.'
        : 'Weet je zeker dat je dit bericht wilt verwijderen?'
    )
    if (!confirmed) return

    try {
      setBusyId(item.id)

      // If it's a removal request, check if we need to purge the hidden content permanently
      if (item.type === 'removal') {
        try {
          if (item.message.trim().startsWith('{')) {
            const requestData = JSON.parse(item.message)
            const memoryId = requestData.memoryId
            const targetMem = memories.find((m) => m.id === memoryId)

            if (requestData.actionType === 'delete_entire') {
              if (targetMem) {
                await deleteMemory(memoryId)
              }
            } else if (requestData.actionType === 'delete_assets') {
              if (targetMem && targetMem.collageData) {
                const selectedAssets = requestData.selectedAssets || []
                const remainingAssets = targetMem.collageData.assets.filter(
                  (asset) => !selectedAssets.includes(asset.url)
                )
                if (remainingAssets.length === 0) {
                  await deleteMemory(memoryId)
                } else {
                  const updatedBody = JSON.stringify({
                    ...targetMem.collageData,
                    assets: remainingAssets,
                  })
                  await updateMemory(memoryId, {
                    title: targetMem.title,
                    author: targetMem.author,
                    body: updatedBody,
                  })
                }
              }
            }
          }
        } catch (purgeErr) {
          console.error('Error during manual feedback purge:', purgeErr)
        }
      }

      await deleteFeedback(item.id)
      setFeedback((current) => current.filter((f) => f.id !== item.id))

      // Update local memories state if we deleted/modified a memory
      if (item.type === 'removal') {
        try {
          if (item.message.trim().startsWith('{')) {
            const requestData = JSON.parse(item.message)
            const memoryId = requestData.memoryId
            if (requestData.actionType === 'delete_entire') {
              setMemories((currentMemories) => currentMemories.filter((m) => m.id !== memoryId))
            } else if (requestData.actionType === 'delete_assets') {
              const refreshedMemories = await fetchMemories()
              setMemories(refreshedMemories)
            }
          }
        } catch (err) {
          console.error('Error updating memories state after feedback deletion:', err)
        }
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Bericht verwijderen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }


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

  async function handleUpdateMemory(memory, updates) {
    try {
      setBusyId(memory.id)
      const updatedMemory = await updateMemory(memory.id, updates)
      setMemories((currentMemories) => currentMemories.map((item) => (item.id === memory.id ? updatedMemory : item)))
    } catch (updateError) {
      setError(updateError.message || 'Herinnering aanpassen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleUpdateTrack(track, updates) {
    try {
      setBusyId(track.id)
      const updatedTrack = await updateTrack(track.id, updates)
      setTracks((currentTracks) => currentTracks.map((item) => (item.id === track.id ? updatedTrack : item)))
    } catch (updateError) {
      setError(updateError.message || 'Nummer aanpassen is mislukt.')
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

  async function handleUpdateUserAccess(user, updates) {
    try {
      setBusyId(user.id)
      const updatedUser = await updateUserAccess(user.id, { isAdmin: user.isAdmin, ...updates })
      setUsers((currentUsers) => currentUsers.map((item) => (item.id === user.id ? updatedUser : item)))
    } catch (updateError) {
      setError(updateError.message || 'Toegang aanpassen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCreateWhitelistedUser(event) {
    event.preventDefault()
    if (!whitelistForm.email.trim()) return

    try {
      setBusyId('whitelist')
      const createdUser = await createWhitelistedUser({
        name: whitelistForm.name.trim(),
        email: whitelistForm.email.trim(),
      })
      setUsers((currentUsers) => {
        const withoutDuplicate = currentUsers.filter((item) => item.id !== createdUser.id && item.email !== createdUser.email)
        return [createdUser, ...withoutDuplicate]
      })
      setWhitelistForm({ name: '', email: '' })
    } catch (createError) {
      setError(createError.message || 'Whitelist toevoegen is mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  const activeItems = activeTab === 'music'
    ? sortedTracks
    : activeTab === 'requests'
    ? pendingUsers
    : activeTab === 'feedback'
    ? feedback.filter((f) => f.type !== 'removal')
    : activeTab === 'removals'
    ? feedback.filter((f) => f.type === 'removal')
    : groupedMemories[activeTab]

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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadAdminContent}
              disabled={loading}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-purple-200/15 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/60 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Ververs
            </button>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-rose-200/80 transition hover:bg-rose-300/20 hover:text-rose-100"
            >
              <LogOut size={14} />
              Log uit
            </button>
          </div>
        </header>

        <section className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/35">Alleen admin</p>
          <h1 className="text-4xl font-extralight tracking-[0.16em] text-white">Content beheer</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
            Bekijk en beheer alle foto's, video's, quotes, teksten, muziek en berichten. Alles staat gesorteerd op laatst toegevoegd.
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
            const count = tab.id === 'music'
              ? sortedTracks.length
              : tab.id === 'requests'
              ? pendingUsers.length
              : tab.id === 'feedback'
              ? feedback.filter((f) => !f.resolved && f.type !== 'removal').length
              : tab.id === 'removals'
              ? feedback.filter((f) => !f.resolved && f.type === 'removal').length
              : groupedMemories[tab.id].length
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
          ) : activeTab === 'requests' ? (
            <AccessRequestsPanel
              pendingUsers={pendingUsers}
              approvedUsers={approvedUsers}
              busyId={busyId}
              whitelistForm={whitelistForm}
              onWhitelistFormChange={setWhitelistForm}
              onCreateWhitelistedUser={handleCreateWhitelistedUser}
              onUpdateUserAccess={handleUpdateUserAccess}
            />
          ) : activeTab === 'feedback' ? (
            <FeedbackPanel
              feedback={feedback.filter((f) => f.type !== 'removal')}
              busyId={busyId}
              onToggleResolved={handleToggleFeedbackResolved}
              onDelete={handleDeleteFeedback}
            />
          ) : activeTab === 'removals' ? (
            <RemovalsPanel
              feedback={feedback}
              memories={memories}
              busyId={busyId}
              onToggleResolved={handleToggleFeedbackResolved}
              onResolveRequest={handleResolveRemovalRequest}
              onDeleteFeedback={handleDeleteFeedback}
              onDeleteMemory={handleDeleteMemory}
              onUpdateMemory={handleUpdateMemory}
            />
          ) : activeItems.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-center text-sm text-white/45">
              Geen items in dit tabblad.
            </div>
          ) : activeTab === 'music' ? (
            <div className="grid gap-4">
              {sortedTracks.map((track) => (
                <TrackAdminCard key={track.id} track={track} busy={busyId === track.id} onDelete={handleDeleteTrack} onUpdate={handleUpdateTrack} />
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
                  onUpdate={handleUpdateMemory}
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

function MemoryAdminCard({ memory, busy, onDelete, onUpdate, onToggleCore }) {
  const Icon = TYPE_ICONS[memory.type] ?? Quote
  const [editing, setEditing] = useState(false)
  const isCollage = !!memory.collageData
  const initialBody = memory.collageData ? memory.collageData.caption ?? '' : memory.body
  const [form, setForm] = useState({ title: memory.title, author: memory.author, body: initialBody })

  const isQuote = memory.type === 'quote'
  const [quoteForm, setQuoteForm] = useState({
    quote: memory.quoteData?.quote ?? memory.body,
    quoteBy: memory.quoteData?.quoteBy ?? '',
    month: memory.quoteData?.month ?? '',
    year: memory.quoteData?.year ?? '',
    context: memory.quoteData?.context ?? '',
  })

  function resetForm() {
    setForm({ title: memory.title, author: memory.author, body: memory.collageData ? memory.collageData.caption ?? '' : memory.body })
    setQuoteForm({
      quote: memory.quoteData?.quote ?? memory.body,
      quoteBy: memory.quoteData?.quoteBy ?? '',
      month: memory.quoteData?.month ?? '',
      year: memory.quoteData?.year ?? '',
      context: memory.quoteData?.context ?? '',
    })
    setEditing(false)
  }

  useEffect(() => {
    setForm({ title: memory.title, author: memory.author, body: memory.collageData ? memory.collageData.caption ?? '' : memory.body })
    setQuoteForm({
      quote: memory.quoteData?.quote ?? memory.body,
      quoteBy: memory.quoteData?.quoteBy ?? '',
      month: memory.quoteData?.month ?? '',
      year: memory.quoteData?.year ?? '',
      context: memory.quoteData?.context ?? '',
    })
  }, [memory])

  const handleQuoteBodyChange = (value) => {
    const lines = value.split('\n')
    if (lines.length > 6) {
      return
    }
    setQuoteForm({ ...quoteForm, quote: value })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.title.trim()) return

    let finalBody = form.body.trim()
    if (isQuote) {
      finalBody = JSON.stringify({
        quote: quoteForm.quote.trim(),
        quoteBy: quoteForm.quoteBy.trim(),
        month: quoteForm.month,
        year: quoteForm.year.trim(),
        context: quoteForm.context.trim(),
      })
    } else if (isCollage) {
      finalBody = JSON.stringify({
        ...memory.collageData,
        caption: form.body.trim(),
      })
    }

    await onUpdate(memory, {
      title: form.title.trim(),
      author: form.author.trim(),
      body: finalBody,
    })
    setEditing(false)
  }

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
          {memory.collageData ? (
            <span className="rounded-full border border-purple-200/30 bg-purple-300/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-purple-100">Collage ({memory.collageData.assets?.length ?? 0} items)</span>
          ) : (
            <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{memory.type}</span>
          )}
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

        {editing ? (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-white/35">Titel</span>
                <input value={form.title} maxLength={ADMIN_FIELD_LIMITS.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45" placeholder="Titel" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-white/35">Ingezonden door</span>
                <input value={form.author} maxLength={ADMIN_FIELD_LIMITS.author} onChange={(event) => setForm({ ...form, author: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45" placeholder="Naam van de inzender" />
              </label>
            </div>

            {isQuote ? (
              <div className="grid gap-3 text-left">
                <label className="block">
                  <span className="mb-1 flex justify-between text-[0.65rem] uppercase tracking-wider text-white/35">
                    Quote
                    <span className="tracking-normal">{quoteForm.quote.length}/500</span>
                  </span>
                  <textarea
                    value={quoteForm.quote}
                    maxLength={500}
                    onChange={(event) => handleQuoteBodyChange(event.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-purple-200/45 whitespace-pre-wrap"
                    placeholder="De quote zelf (max. 6 regels)"
                    required
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-white/35">Wie heeft dit gezegd?</span>
                    <input
                      value={quoteForm.quoteBy}
                      maxLength={60}
                      onChange={(event) => setQuoteForm({ ...quoteForm, quoteBy: event.target.value })}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-[11px] text-sm text-white outline-none focus:border-purple-200/45"
                      placeholder="Bijv. Jens"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-white/35">Maand</span>
                    <select
                      value={quoteForm.month}
                      onChange={(event) => setQuoteForm({ ...quoteForm, month: event.target.value })}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-[12px] text-sm text-white outline-none focus:border-purple-200/45 [&>option]:bg-[#18181b] [&>option]:text-white"
                    >
                      <option value="">Selecteer...</option>
                      {['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'].map((m) => (
                        <option key={m} value={m.toLowerCase()}>{m}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-white/35">Jaar</span>
                    <input
                      value={quoteForm.year}
                      maxLength={4}
                      onChange={(event) => setQuoteForm({ ...quoteForm, year: event.target.value.replace(/\D/g, '') })}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-[11px] text-sm text-white outline-none focus:border-purple-200/45"
                      placeholder="Bijv. 2023"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 flex justify-between text-[0.65rem] uppercase tracking-wider text-white/35">
                    Context / Toelichting
                    <span className="tracking-normal">{quoteForm.context.length}/500</span>
                  </span>
                  <textarea
                    value={quoteForm.context}
                    maxLength={500}
                    onChange={(event) => setQuoteForm({ ...quoteForm, context: event.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-purple-200/45"
                    placeholder="Uitleg of toelichting bij de quote..."
                  />
                </label>
              </div>
            ) : (
              <label className="block">
                <span className="mb-1 flex justify-between text-[0.65rem] uppercase tracking-wider text-white/35">
                  Tekst / Bijschrift
                  <span className="tracking-normal">{form.body.length}/{ADMIN_FIELD_LIMITS.body}</span>
                </span>
                <textarea value={form.body} maxLength={ADMIN_FIELD_LIMITS.body} onChange={(event) => setForm({ ...form, body: event.target.value })} rows={4} className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-purple-200/45" placeholder="Tekst of context" />
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 px-4 py-2 text-xs text-emerald-100 transition hover:bg-emerald-300/10 disabled:opacity-50">
                <Save size={14} />
                Opslaan
              </button>
              <button type="button" disabled={busy} onClick={resetForm} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 transition hover:bg-white/10 disabled:opacity-50">
                <X size={14} />
                Annuleer
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="text-xl font-light text-white">{memory.title}</h2>
            {memory.author && <p className="mt-1 text-xs text-white/45">Ingezonden door {memory.author}</p>}
            {(memory.collageData ? memory.collageData.caption : (memory.type === 'quote' && memory.quoteData ? memory.quoteData.quote : memory.body)) && (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/55 whitespace-pre-wrap">
                {memory.collageData ? memory.collageData.caption : (memory.type === 'quote' && memory.quoteData ? memory.quoteData.quote : memory.body)}
              </p>
            )}
            <p className="mt-3 break-all text-[0.7rem] text-white/25">{memory.id}</p>
          </>
        )}
      </div>

      <div className="flex items-start gap-2 sm:flex-col">
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2 rounded-full border border-purple-200/20 px-4 py-2 text-xs text-purple-100 transition hover:bg-purple-300/10 disabled:opacity-50"
        >
          <Edit3 size={14} />
          Bewerk
        </button>
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

function AccessRequestsPanel({ pendingUsers, approvedUsers, busyId, whitelistForm, onWhitelistFormChange, onCreateWhitelistedUser, onUpdateUserAccess }) {
  return (
    <div className="grid gap-8">
      <section className="rounded-3xl border border-purple-200/15 bg-purple-200/[0.06] p-5">
        <h2 className="text-xl font-light text-white">Vooraf toegang geven</h2>
        <p className="mt-1 text-sm text-white/45">Whitelist een e-mailadres zodat deze persoon na e-mailverificatie meteen naar de site kan.</p>
        <form onSubmit={onCreateWhitelistedUser} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={whitelistForm.name}
            onChange={(event) => onWhitelistFormChange({ ...whitelistForm, name: event.target.value })}
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45"
            placeholder="Naam optioneel"
          />
          <input
            type="email"
            value={whitelistForm.email}
            onChange={(event) => onWhitelistFormChange({ ...whitelistForm, email: event.target.value })}
            required
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45"
            placeholder="email@example.com"
          />
          <button
            type="submit"
            disabled={busyId === 'whitelist'}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200/20 px-4 py-3 text-xs text-emerald-100 transition hover:bg-emerald-300/10 disabled:opacity-50"
          >
            <Check size={14} />
            Whitelist
          </button>
        </form>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-light text-white">Nieuwe aanvragen</h2>
            <p className="mt-1 text-sm text-white/45">Mensen die hun e-mail hebben bevestigd en wachten op toegang.</p>
          </div>
          <span className="rounded-full border border-purple-200/20 bg-purple-200/10 px-3 py-1 text-xs text-purple-100">{pendingUsers.length}</span>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/45">Geen openstaande aanvragen.</div>
        ) : (
          <div className="grid gap-3">
            {pendingUsers.map((user) => (
              <UserAccessCard
                key={user.id}
                user={user}
                busy={busyId === user.id}
                primaryActionLabel="Goedkeuren"
                primaryActionIcon={Check}
                primaryActionClass="border-emerald-200/20 text-emerald-100 hover:bg-emerald-300/10"
                onPrimaryAction={() => onUpdateUserAccess(user, { approved: true })}
                onReject={() => onUpdateUserAccess(user, { approved: false, isAdmin: false })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-light text-white">Goedgekeurde bezoekers</h2>
            <p className="mt-1 text-sm text-white/45">Deze mensen hebben toegang tot de site.</p>
          </div>
          <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-xs text-emerald-100">{approvedUsers.length}</span>
        </div>

        {approvedUsers.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/45">Nog geen goedgekeurde bezoekers.</div>
        ) : (
          <div className="grid gap-3">
            {approvedUsers.map((user) => (
              <UserAccessCard
                key={user.id}
                user={user}
                busy={busyId === user.id}
                primaryActionLabel="Maak admin"
                primaryActionIcon={Shield}
                primaryActionClass="border-purple-200/20 text-purple-100 hover:bg-purple-300/10"
                onPrimaryAction={() => onUpdateUserAccess(user, { approved: true, isAdmin: true })}
                onReject={() => onUpdateUserAccess(user, { approved: false, isAdmin: false })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function UserAccessCard({ user, busy, primaryActionLabel, primaryActionIcon: PrimaryIcon, primaryActionClass, onPrimaryAction, onReject }) {
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{formatDate(user.createdAt)}</span>
          {user.isAdmin && (
            <span className="inline-flex items-center gap-1 rounded-full border border-purple-200/25 bg-purple-300/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-purple-100">
              <Shield size={12} />
              Admin
            </span>
          )}
        </div>
        <h3 className="text-lg font-light text-white">{user.name || 'Onbekend'}</h3>
        <p className="mt-1 break-all text-sm text-white/45">{user.email}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onPrimaryAction}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition disabled:opacity-50 ${primaryActionClass}`}
        >
          <PrimaryIcon size={14} />
          {primaryActionLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 px-4 py-2 text-xs text-rose-100 transition hover:bg-rose-300/10 disabled:opacity-50"
        >
          <X size={14} />
          Afwijzen
        </button>
      </div>
    </article>
  )
}

function TrackAdminCard({ track, busy, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    title: track.title,
    artist: track.artist,
    externalUrl: track.externalUrl,
    submittedByName: track.submittedByName,
    reason: track.reason,
  })

  function resetForm() {
    setForm({
      title: track.title,
      artist: track.artist,
      externalUrl: track.externalUrl,
      submittedByName: track.submittedByName,
      reason: track.reason,
    })
    setEditing(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    await onUpdate(track, {
      title: form.title.trim(),
      artist: form.artist.trim(),
      externalUrl: form.externalUrl.trim(),
      submittedByName: form.submittedByName.trim(),
      reason: form.reason.trim(),
    })
    setEditing(false)
  }

  return (
    <article className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[8rem_1fr_auto]">
      <div className="flex h-32 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-white/35">
        <Music size={30} />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{track.sourceType === 'audio' ? 'Speelt op de site' : 'Alleen link'}</span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{formatDate(track.createdAt)}</span>
          {track.durationSeconds && <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">{Math.round(track.durationSeconds)} sec</span>}
        </div>

        {editing ? (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <input value={form.title} maxLength={ADMIN_FIELD_LIMITS.trackTitle} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45" placeholder="Titel" />
            <input value={form.artist} maxLength={ADMIN_FIELD_LIMITS.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45" placeholder="Artiest" />
            <input value={form.externalUrl} maxLength={ADMIN_FIELD_LIMITS.url} onChange={(event) => setForm({ ...form, externalUrl: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45" placeholder="YouTube/Spotify link" />
            <input value={form.submittedByName} maxLength={ADMIN_FIELD_LIMITS.submittedByName} onChange={(event) => setForm({ ...form, submittedByName: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none focus:border-purple-200/45" placeholder="Toegevoegd door" />
            <label>
              <span className="mb-2 flex justify-between text-xs uppercase tracking-[0.18em] text-white/35">
                Waarom dit nummer?
                <span className="tracking-normal">{form.reason.length}/{ADMIN_FIELD_LIMITS.reason}</span>
              </span>
              <textarea value={form.reason} maxLength={ADMIN_FIELD_LIMITS.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} rows={4} className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-purple-200/45" placeholder="Persoonlijke toelichting" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 px-4 py-2 text-xs text-emerald-100 transition hover:bg-emerald-300/10 disabled:opacity-50">
                <Save size={14} />
                Opslaan
              </button>
              <button type="button" disabled={busy} onClick={resetForm} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 transition hover:bg-white/10 disabled:opacity-50">
                <X size={14} />
                Annuleer
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="text-xl font-light text-white">{track.title}</h2>
            {track.artist && <p className="mt-1 text-xs text-white/45">{track.artist}</p>}
            {track.submittedByName && <p className="mt-1 text-xs text-white/45">Toegevoegd door {track.submittedByName}</p>}
            {track.reason && <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/55">“{track.reason}”</p>}
            {track.externalUrl && (
              <a href={track.externalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs text-purple-100/70 transition hover:text-purple-100">
                <ExternalLink size={13} />
                Open originele link
              </a>
            )}
            <p className="mt-3 break-all text-[0.7rem] text-white/25">{track.id}</p>
          </>
        )}
      </div>

      <div className="flex items-start gap-2 sm:flex-col">
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2 rounded-full border border-purple-200/20 px-4 py-2 text-xs text-purple-100 transition hover:bg-purple-300/10 disabled:opacity-50"
        >
          <Edit3 size={14} />
          Bewerk
        </button>
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

function FeedbackPanel({ feedback, busyId, onToggleResolved, onDelete }) {
  const unresolvedFeedback = feedback.filter((f) => !f.resolved)
  const resolvedFeedback = feedback.filter((f) => f.resolved)

  return (
    <div className="grid gap-8">
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-light text-white">Nieuwe berichten ({unresolvedFeedback.length})</h2>
            <p className="text-sm text-white/45">Ongelezen of openstaande feedback van gebruikers.</p>
          </div>
        </div>

        {unresolvedFeedback.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/45">
            Geen nieuwe berichten.
          </div>
        ) : (
          <div className="grid gap-4">
            {unresolvedFeedback.map((item) => (
              <FeedbackCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onToggleResolved={onToggleResolved}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </section>

      {resolvedFeedback.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-light text-white/70">Gelezen / Opgelost ({resolvedFeedback.length})</h2>
              <p className="text-sm text-white/45">Berichten die zijn afgehandeld.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {resolvedFeedback.map((item) => (
              <FeedbackCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onToggleResolved={onToggleResolved}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FeedbackCard({ item, busy, onToggleResolved, onDelete }) {
  const isAnon = item.isAnonymous === true

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">
            {formatDate(item.createdAt)}
          </span>
          {item.resolved ? (
            <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/35">
              Gelezen
            </span>
          ) : (
            <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-purple-200">
              Nieuw
            </span>
          )}
          {isAnon && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-amber-200">
              Anoniem
            </span>
          )}
        </div>

        <h3 className="text-lg font-light text-white">{isAnon ? 'Anoniem' : item.userName}</h3>
        {!isAnon && <p className="text-xs text-white/45 break-all">{item.userEmail}</p>}

        <div className="mt-4 rounded-2xl bg-black/20 p-4 border border-white/5 text-sm leading-6 text-white/70 whitespace-pre-wrap">
          {item.message}
        </div>
      </div>

      <div className="flex flex-row gap-2 sm:flex-col sm:items-stretch sm:justify-start">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleResolved(item)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition disabled:opacity-50 ${
            item.resolved
              ? 'border-white/10 text-white/60 hover:bg-white/10'
              : 'border-emerald-200/20 text-emerald-100 hover:bg-emerald-300/10'
          }`}
        >
          <Check size={14} />
          {item.resolved ? 'Markeer als nieuw' : 'Gelezen'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(item)}
          className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 px-4 py-2 text-xs text-rose-100 transition hover:bg-rose-300/10 disabled:opacity-50"
        >
          <Trash2 size={14} />
          Verwijder
        </button>
      </div>
    </article>
  )
}

function RemovalsPanel({ feedback, memories, busyId, onToggleResolved, onResolveRequest, onDeleteFeedback, onDeleteMemory, onUpdateMemory }) {
  const unresolvedRemovals = feedback.filter((f) => f.type === 'removal' && !f.resolved)
  const resolvedRemovals = feedback.filter((f) => f.type === 'removal' && f.resolved)

  return (
    <div className="grid gap-8">
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-light text-white">Nieuwe verwijderverzoeken ({unresolvedRemovals.length})</h2>
            <p className="text-sm text-white/45">Openstaande aanvragen om afbeeldingen of content offline te halen.</p>
          </div>
        </div>

        {unresolvedRemovals.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/45">
            Geen nieuwe verwijderverzoeken.
          </div>
        ) : (
          <div className="grid gap-4">
            {unresolvedRemovals.map((item) => (
              <RemovalCard
                key={item.id}
                item={item}
                memories={memories}
                busy={busyId === item.id}
                onToggleResolved={onToggleResolved}
                onResolveRequest={onResolveRequest}
                onDeleteFeedback={onDeleteFeedback}
                onDeleteMemory={onDeleteMemory}
                onUpdateMemory={onUpdateMemory}
              />
            ))}
          </div>
        )}
      </section>

      {resolvedRemovals.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-light text-white/70">Afgehandelde verzoeken ({resolvedRemovals.length})</h2>
              <p className="text-sm text-white/45">Verzoeken die zijn goedgekeurd of genegeerd.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {resolvedRemovals.map((item) => (
              <RemovalCard
                key={item.id}
                item={item}
                memories={memories}
                busy={busyId === item.id}
                onToggleResolved={onToggleResolved}
                onResolveRequest={onResolveRequest}
                onDeleteFeedback={onDeleteFeedback}
                onDeleteMemory={onDeleteMemory}
                onUpdateMemory={onUpdateMemory}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RemovalCard({ item, memories, busy, onToggleResolved, onResolveRequest, onDeleteFeedback, onDeleteMemory, onUpdateMemory }) {
  const isAnon = item.isAnonymous === true
  let requestData = null
  try {
    if (item.message.trim().startsWith('{')) {
      requestData = JSON.parse(item.message)
    }
  } catch (e) {
    // Ignore
  }

  const memoryId = requestData?.memoryId
  const targetMemory = memories.find((m) => m.id === memoryId)
  const selectedAssets = requestData?.selectedAssets || []
  const reason = requestData?.reason || (requestData ? '' : item.message)

  const [localBusy, setLocalBusy] = useState(false)

  async function handleIgnore() {
    setLocalBusy(true)
    try {
      const updatedData = {
        ...requestData,
        resolvedAt: new Date().toISOString(),
        actionType: 'ignore',
      }
      await onResolveRequest(item, true, JSON.stringify(updatedData))
    } catch (e) {
      alert('Fout: ' + e.message)
    } finally {
      setLocalBusy(false)
    }
  }

  async function handleReopenIgnore() {
    setLocalBusy(true)
    try {
      const restoredData = { ...requestData }
      delete restoredData.resolvedAt
      delete restoredData.actionType
      await onResolveRequest(item, false, JSON.stringify(restoredData))
    } catch (e) {
      alert('Fout: ' + e.message)
    } finally {
      setLocalBusy(false)
    }
  }

  async function handleDeleteEntire() {
    if (!targetMemory) return
    const confirmed = window.confirm(`Weet je zeker dat je de gehele herinnering "${targetMemory.title}" wilt verbergen? Deze wordt pas na 3 dagen definitief verwijderd.`);
    if (!confirmed) return

    setLocalBusy(true)
    try {
      const updatedTitle = `[HIDDEN] ${targetMemory.title}`
      await onUpdateMemory(targetMemory, {
        title: updatedTitle,
        author: targetMemory.author,
        body: targetMemory.body,
      })

      const updatedData = {
        ...requestData,
        resolvedAt: new Date().toISOString(),
        actionType: 'delete_entire',
        originalTitle: targetMemory.title,
      }

      await onResolveRequest(item, true, JSON.stringify(updatedData))
    } catch (e) {
      alert('Kon herinnering niet verbergen: ' + e.message)
    } finally {
      setLocalBusy(false)
    }
  }

  async function handleRemoveSelected() {
    if (!targetMemory || !targetMemory.collageData) return
    const confirmed = window.confirm(`Weet je zeker dat je de geselecteerde ${selectedAssets.length} foto('s) wilt verbergen uit de collage? Deze worden pas na 3 dagen definitief verwijderd.`);
    if (!confirmed) return

    setLocalBusy(true)
    try {
      const updatedAssets = targetMemory.collageData.assets.map((asset) => {
        if (selectedAssets.includes(asset.url)) {
          return { ...asset, hidden: true }
        }
        return asset
      })

      const isAllHidden = updatedAssets.every(a => a.hidden)
      
      const updatedBody = JSON.stringify({
        ...targetMemory.collageData,
        assets: updatedAssets,
      })

      await onUpdateMemory(targetMemory, {
        title: isAllHidden ? `[HIDDEN] ${targetMemory.title}` : targetMemory.title,
        author: targetMemory.author,
        body: updatedBody,
      })

      const updatedData = {
        ...requestData,
        resolvedAt: new Date().toISOString(),
        actionType: 'delete_assets',
        originalTitle: targetMemory.title,
        allHidden: isAllHidden,
      }

      await onResolveRequest(item, true, JSON.stringify(updatedData))
    } catch (err) {
      alert('Kon collage niet bijwerken: ' + err.message)
    } finally {
      setLocalBusy(false)
    }
  }

  async function handleUndo() {
    if (!targetMemory) return
    const confirmed = window.confirm(`Weet je zeker dat je deze actie ongedaan wilt maken? De content wordt meteen weer zichtbaar op de site.`);
    if (!confirmed) return

    setLocalBusy(true)
    try {
      const actionType = requestData?.actionType
      
      if (actionType === 'delete_entire') {
        const restoredTitle = targetMemory.title.replace(/^\[HIDDEN\]\s*/, '')
        await onUpdateMemory(targetMemory, {
          title: restoredTitle,
          author: targetMemory.author,
          body: targetMemory.body,
        })
      } else if (actionType === 'delete_assets') {
        if (targetMemory.collageData) {
          const restoredAssets = targetMemory.collageData.assets.map((asset) => {
            if (selectedAssets.includes(asset.url)) {
              const { hidden, ...rest } = asset
              return rest
            }
            return asset
          })

          const restoredTitle = targetMemory.title.replace(/^\[HIDDEN\]\s*/, '')

          await onUpdateMemory(targetMemory, {
            title: restoredTitle,
            author: targetMemory.author,
            body: JSON.stringify({
              ...targetMemory.collageData,
              assets: restoredAssets,
            }),
          })
        }
      }

      const restoredData = { ...requestData }
      delete restoredData.resolvedAt
      delete restoredData.actionType
      delete restoredData.originalTitle
      delete restoredData.allHidden

      await onResolveRequest(item, false, JSON.stringify(restoredData))
    } catch (e) {
      alert('Ongedaan maken is mislukt: ' + e.message)
    } finally {
      setLocalBusy(false)
    }
  }

  const isCollage = targetMemory && !!targetMemory.collageData
  const activeBusy = busy || localBusy
  const hasAction = requestData?.actionType && requestData.actionType !== 'ignore'

  // Format date helper
  function formatDate(date) {
    if (!date) return ''
    return new Date(date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/45">
              {formatDate(item.createdAt)}
            </span>
            {item.resolved ? (
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/35">
                {hasAction ? 'Content Verborgen' : 'Opgelost'}
              </span>
            ) : (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/20 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-rose-200">
                Verwijderverzoek
              </span>
            )}
            {isAnon && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-amber-200">
                Anoniem
              </span>
            )}
          </div>

          <h3 className="text-lg font-light text-white">
            Indiener: {isAnon ? 'Anoniem' : item.userName}
          </h3>
          {!isAnon && <p className="text-xs text-white/45 break-all">{item.userEmail}</p>}

          {reason && (
            <div className="mt-4">
              <span className="text-[0.65rem] uppercase tracking-wider text-white/35">Reden / Toelichting</span>
              <div className="mt-1 rounded-2xl bg-black/20 p-4 border border-white/5 text-sm leading-6 text-white/70 whitespace-pre-wrap">
                {reason}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:items-stretch sm:justify-start sm:w-48 shrink-0">
          {!item.resolved ? (
            <>
              <button
                type="button"
                disabled={activeBusy}
                onClick={handleIgnore}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200/20 text-emerald-100 hover:bg-emerald-300/10 px-4 py-2 text-xs transition disabled:opacity-50"
              >
                <Check size={14} />
                Markeer opgelost
              </button>

              {targetMemory && (
                <button
                  type="button"
                  disabled={activeBusy}
                  onClick={handleDeleteEntire}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Verwijder geheel
                </button>
              )}

              {isCollage && selectedAssets.length > 0 && (
                <button
                  type="button"
                  disabled={activeBusy}
                  onClick={handleRemoveSelected}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/15 px-4 py-2 text-xs text-purple-200 transition hover:bg-purple-500/25 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Verwijder geselecteerde
                </button>
              )}
            </>
          ) : (
            <>
              {hasAction ? (
                <button
                  type="button"
                  disabled={activeBusy}
                  onClick={handleUndo}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-purple-200/20 text-purple-100 hover:bg-white/10 px-4 py-2 text-xs transition disabled:opacity-50"
                >
                  <Check size={14} />
                  Ongedaan maken
                </button>
              ) : (
                <button
                  type="button"
                  disabled={activeBusy}
                  onClick={handleReopenIgnore}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 text-white/60 hover:bg-white/10 px-4 py-2 text-xs transition disabled:opacity-50"
                >
                  <Check size={14} />
                  Markeer als open
                </button>
              )}

              <button
                type="button"
                disabled={activeBusy}
                onClick={() => onDeleteFeedback(item)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200/20 px-4 py-2 text-xs text-rose-100 transition hover:bg-rose-300/10 disabled:opacity-50"
              >
                <X size={14} />
                Verwijder verzoek
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-white/5 pt-5">
        <h4 className="text-xs uppercase tracking-[0.18em] text-white/35 mb-3">Betreft Herinnering</h4>
        {targetMemory ? (
          <div className="flex flex-col gap-4 rounded-2xl bg-black/10 p-4 border border-white/5 sm:flex-row">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
              {targetMemory.mediaUrl ? (
                targetMemory.mediaResourceType === 'video' || targetMemory.type === 'video' ? (
                  <video src={targetMemory.mediaUrl} className="h-full w-full object-cover" muted />
                ) : (
                  <img src={targetMemory.mediaThumbnailUrl || targetMemory.mediaUrl} alt={targetMemory.title} className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-white/25">
                  {targetMemory.type === 'quote' ? <Quote size={20} /> : <FileText size={20} />}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h5 className="text-sm font-medium text-white truncate">
                {targetMemory.title.replace(/^\[HIDDEN\]\s*/, '')}
                {targetMemory.title.startsWith('[HIDDEN]') && (
                  <span className="ml-2 rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-rose-200">
                    Verborgen
                  </span>
                )}
              </h5>
              <p className="text-xs text-white/45 mt-1">Type: {targetMemory.type} · Ingezonden door: {targetMemory.author || 'Onbekend'}</p>
              <p className="text-[10px] text-white/25 break-all mt-1">ID: {targetMemory.id}</p>

              {isCollage && (
                <div className="mt-4">
                  <span className="text-[10px] uppercase tracking-wider text-purple-200/50">Afbeeldingen in de collage:</span>
                  <div className="grid grid-cols-4 gap-2 mt-2 max-w-md">
                    {targetMemory.collageData.assets.map((asset, idx) => {
                      const isRequestedToRemove = selectedAssets.includes(asset.url)
                      const isCurrentlyHidden = asset.hidden === true
                      return (
                        <div
                          key={asset.url}
                          className={`relative aspect-square rounded-lg overflow-hidden border ${
                            isRequestedToRemove
                              ? 'border-rose-500/50 ring-2 ring-rose-500/30'
                              : 'border-white/10'
                          } ${isCurrentlyHidden && !isRequestedToRemove ? 'opacity-30' : ''}`}
                        >
                          {asset.resourceType === 'video' ? (
                            <video src={asset.url} className="h-full w-full object-cover" muted />
                          ) : (
                            <img src={asset.url} alt={`Collage asset ${idx + 1}`} className="h-full w-full object-cover" />
                          )}
                          {isCurrentlyHidden && (
                            <div className="absolute inset-0 bg-rose-950/70 flex items-center justify-center text-[8px] font-semibold text-rose-200 uppercase tracking-wider">
                              Verborgen
                            </div>
                          )}
                          {!isCurrentlyHidden && isRequestedToRemove && (
                            <div className="absolute inset-0 bg-rose-500/10 flex items-center justify-center text-[10px] font-semibold text-rose-200">
                              Geselecteerd
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-rose-950/20 p-4 border border-rose-500/10 text-xs text-rose-200/60">
            Deze herinnering is al definitief verwijderd of kan niet worden gevonden (ID: {memoryId}).
          </div>
        )}
      </div>
    </article>
  )
}
