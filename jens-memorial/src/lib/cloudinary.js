const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
const CLOUDINARY_AUDIO_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_AUDIO_UPLOAD_PRESET ?? CLOUDINARY_UPLOAD_PRESET

export const MEDIA_LIMITS = {
  imageMaxBytes: 8 * 1024 * 1024,
  videoMaxBytes: 100 * 1024 * 1024,
  audioMaxBytes: 25 * 1024 * 1024,
  compressedImageMaxWidth: 1920,
  compressedImageQuality: 0.82,
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg']

export function validateMediaFile(file, memoryType) {
  if (!file) return { valid: false, message: 'Kies eerst een bestand.' }

  if (memoryType === 'foto') {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { valid: false, message: 'Gebruik een JPG, PNG, WebP of GIF bestand.' }
    }

    if (file.size > MEDIA_LIMITS.imageMaxBytes) {
      return { valid: false, message: 'Foto’s mogen maximaal 8MB zijn voordat ze worden gecomprimeerd.' }
    }
  }

  if (memoryType === 'video') {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return { valid: false, message: 'Gebruik een MP4, MOV of WebM video.' }
    }

    if (file.size > MEDIA_LIMITS.videoMaxBytes) {
      return { valid: false, message: 'Video’s mogen maximaal 100MB zijn.' }
    }
  }

  return { valid: true, message: '' }
}

export async function prepareMediaFile(file, memoryType) {
  if (memoryType !== 'foto' || file.type === 'image/gif') return file
  return compressImage(file)
}

async function compressImage(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(imageUrl)
    const scale = Math.min(MEDIA_LIMITS.compressedImageMaxWidth / Math.max(image.width, image.height), 1)
    const width = Math.round(image.width * scale)
    const height = Math.round(image.height * scale)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    canvas.width = width
    canvas.height = height
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', MEDIA_LIMITS.compressedImageQuality)
    })

    if (!blob) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export async function uploadMediaToCloudinary(file, memoryType) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary is nog niet geconfigureerd. Controleer VITE_CLOUDINARY_CLOUD_NAME en VITE_CLOUDINARY_UPLOAD_PRESET.')
  }

  const validation = validateMediaFile(file, memoryType)
  if (!validation.valid) throw new Error(validation.message)

  const preparedFile = await prepareMediaFile(file, memoryType)
  const formData = new FormData()
  formData.append('file', preparedFile)
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  formData.append('folder', 'jens-memorial')

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Uploaden naar Cloudinary is mislukt.')
  }

  return {
    provider: 'cloudinary',
    url: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type,
    bytes: data.bytes,
    format: data.format,
    originalFilename: data.original_filename,
    thumbnailUrl:
      data.resource_type === 'video'
        ? data.secure_url.replace('/upload/', '/upload/so_0,w_900,c_limit,f_jpg/')
        : data.secure_url.replace('/upload/', '/upload/w_1200,c_limit,f_auto,q_auto/'),
  }
}


export function validateAudioFile(file) {
  if (!file) return { valid: false, message: 'Kies eerst een audiobestand.' }

  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    return { valid: false, message: 'Gebruik een MP3, WAV, M4A, AAC of OGG bestand.' }
  }

  if (file.size > MEDIA_LIMITS.audioMaxBytes) {
    return { valid: false, message: `Audio mag maximaal ${MEDIA_LIMITS.audioMaxBytes / 1024 / 1024}MB zijn.` }
  }

  return { valid: true, message: '' }
}

export async function uploadAudioToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_AUDIO_UPLOAD_PRESET) {
    throw new Error('Cloudinary audio is nog niet geconfigureerd. Controleer VITE_CLOUDINARY_CLOUD_NAME en VITE_CLOUDINARY_AUDIO_UPLOAD_PRESET.')
  }

  const validation = validateAudioFile(file)
  if (!validation.valid) throw new Error(validation.message)

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_AUDIO_UPLOAD_PRESET)
  formData.append('folder', 'jens-memorial/music')

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Audio uploaden naar Cloudinary is mislukt.')
  }

  return {
    provider: 'cloudinary',
    url: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type,
    bytes: data.bytes,
    format: data.format,
    durationSeconds: data.duration ? Math.round(data.duration) : null,
    originalFilename: data.original_filename,
  }
}
