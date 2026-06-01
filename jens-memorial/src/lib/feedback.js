import { supabase } from './supabase'

function mapFeedback(record) {
  return {
    id: record.id,
    userId: record.user_id,
    userEmail: record.user_email,
    userName: record.user_name ?? 'Onbekend',
    type: record.type,
    message: record.message,
    resolved: record.resolved === true,
    createdAt: record.created_at,
  }
}

export async function submitFeedback({ userId, userEmail, userName, type, message }) {
  const { data, error } = await supabase
    .from('feedback')
    .insert({
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      type,
      message,
    })
    .select('*')
    .single()

  if (error) throw error
  return mapFeedback(data)
}

export async function fetchFeedback() {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapFeedback)
}

export async function updateFeedbackResolved(feedbackId, resolved) {
  const { data, error } = await supabase
    .from('feedback')
    .update({ resolved })
    .eq('id', feedbackId)
    .select('*')
    .single()

  if (error) throw error
  return mapFeedback(data)
}

export async function deleteFeedback(feedbackId) {
  const { error } = await supabase
    .from('feedback')
    .delete()
    .eq('id', feedbackId)

  if (error) throw error
}

export async function notifyFeedback({ email, name, type, message }) {
  try {
    await supabase.functions.invoke('notify-feedback', {
      body: { email, name, type, message },
    })
  } catch (error) {
    console.error('notifyFeedback error:', error)
  }
}

