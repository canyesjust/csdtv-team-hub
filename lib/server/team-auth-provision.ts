import type { SupabaseClient, User } from '@supabase/supabase-js'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants'

export function validateTeamPassword(password: unknown): string {
  const value = typeof password === 'string' ? password : ''
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  return value
}

export function generateTemporaryPassword(): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `CsdTv${year}!${suffix}`
}

/** Paginated lookup — listUsers() only returns the first page by default. */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = email.toLowerCase()
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`Auth lookup failed: ${error.message}`)
    const match = data.users.find(u => u.email?.toLowerCase() === target)
    if (match) return match
    if (data.users.length < perPage) return null
    page += 1
    if (page > 50) return null
  }
}

export async function ensureAuthUserWithPassword(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<{ authUserId: string; created: boolean }> {
  const existing = await findAuthUserByEmail(supabase, email)
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (error) throw new Error(error.message || 'Could not update password')
    return { authUserId: existing.id, created: false }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(error.message || 'Could not create auth account')
  return { authUserId: data.user.id, created: true }
}
