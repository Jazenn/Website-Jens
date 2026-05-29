import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Image, Quote, Send, Upload, Video, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { MEDIA_LIMITS, uploadMediaToCloudinary, validateMediaFile } from '../lib/cloudinary'
import { createMemory } from '../lib/memories'

const MEMORY_TYPES = [
  { id: 'foto', label: 'Foto', description: 'Een beeld van een moment, plek of herinnering.', icon: Image, color: '#ffffff', accept: 'image/*' },
  { id: 'video', label: 'Video', description: 'Een kort fragment dat iets van Jens laat zien.', icon: Video, color: '#997fff', accept: 'video/*' },
  { id: 'quote', label: 'Quote', description: 'Iets wat hij zei, of iets dat bij hem past.', icon: Quote, color: '#95ff9a' },
  { id: 'tekst', label: 'Tekstje', description: 'Een verhaal, gedachte of persoonlijk bericht.', icon: FileText, color: '#7dd3fc' },
]
const CUSTOM_MEMORIES_KEY = 'jens-custom-memories'
const PULSING_MEMORIES_KEY = 'jens-pulsing-memory-ids'
const MEMORY_FIELD_LIMITS = {
  title: 100,
  author: 60,
  quote: 500,
  body: 500,
  text: 1200,
}
const DUTCH_MONTHS = [
  'Januari',
  'Februari',
  'Maart',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Augustus',
  'September',
  'Oktober',
  'November',
  'December',
]

export default function AddMemoryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [type, setType] = useState('foto')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  // Quote extension states
  const [quoteBy, setQuoteBy] = useState('')
  const [quoteMonth, setQuoteMonth] = useState('')
  const [quoteYear, setQuoteYear] = useState('')
  const [quoteContext, setQuoteContext] = useState('')

  const selectedType = useMemo(() => MEMORY_TYPES.find((memoryType) => memoryType.id === type), [type])
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  const needsFile = type === 'foto' || type === 'video'
  const bodyLimit = type === 'tekst' ? MEMORY_FIELD_LIMITS.text : type === 'quote' ? MEMORY_FIELD_LIMITS.quote : MEMORY_FIELD_LIMITS.body

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleBodyChange = (value) => {
    if (type === 'quote') {
      const lines = value.split('\n')
      if (lines.length > 6) {
        return
      }
    }
    setBody(value)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (type === 'tekst' && !body.trim()) return
    if (type === 'quote' && !body.trim()) {
      setError('Vul de quote in.')
      return
    }
    if (needsFile && !file) {
      setError('Kies eerst een bestand voor deze herinnering.')
      return
    }

    let media = null

    if (needsFile) {
      const validation = validateMediaFile(file, type)
      if (!validation.valid) {
        setError(validation.message)
        return
      }
    }

    try {
      setUploading(true)

      if (needsFile) {
        media = await uploadMediaToCloudinary(file, type)
      }

      const fallbackTitle = type === 'foto' ? 'Herinnerings foto' : type === 'video' ? 'Herinnerings video' : type === 'quote' ? 'Herinnerings quote' : 'Herinnering'
      
      let finalizedBody = body.trim()
      if (type === 'quote') {
        finalizedBody = JSON.stringify({
          quote: body.trim(),
          quoteBy: quoteBy.trim(),
          month: quoteMonth,
          year: quoteYear.trim(),
          context: quoteContext.trim(),
        })
      }

      const memory = {
        id: `custom-${Date.now()}`,
        type,
        title: title.trim() || fallbackTitle,
        author: author.trim(),
        body: finalizedBody,
        date: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        fileName: file?.name ?? '',
        mediaProvider: media?.provider ?? null,
        mediaUrl: media?.url ?? null,
        mediaPublicId: media?.publicId ?? null,
        mediaResourceType: media?.resourceType ?? null,
        mediaThumbnailUrl: media?.thumbnailUrl ?? null,
        mediaSize: media?.bytes ?? null,
        candleCount: 0,
        isCoreMemory: false,
        isCustom: true,
      }

      if (user?.id) {
        const createdMemory = await createMemory(memory, user.id)
        memory.id = createdMemory.id
      }

      const existingMemories = user?.id ? [] : JSON.parse(localStorage.getItem(CUSTOM_MEMORIES_KEY) ?? '[]')
      const existingPulseIds = JSON.parse(localStorage.getItem(PULSING_MEMORIES_KEY) ?? '[]')
      if (!user?.id) localStorage.setItem(CUSTOM_MEMORIES_KEY, JSON.stringify([...existingMemories, memory]))
      localStorage.setItem(PULSING_MEMORIES_KEY, JSON.stringify([...new Set([...existingPulseIds, memory.id])]))
      setSubmitted(true)
      navigate('/')
    } catch (uploadError) {
      setError(uploadError.message || 'Uploaden is mislukt. Probeer het opnieuw.')
    } finally {
      setUploading(false)
    }
  }

  function handleTypeChange(nextType) {
    setType(nextType)
    setFile(null)
    setError('')
    setSubmitted(false)
    setQuoteBy('')
    setQuoteMonth('')
    setQuoteYear('')
    setQuoteContext('')
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] ?? null
    setError('')

    if (selectedFile) {
      const validation = validateMediaFile(selectedFile, type)
      if (!validation.valid) {
        setFile(null)
        setError(validation.message)
        return
      }
    }

    setFile(selectedFile)
  }

  const SelectedIcon = selectedType.icon

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6" style={{ background: 'var(--cosmic-bg)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(153,127,255,0.18), transparent 30%), radial-gradient(circle at 85% 15%, rgba(149,255,154,0.08), transparent 28%), radial-gradient(circle at 50% 90%, rgba(125,211,252,0.12), transparent 34%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col">
        <header className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur-md transition hover:border-white/25 hover:text-white"
          >
            <ArrowLeft size={16} />
            Terug
          </Link>
          <p className="hidden text-xs uppercase tracking-[0.35em] text-white/35 sm:block">Nieuwe herinnering</p>
        </header>

        <main className="grid flex-1 items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 text-xs uppercase tracking-[0.35em]"
              style={{ color: 'var(--text-muted)' }}
            >
              Voor Jens
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="max-w-xl text-4xl font-extralight leading-tight tracking-[0.16em] text-white sm:text-5xl"
            >
              Voeg een lichtpuntje toe aan de constellatie
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="mt-6 max-w-lg text-sm leading-7 text-white/55"
            >
              Kies wat je wilt delen. Na toevoegen verschijnt je herinnering direct als nieuw opgloeiend bolletje in de constellatie.
            </motion.p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {MEMORY_TYPES.map((memoryType) => {
                const Icon = memoryType.icon
                const active = memoryType.id === type

                return (
                  <button
                    key={memoryType.id}
                    type="button"
                    onClick={() => handleTypeChange(memoryType.id)}
                    className={`rounded-3xl border p-4 text-left backdrop-blur-md transition ${
                      active ? 'border-white/35 bg-white/12 shadow-2xl' : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                    }`}
                  >
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `${memoryType.color}22`, color: memoryType.color }}>
                      <Icon size={20} />
                    </span>
                    <span className="block text-sm font-medium text-white">{memoryType.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-white/45">{memoryType.description}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            onSubmit={handleSubmit}
            className="rounded-[2rem] border border-white/10 bg-black/30 p-5 shadow-2xl backdrop-blur-xl sm:p-7"
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${selectedType.color}24`, color: selectedType.color }}>
                <SelectedIcon size={22} />
              </span>
              <div>
                <h2 className="text-lg font-light tracking-[0.12em] text-white">{selectedType.label} toevoegen</h2>
                <p className="text-xs text-white/45">Wordt straks een nieuw bolletje in de constellatie.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Titel (optioneel)</span>
                <input
                  value={title}
                  maxLength={MEMORY_FIELD_LIMITS.title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Bijvoorbeeld: Zomeravond"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-200/45"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Ingezonden door (optioneel)</span>
                <input
                  value={author}
                  maxLength={MEMORY_FIELD_LIMITS.author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Jouw naam (als inzender)"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-200/45"
                />
              </label>
            </div>

            {needsFile && (
              <div className="mt-4">
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Bestand</span>
                <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.04] p-5 text-center transition hover:border-white/35">
                  {previewUrl ? (
                    <div className="relative w-full overflow-hidden rounded-2xl">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          setFile(null)
                        }}
                        className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white/80 backdrop-blur-md"
                      >
                        <X size={16} />
                      </button>
                      {type === 'foto' ? (
                        <img src={previewUrl} alt="Voorbeeld" className="max-h-64 w-full object-cover" />
                      ) : (
                        <video src={previewUrl} className="max-h-64 w-full object-cover" controls />
                      )}
                    </div>
                  ) : (
                    <>
                      <Upload className="mb-4 text-white/45" size={30} />
                      <span className="text-sm text-white/70">Kies een bestand voor deze herinnering</span>
                      <span className="mt-2 text-xs text-white/35">
                        {type === 'foto'
                          ? `JPG, PNG, WebP or GIF · max ${MEDIA_LIMITS.imageMaxBytes / 1024 / 1024}MB`
                          : `MP4, MOV of WebM · max ${MEDIA_LIMITS.videoMaxBytes / 1024 / 1024}MB`}
                      </span>
                    </>
                  )}
                  <input type="file" accept={selectedType.accept} onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-white/45">
                <span>{type === 'tekst' ? 'Herinnering (verplicht)' : type === 'quote' ? 'Quote (verplicht)' : 'Herinnering (optioneel)'}</span>
                <span className="tracking-normal text-white/25">{body.length}/{bodyLimit}</span>
              </span>
              <textarea
                value={body}
                maxLength={bodyLimit}
                onChange={(event) => handleBodyChange(event.target.value)}
                placeholder={type === 'quote' ? '“Typ hier de quote...” (max. 6 regels)' : 'Schrijf hier wat je wilt delen...'}
                rows={6}
                required={type === 'tekst' || type === 'quote'}
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-purple-200/45"
              />
            </label>

            {type === 'quote' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-6 grid gap-4 border-t border-white/10 pt-6 text-left"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Wie heeft dit gezegd? (optioneel)</span>
                    <input
                      value={quoteBy}
                      maxLength={60}
                      onChange={(event) => setQuoteBy(event.target.value)}
                      placeholder="Bijv. Jens, of een vriend"
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-200/45"
                    />
                  </label>

                  <div className="grid gap-3 grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Maand (optioneel)</span>
                      <select
                        value={quoteMonth}
                        onChange={(event) => setQuoteMonth(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-[14px] text-sm text-white outline-none transition focus:border-purple-200/45 [&>option]:bg-[#18181b] [&>option]:text-white"
                      >
                        <option value="">Selecteer...</option>
                        {DUTCH_MONTHS.map((m) => (
                          <option key={m} value={m.toLowerCase()}>{m}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Jaar (optioneel)</span>
                      <input
                        type="text"
                        value={quoteYear}
                        maxLength={4}
                        onChange={(event) => setQuoteYear(event.target.value.replace(/\D/g, ''))}
                        placeholder="Bijv. 2023"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-200/45"
                      />
                    </label>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-white/45">
                    <span>Context / Toelichting (optioneel)</span>
                    <span className="tracking-normal text-white/25">{quoteContext.length}/500</span>
                  </span>
                  <textarea
                    value={quoteContext}
                    maxLength={500}
                    onChange={(event) => setQuoteContext(event.target.value)}
                    placeholder="Voeg wat context of een korte toelichting toe..."
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-purple-200/45"
                  />
                </label>
              </motion.div>
            )}

            {submitted && (
              <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                Herinnering toegevoegd. Je wordt teruggestuurd naar de constellatie.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={uploading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} />
              {uploading ? 'Media uploaden...' : 'Herinnering voorbereiden'}
            </button>
          </motion.form>
        </main>
      </div>
    </div>
  )
}
