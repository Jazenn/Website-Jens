import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Music, Pause, Play, Plus, Radio, Sparkles, Upload, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { MEDIA_LIMITS, uploadAudioToCloudinary, validateAudioFile } from '../lib/cloudinary'
import { createTrack, fetchTracks, getYoutubeId } from '../lib/tracks'

const TEST_TRACK_URL = 'https://www.youtube.com/watch?v=ADFEcvI-Vfk'

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
  const { currentTrack, isPlaying, progress, duration, levels, playTrack, toggle, setPlaylist } = useMusicPlayer()
  const [tracks, setTracks] = useState([])
  const [expandedTrackId, setExpandedTrackId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [form, setForm] = useState({
    title: '',
    artist: '',
    url: TEST_TRACK_URL,
  })

  const expandedTrack = useMemo(() => tracks.find((track) => track.id === expandedTrackId), [tracks, expandedTrackId])
  const selectedYoutubeId = useMemo(() => getYoutubeId(expandedTrack?.externalUrl ?? currentTrack?.externalUrl ?? ''), [expandedTrack, currentTrack])

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

  useEffect(() => {
    if (currentTrack?.id) setExpandedTrackId(currentTrack.id)
  }, [currentTrack?.id])

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
        },
        user.id
      )

      setTracks((currentTracks) => [track, ...currentTracks])
      setExpandedTrackId(track.id)
      setForm({ title: '', artist: '', url: '' })
      setAudioFile(null)
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

        <section className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/30 p-7 shadow-2xl backdrop-blur-xl">
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/35">Voor Jens</p>
            <h1 className="text-4xl font-extralight tracking-[0.16em] text-white">Muziek</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55">
              De site-player gebruikt ge?ploade audio, zodat muziek door de hele site kan blijven spelen. Een YouTube of Spotify link kan erbij als bron of herinnering.
            </p>

            <div className="mt-8 rounded-3xl border border-purple-200/10 bg-white/[0.04] p-6">
              <Visualizer levels={levels} />
              <div className="mt-6 text-center">
                <p className="text-xs uppercase tracking-[0.24em] text-white/35">Nu speelt</p>
                <h2 className="mt-2 text-2xl font-light text-white">{currentTrack?.title ?? 'Nog geen nummer'}</h2>
                {currentTrack?.artist && <p className="mt-1 text-sm text-white/45">{currentTrack.artist}</p>}
                {currentTrack?.sourceType === 'audio' && (
                  <div className="mt-5">
                    <div className="h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-purple-200" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-white/35">{formatTime(progress)} / {formatTime(duration)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-black/30 p-7 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-full bg-purple-300/10 p-3 text-purple-100">
                <Plus size={18} />
              </div>
              <div>
                <h2 className="text-xl font-light text-white">Nummer toevoegen</h2>
                <p className="text-xs text-white/40">Audio uploaden is optioneel, maar nodig voor volledige integratie.</p>
              </div>
            </div>

            {error && <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

            <label className="mb-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">Titel</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Titel van het nummer" />
            </label>

            <label className="mb-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">Artiest</span>
              <input value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Artiest of band" />
            </label>

            <label className="mb-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">YouTube/Spotify link (optioneel)</span>
              <input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-200/40" placeholder="Link naar originele versie" />
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
                <input type="file" accept="audio/*" onChange={handleAudioFileChange} className="hidden" />
              </label>
            </div>

            <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-purple-100 disabled:opacity-50">
              <Sparkles size={16} />
              {saving ? 'Opslaan...' : 'Toevoegen'}
            </button>
          </form>
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
                  <article key={track.id} className={`rounded-3xl border p-4 transition ${expanded ? 'border-purple-200/35 bg-purple-200/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <button type="button" onClick={() => setExpandedTrackId(expanded ? null : track.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-white/45">
                          <Music size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-light text-white">{track.title}</h3>
                          <p className="text-sm text-white/45">{track.artist || 'Onbekende artiest'} ? {playable ? 'site-player' : 'link only'}</p>
                        </div>
                      </button>

                      <div className="flex flex-wrap gap-2">
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
                        {currentTrack?.id === track.id && playable && (
                          <div className="mb-4 rounded-2xl border border-purple-200/15 bg-black/20 p-4">
                            <Visualizer levels={levels} compact />
                            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-purple-200" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
                            </div>
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

        {selectedYoutubeId && !expandedTrack && (
          <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-2xl backdrop-blur-xl">
            <iframe
              title={currentTrack?.title ?? 'YouTube nummer'}
              src={`https://www.youtube.com/embed/${selectedYoutubeId}`}
              className="aspect-video w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </section>
        )}
      </main>
    </div>
  )
}
