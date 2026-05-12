import { supabase } from './supabase'

export function getYoutubeId(url) {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.hostname.includes('youtu.be')) return parsedUrl.pathname.slice(1)
    if (parsedUrl.hostname.includes('youtube.com')) return parsedUrl.searchParams.get('v')
  } catch {
    return null
  }

  return null
}

export function mapTrackRecord(record) {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist ?? '',
    sourceType: record.source_type,
    sourceUrl: record.source_url,
    externalUrl: record.external_url ?? record.source_url,
    artworkUrl: record.artwork_url ?? '',
    audioPublicId: record.audio_public_id ?? '',
    durationSeconds: record.duration_seconds ?? null,
    submittedByName: record.submitted_by_name ?? '',
    reason: record.reason ?? '',
    addedBy: record.added_by ?? null,
    approved: record.approved ?? true,
    createdAt: record.created_at,
    youtubeId: getYoutubeId(record.external_url ?? record.source_url),
  }
}

export async function fetchTracks() {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapTrackRecord)
}

export async function createTrack(track, userId) {
  const { data, error } = await supabase
    .from('tracks')
    .insert({
      title: track.title,
      artist: track.artist || null,
      source_type: track.sourceType,
      source_url: track.sourceUrl,
      external_url: track.externalUrl || track.sourceUrl,
      artwork_url: track.artworkUrl || null,
      audio_public_id: track.audioPublicId || null,
      duration_seconds: track.durationSeconds || null,
      submitted_by_name: track.submittedByName || null,
      reason: track.reason || null,
      added_by: userId,
      approved: true,
    })
    .select('*')
    .single()

  if (error) throw error
  return mapTrackRecord(data)
}

export async function deleteTrack(trackId) {
  const { error } = await supabase
    .from('tracks')
    .delete()
    .eq('id', trackId)

  if (error) throw error
}

export async function updateTrack(trackId, updates) {
  const { data, error } = await supabase
    .from('tracks')
    .update({
      title: updates.title,
      artist: updates.artist || null,
      external_url: updates.externalUrl || null,
      submitted_by_name: updates.submittedByName || null,
      reason: updates.reason || null,
    })
    .eq('id', trackId)
    .select('*')
    .single()

  if (error) throw error
  return mapTrackRecord(data)
}
