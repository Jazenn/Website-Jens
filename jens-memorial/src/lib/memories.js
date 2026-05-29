import { supabase } from './supabase'

export const CORE_MEMORY_CANDLE_THRESHOLD = 4

export function mapMemoryRecord(record, index = 0, total = 1) {
  const candleCount = record.candle_count ?? 0
  const isPinnedCoreMemory = record.is_core_memory ?? false

  let quoteData = null
  if (record.type === 'quote' && record.body) {
    try {
      if (record.body.trim().startsWith('{')) {
        quoteData = JSON.parse(record.body)
      }
    } catch (e) {
      // Ignore parsing errors for legacy non-JSON quotes
    }
  }

  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body ?? '',
    author: record.author ?? '',
    date: new Date(record.created_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    fileName: record.file_name ?? '',
    mediaProvider: record.media_provider ?? null,
    mediaUrl: record.media_url ?? null,
    mediaPublicId: record.media_public_id ?? null,
    mediaResourceType: record.media_resource_type ?? null,
    mediaThumbnailUrl: record.media_thumbnail_url ?? null,
    mediaSize: record.media_size ?? null,
    candleCount,
    isPinnedCoreMemory,
    isCoreMemory: isPinnedCoreMemory || candleCount >= CORE_MEMORY_CANDLE_THRESHOLD,
    isCustom: true,
    createdAt: record.created_at,
    positionIndex: index,
    positionTotal: total,
    quoteData,
  }
}

export async function fetchMemories() {
  const { data, error } = await supabase
    .from('memories')
    .select('*, memory_candles(id)')
    .order('created_at', { ascending: true })

  if (error) throw error

  const total = data?.length ?? 0
  return (data ?? []).map((record, index) =>
    mapMemoryRecord(
      {
        ...record,
        candle_count: record.memory_candles?.length ?? 0,
      },
      index,
      total
    )
  )
}

export async function createMemory(memory, userId) {
  const { data, error } = await supabase
    .from('memories')
    .insert({
      type: memory.type,
      title: memory.title,
      body: memory.body || null,
      author: memory.author || null,
      created_by: userId,
      submitted_by: userId,
      media_provider: memory.mediaProvider,
      media_url: memory.mediaUrl,
      media_public_id: memory.mediaPublicId,
      media_resource_type: memory.mediaResourceType,
      media_thumbnail_url: memory.mediaThumbnailUrl,
      media_size: memory.mediaSize,
      file_name: memory.fileName || null,
      is_core_memory: false,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function fetchUserCandleIds(userId) {
  if (!userId) return []

  const { data, error } = await supabase
    .from('memory_candles')
    .select('memory_id')
    .eq('user_id', userId)

  if (error) throw error
  return (data ?? []).map((candle) => candle.memory_id)
}

export async function lightCandle(memoryId, userId) {
  const { error } = await supabase
    .from('memory_candles')
    .upsert({ memory_id: memoryId, user_id: userId }, { onConflict: 'memory_id,user_id' })

  if (error) throw error
}

export async function removeCandle(memoryId, userId) {
  const { error } = await supabase
    .from('memory_candles')
    .delete()
    .eq('memory_id', memoryId)
    .eq('user_id', userId)

  if (error) throw error
}
export async function deleteMemory(memoryId) {
  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', memoryId)

  if (error) throw error
}

export async function updateMemory(memoryId, updates) {
  const { data, error } = await supabase
    .from('memories')
    .update({
      title: updates.title,
      author: updates.author || null,
      body: updates.body || null,
    })
    .eq('id', memoryId)
    .select('*, memory_candles(id)')
    .single()

  if (error) throw error

  return mapMemoryRecord({
    ...data,
    candle_count: data.memory_candles?.length ?? 0,
  })
}

export async function updateMemoryCoreStatus(memoryId, isCoreMemory) {
  const { data, error } = await supabase
    .from('memories')
    .update({ is_core_memory: isCoreMemory })
    .eq('id', memoryId)
    .select('*, memory_candles(id)')
    .single()

  if (error) throw error

  return mapMemoryRecord({
    ...data,
    candle_count: data.memory_candles?.length ?? 0,
  })
}
