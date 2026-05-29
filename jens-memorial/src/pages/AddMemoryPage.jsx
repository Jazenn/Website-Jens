import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Image, Quote, Send, Upload, Video, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { MEDIA_LIMITS, uploadMediaToCloudinary, validateMediaFile } from '../lib/cloudinary'
import { createMemory } from '../lib/memories'

const MEMORY_TYPES = [
  { id: 'foto', label: 'Foto / Video', description: 'Voeg één of meerdere foto\'s en video\'s toe (collage).', icon: Image, color: '#ffffff', accept: 'image/*,video/*' },
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
  const [files, setFiles] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  // Quote extension states
  const [quoteBy, setQuoteBy] = useState('')
  const [quoteMonth, setQuoteMonth] = useState('')
  const [quoteYear, setQuoteYear] = useState('')
  const [quoteContext, setQuoteContext] = useState('')

  const selectedType = useMemo(() => MEMORY_TYPES.find((memoryType) => memoryType.id === type), [type])
  
  const previewUrls = useMemo(() => {
    return files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))
  }, [files])

  const needsFile = type === 'foto'
  const bodyLimit = type === 'tekst' ? MEMORY_FIELD_LIMITS.text : type === 'quote' ? MEMORY_FIELD_LIMITS.quote : MEMORY_FIELD_LIMITS.body

  useEffect(() => {
    return () => {
      previewUrls.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [previewUrls])

  const handleBodyChange = (value) => {
    if (type === 'quote') {
      const lines = value.split('\n')
      if (lines.length > 6) {
        return
      }
    }
    setBody(value)
  }

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

  const handleFilesChange = (event) => {
    const selectedList = event.target.files ? Array.from(event.target.files) : []
    setError('')

    if (files.length + selectedList.length > 8) {
      setError('Je kunt maximaal 8 bestanden toevoegen aan een collage.')
      return
    }

    const newFiles = []
    for (let f of selectedList) {
      const isImg = ALLOWED_IMAGE_TYPES.includes(f.type)
      const isVid = ALLOWED_VIDEO_TYPES.includes(f.type)
      if (!isImg && !isVid) {
        setError(`Bestand "${f.name}" is geen ondersteunde foto of video.`)
        return
      }
      if (isImg && f.size > MEDIA_LIMITS.imageMaxBytes) {
        setError(`Foto "${f.name}" is te groot (max ${MEDIA_LIMITS.imageMaxBytes / 1024 / 1024}MB).`)
        return
      }
      if (isVid && f.size > MEDIA_LIMITS.videoMaxBytes) {
        setError(`Video "${f.name}" is te groot (max ${MEDIA_LIMITS.videoMaxBytes / 1024 / 1024}MB).`)
        return
      }
      newFiles.push(f)
    }

    setFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const moveFile = (index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= files.length) return
    const newFiles = [...files]
    const temp = newFiles[index]
    newFiles[index] = newFiles[nextIndex]
    newFiles[nextIndex] = temp
    setFiles(newFiles)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (type === 'tekst' && !body.trim()) return
    if (type === 'quote' && !body.trim()) {
      setError('Vul de quote in.')
      return
    }
    if (needsFile && files.length === 0) {
      setError('Kies eerst minstens één bestand voor deze herinnering.')
      return
    }

    try {
      setUploading(true)

      let assets = []
      let media = null

      if (needsFile) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          const fileType = ALLOWED_IMAGE_TYPES.includes(f.type) ? 'foto' : 'video'
          const result = await uploadMediaToCloudinary(f, fileType)
          assets.push({
            url: result.url,
            thumbnailUrl: result.thumbnailUrl,
            resourceType: result.resourceType,
            bytes: result.bytes,
            originalFilename: result.originalFilename,
          })
        }
        media = assets[0]
      }

      const fallbackTitle = type === 'foto' ? (files.length > 1 ? 'Herinnerings collage' : 'Herinnerings foto') : type === 'quote' ? 'Herinnerings quote' : 'Herinnering'
      
      let finalizedBody = body.trim()
      if (type === 'quote') {
        finalizedBody = JSON.stringify({
          quote: body.trim(),
          quoteBy: quoteBy.trim(),
          month: quoteMonth,
          year: quoteYear.trim(),
          context: quoteContext.trim(),
        })
      } else if (type === 'foto' && files.length > 1) {
        finalizedBody = JSON.stringify({
          isCollage: true,
          caption: body.trim(),
          assets,
        })
      }

      const memory = {
        id: `custom-${Date.now()}`,
        type,
        title: title.trim() || fallbackTitle,
        author: author.trim(),
        body: finalizedBody,
        date: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        fileName: media?.originalFilename ?? '',
        mediaProvider: media?.provider ?? (media ? 'cloudinary' : null),
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
    setFiles([])
    setError('')
    setSubmitted(false)
    setQuoteBy('')
    setQuoteMonth('')
    setQuoteYear('')
    setQuoteContext('')
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
                <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/45">Bestanden ({files.length}/8)</span>
                {files.length > 0 ? (
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 mb-4">
                    {previewUrls.map((p, index) => {
                      const isVid = ALLOWED_VIDEO_TYPES.includes(p.file.type)
                      return (
                        <div key={p.url} className="relative aspect-square rounded-2xl border border-white/10 bg-black/35 overflow-hidden group select-none">
                          {/* Preview media */}
                          {isVid ? (
                            <video src={p.url} className="h-full w-full object-cover pointer-events-none" muted />
                          ) : (
                            <img src={p.url} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
                          )}
                          
                          {/* Index badge */}
                          <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-semibold text-white/95 backdrop-blur-md">
                            {index + 1}
                          </span>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              removeFile(index)
                            }}
                            className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1.5 text-white/80 hover:text-white backdrop-blur-md hover:bg-black/80 transition"
                          >
                            <X size={14} />
                          </button>

                          {/* Reordering buttons always visible at bottom */}
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 flex justify-between items-center">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                moveFile(index, -1)
                              }}
                              className="rounded-lg bg-white/15 p-1 text-white hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none transition"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <span className="text-[10px] text-white/60 tracking-wider font-light">Volgorde</span>
                            <button
                              type="button"
                              disabled={index === files.length - 1}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                moveFile(index, 1)
                              }}
                              className="rounded-lg bg-white/15 p-1 text-white hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none transition"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* Add more button */}
                    {files.length < 8 && (
                      <label className="relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/40 transition">
                        <Upload className="text-white/45 mb-1" size={20} />
                        <span className="text-[10px] uppercase tracking-wider text-white/45">Voeg toe</span>
                        <input
                          type="file"
                          accept={selectedType.accept}
                          onChange={handleFilesChange}
                          className="hidden"
                          multiple
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.04] p-5 text-center transition hover:border-white/35">
                    <Upload className="mb-4 text-white/45" size={30} />
                    <span className="text-sm text-white/70">Kies bestanden voor deze herinnering</span>
                    <span className="mt-2 text-xs text-white/35">
                      Kies maximaal 8 foto's of video's
                    </span>
                    <span className="mt-1 text-[10px] text-white/25">
                      Foto's tot 8MB · Video's tot 100MB
                    </span>
                    <input
                      type="file"
                      accept={selectedType.accept}
                      onChange={handleFilesChange}
                      className="hidden"
                      multiple
                    />
                  </label>
                )}
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
