import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, Music, Pause, Play, Plus, Radio, SkipBack, SkipForward, Sparkles, Upload, Volume2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { MEDIA_LIMITS, uploadAudioToCloudinary, validateAudioFile } from '../lib/cloudinary'
import { createTrack, fetchTracks, getYoutubeId } from '../lib/tracks'

const TEST_TRACK_URL = 'https://www.youtube.com/watch?v=ADFEcvI-Vfk'
const TRACK_FIELD_LIMITS = {
  title: 80,
  artist: 80,
  url: 500,
  submittedByName: 60,
  reason: 500,
}

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function Visualizer({ levels, compact = false }) {
  return (
    <div className={`flex items-end justify-center gap-1 ${compact ? 'h-8' : 'h-44'}`}>
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-2 rounded-full bg-gradient-to-t from-purple-400 via-white to-amber-200 shadow-[0_0_18px_rgba(196,181,253,0.45)]"
          style={{ height: `${Math.max(level * 100, 10)}%`, opacity: 0.45 + level * 0.55 }}
        />
      ))}
    </div>
  )
}

export default function MusicPage() {
  const { user } = useAuth()
  const { currentTrack, isPlaying, progress, duration, volume, levels, playTrack, toggle, seek, setPlaylist, playNext, playPrevious, setVolume } = useMusicPlayer()
  const [tracks, setTracks] = useState([])
  const [expandedTrackId, setExpandedTrackId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    artist: '',
    url: '',
    submittedByName: '',
    reason: '',
  })

  async function loadTracks() {
    try {
      setLoading(true)
      setError('')
      setTracks(await fetchTracks())
    } catch (loadError) {
      setError(loadError.message || 'Kon muziek niet laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTracks()
  }, [])

  useEffect(() => {
    setPlaylist(tracks)
  }, [tracks, setPlaylist])

  function handleAudioFileChange(event) {
    const selectedFile = event.target.files?.[0] ?? null
    setError('')

    if (selectedFile) {
      const validation = validateAudioFile(selectedFile)
      if (!validation.valid) {
        setAudioFile(null)
        setError(validation.message)
        return
      }
    }

    setAudioFile(selectedFile)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.title.trim()) return

    try {
      setSaving(true)
      setError('')

      let audio = null
      if (audioFile) audio = await uploadAudioToCloudinary(audioFile)

      const externalUrl = form.url.trim()
      const track = await createTrack(
        {
          title: form.title.trim(),
          artist: form.artist.trim(),
          sourceType: audio ? 'audio' : 'link',
          sourceUrl: audio?.url ?? externalUrl,
          externalUrl: externalUrl || audio?.url,
          audioPublicId: audio?.publicId,
          durationSeconds: audio?.durationSeconds,
          submittedByName: form.submittedByName.trim(),
          reason: form.reason.trim(),
        },
        user.id
      )

      setTracks((currentTracks) => [track, ...currentTracks])
      setExpandedTrackId(track.id)
      setForm({ title: '', artist: '', url: '', submittedByName: '', reason: '' })
      setAudioFile(null)
      setShowAddForm(false)
    } catch (saveError) {
      setError(saveError.message || 'Nummer toevoegen is mislukt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6" style={{ background: 'var(--cosmic-bg)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 15%, rgba(245,158,11,0.12), transparent 26%), radial-gradient(circle at 15% 75%, rgba(153,127,255,0.18), transparent 34%), radial-gradient(circle at 85% 65%, rgba(125,211,252,0.1), transparent 30%)',
        }}
      />

      <main className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:text-white">
            <ArrowLeft size={16} />
            Terug
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-200/15 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/45">
            <Radio size={14} />
            Soundtrack
          </div>
        </header>

        <section className="mb-8">
          <div className="rounded-[2rem] border border-white/10 bg-black/30 p-7 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/35">Voor Jens</p>
                <h1 className="text-4xl font-extralight tracking-[0.16em] text-white">Muziek</h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
                  Een verzameling aan nummers die passen bij Jens, je doen denken aan Jens of gewoon een nummer dat je mooi vindt. Luister naar de muziek terwijl je door de site navigeert, en voeg eventueel zelf een nummer toe aan de lijst.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm((current) => !current)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-purple-200/30 bg-purple-200/15 px-5 py-3 text-sm font-medium text-purple-50 shadow-[0_0_24px_rgba(196,181,253,0.12)] transition hover:bg-purple-200/25"
              >
                {showAddForm ? <X size={17} /> : <Plus size={17} />}
                {showAddForm ? 'Sluit' : 'Voeg nummer toe'}
              </button>
            </div>

            <AnimatePresence>
              {showAddForm && (
                <motion.form
                  onSubmit={handleSubmit}
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="relative mt-6 rounded-3xl border border-purple-200/15 bg-white/[0.04] p-6 shadow-2xl"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-full bg-purple-300/10 p-3 text-purple-100">
                      <Plus size={18} />
                    </div>
                    <div>
                      <h2 className="text-xl font-light text-white">Nummer toevoegen</h2>
                      <p className="text-xs text-white/40">Voeg een lied toe dat bij Jens past of je aan hem doet denken.</p>
                    </div>
                  </div>

                  {error && <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

                  <label className="mb-4 block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">Titel</span>
                    <input value={form.title} maxLength={TRACK_FIELD_LIMITS.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Titel van het nummer" />
                  </label>

                  <label className="mb-4 block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">Artiest</span>
                    <input value={form.artist} maxLength={TRACK_FIELD_LIMITS.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Artiest of band" />
                  </label>

                  <label className="mb-4 block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">YouTube/Spotify link (optioneel)</span>
                    <input value={form.url} maxLength={TRACK_FIELD_LIMITS.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Link naar originele versie" />
                  </label>

                  <label className="mb-4 block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">Jouw naam (optioneel)</span>
                    <input value={form.submittedByName} maxLength={TRACK_FIELD_LIMITS.submittedByName} onChange={(event) => setForm({ ...form, submittedByName: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Bijvoorbeeld: Ro-anus of Kir-anus" />
                  </label>

                  <label className="mb-4 block">
                    <span className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-white/35">
                      Waarom dit nummer? (optioneel)
                      <span className="tracking-normal text-white/25">{form.reason.length}/{TRACK_FIELD_LIMITS.reason}</span>
                    </span>
                    <textarea
                      value={form.reason}
                      maxLength={TRACK_FIELD_LIMITS.reason}
                      onChange={(event) => setForm({ ...form, reason: event.target.value })}
                      rows={4}
                      className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-purple-200/40"
                      placeholder="Een herinnering, gevoel of reden waarom dit nummer bij Jens past..."
                    />
                  </label>

                  <div className="mb-5">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">Audiobestand (optioneel)</span>
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.04] p-5 text-center transition hover:border-white/35">
                      {audioFile ? (
                        <div className="flex w-full items-center justify-between gap-3 text-left">
                          <div>
                            <p className="text-sm text-white/80">{audioFile.name}</p>
                            <p className="mt-1 text-xs text-white/35">Dit nummer kan straks door de hele site blijven spelen.</p>
                          </div>
                          <button type="button" onClick={(event) => { event.preventDefault(); setAudioFile(null) }} className="rounded-full bg-black/40 p-2 text-white/60">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="mb-3 text-white/45" size={28} />
                          <span className="text-sm text-white/70">Upload MP3, WAV, M4A, AAC of OGG</span>
                          <span className="mt-2 text-xs leading-5 text-white/35">
                            Zonder audio upload staat het nummer alleen als link in de muzieklijst. Het speelt dan niet door op de achtergrond en komt niet in de random achtergrondplaylist. Max {MEDIA_LIMITS.audioMaxBytes / 1024 / 1024}MB.
                          </span>
                        </>
                      )}
                      <input type="file" accept="audio/*" onChange={handleAudioFileChange} className="sr-only" />
                    </label>
                  </div>

                  <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-purple-100 disabled:opacity-50">
                    <Sparkles size={16} />
                    {saving ? 'Opslaan...' : 'Toevoegen'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="relative mt-8 rounded-3xl border border-purple-200/10 bg-white/[0.04] p-6">
              <Visualizer levels={levels} />
              <div className="mt-6 text-center">
                <p className="text-xs uppercase tracking-[0.24em] text-white/35">Nu speelt</p>
                <h2 className="mt-2 text-2xl font-light text-white">{currentTrack?.title ?? 'Nog geen nummer'}</h2>
                {currentTrack?.artist && <p className="mt-1 text-sm text-white/45">{currentTrack.artist}</p>}
                <div className="mt-6">
                  <button
                    type="button"
                    disabled={!duration}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      const nextProgress = ((event.clientX - rect.left) / rect.width) * duration
                      seek(nextProgress)
                    }}
                    className="h-2 w-full overflow-hidden rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Spoel door nummer"
                  >
                    <span className="block h-full rounded-full bg-purple-200" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
                  </button>
                  <p className="mt-2 text-xs text-white/35">{formatTime(progress)} / {formatTime(duration)}</p>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={playPrevious} className="rounded-full border border-white/10 bg-black/25 p-3 text-white/70 transition hover:bg-white/10 hover:text-white">
                    <SkipBack size={18} />
                  </button>
                  <button type="button" onClick={toggle} disabled={!currentTrack} className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-black transition hover:bg-purple-100 disabled:opacity-40">
                    {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button type="button" onClick={playNext} className="rounded-full border border-white/10 bg-black/25 p-3 text-white/70 transition hover:bg-white/10 hover:text-white">
                    <SkipForward size={18} />
                  </button>
                </div>
                <div className="mx-auto mt-6 flex max-w-sm items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-3">
                  <Volume2 size={16} className="text-white/45" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(event) => setVolume(event.target.value)}
                    className="w-full accent-purple-200"
                    aria-label="Volume"
                  />
                  <span className="w-10 text-right text-xs text-white/40">{Math.round(volume * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-black/30 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-white/45">Muziek laden...</div>
          ) : tracks.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-white/45">Nog geen nummers toegevoegd.</div>
          ) : (
            <div className="grid gap-4">
              {tracks.map((track) => {
                const expanded = expandedTrackId === track.id
                const playable = track.sourceType === 'audio'
                return (
                  <article key={track.id} className={`w-full min-w-0 rounded-3xl border p-4 transition ${expanded ? 'border-purple-200/35 bg-purple-200/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
                    <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedTrackId(expanded ? null : track.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpandedTrackId(expanded ? null : track.id)
                          }
                        }}
                        className="flex w-full min-w-0 sm:flex-1 items-center gap-4 text-left cursor-pointer outline-none"
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-white/45">
                          <Music size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-lg font-light text-white">{track.title}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/45">
                            <span>{track.artist || 'Onbekende artiest'}</span>
                            <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-white/35">
                              {playable ? 'Speelt op de site' : 'Alleen link'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        {playable ? (
                          <button type="button" onClick={() => currentTrack?.id === track.id ? toggle() : playTrack(track)} className="inline-flex items-center gap-2 rounded-full border border-purple-200/20 px-4 py-2 text-xs text-purple-100 transition hover:bg-purple-300/10">
                            {currentTrack?.id === track.id && isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            {currentTrack?.id === track.id && isPlaying ? 'Pauze' : 'Speel'}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/35">Geen achtergrondplayback</span>
                        )}
                        {track.externalUrl && (
                          <a href={track.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 transition hover:bg-white/10 hover:text-white">
                            <ExternalLink size={14} />
                            Open link
                          </a>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-5 border-t border-white/10 pt-5">
                        {(track.submittedByName || track.reason) && (
                          <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                            {track.submittedByName && <p className="mb-2 text-xs uppercase tracking-[0.22em] text-white/35">Toegevoegd door {track.submittedByName}</p>}
                            {track.reason && <p className="text-sm leading-6 text-white/70">“{track.reason}”</p>}
                          </div>
                        )}
                        {!playable && (
                          <p className="rounded-2xl border border-amber-200/15 bg-amber-200/10 px-4 py-3 text-sm leading-6 text-amber-50/80">
                            Voor dit nummer is geen audiobestand ge?pload. Het kan daarom niet door blijven spelen buiten dit tabblad en wordt niet meegenomen in de random achtergrondplaylist.
                          </p>
                        )}
                        {getYoutubeId(track.externalUrl ?? '') && (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                            <iframe
                              title={track.title}
                              src={`https://www.youtube.com/embed/${getYoutubeId(track.externalUrl)}`}
                              className="aspect-video w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
