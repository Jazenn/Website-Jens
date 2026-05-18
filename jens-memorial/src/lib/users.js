import { supabase } from './supabase'

function mapUser(record) {
  return {
    id: record.id,
    email: record.email ?? '',
    name: record.name ?? '',
    approved: record.approved === true,
    isAdmin: record.is_admin === true,
    createdAt: record.created_at,
  }
}

export async function fetchUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapUser)
}

export async function updateUserAccess(userId, updates) {
  const { data, error } = await supabase
    .from('users')
    .update({
      approved: updates.approved,
      is_admin: updates.isAdmin,
    })
    .eq('id', userId)
    .select('*')
    .single()

  if (error) throw error
  return mapUser(data)
}
