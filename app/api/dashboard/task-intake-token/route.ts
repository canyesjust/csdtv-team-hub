import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { isStudentInternRole } from '@/lib/roles'
import { generateTaskIntakeTokenPlain, hashTaskIntakeToken } from '@/lib/task-intake'

export const dynamic = 'force-dynamic'

function siteOrigin(): string {
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return siteBase ? siteBase.replace(/\/$/, '') : ''
}

export async function GET() {
  const user = await getAuthenticatedTeamUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isStudentInternRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, key)
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('task_intake_tokens')
    .select('id, created_at, expires_at, last_used_at, token_plain')
    .eq('team_user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ active: false })
  }

  if (data.expires_at && data.expires_at < nowIso) {
    return NextResponse.json({ active: false })
  }

  const origin = siteOrigin()
  const plain = (data as { token_plain?: string | null }).token_plain
  const fullUrl =
    plain && plain.length > 0
      ? (origin ? `${origin}/submit-task?t=${encodeURIComponent(plain)}` : `/submit-task?t=${encodeURIComponent(plain)}`)
      : null

  return NextResponse.json({
    active: true,
    id: data.id,
    created_at: data.created_at,
    expires_at: data.expires_at,
    last_used_at: data.last_used_at,
    /** Full URL when token_plain exists (tokens created after migration, or after one rotate). */
    url: fullUrl,
    /** True if link is active but URL cannot be shown until you rotate once (legacy row). */
    needs_rotate_for_stored_url: !fullUrl,
  })
}

export async function POST() {
  const user = await getAuthenticatedTeamUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isStudentInternRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, key)
  const nowIso = new Date().toISOString()

  await supabase
    .from('task_intake_tokens')
    .update({ revoked_at: nowIso })
    .eq('team_user_id', user.id)
    .is('revoked_at', null)

  const plain = generateTaskIntakeTokenPlain()
  const tokenHash = hashTaskIntakeToken(plain)

  const { data: row, error } = await supabase
    .from('task_intake_tokens')
    .insert({
      team_user_id: user.id,
      token_hash: tokenHash,
      token_plain: plain,
      expires_at: null,
    })
    .select('id, created_at')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: error?.message || 'Failed to create token' }, { status: 500 })
  }

  const origin = siteOrigin()
  const path = `/submit-task?t=${encodeURIComponent(plain)}`
  const fullUrl = origin ? `${origin}${path}` : path

  return NextResponse.json({
    ok: true,
    url: fullUrl,
    token_id: row.id,
    created_at: row.created_at,
  })
}

export async function DELETE() {
  const user = await getAuthenticatedTeamUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isStudentInternRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, key)
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('task_intake_tokens')
    .update({ revoked_at: nowIso })
    .eq('team_user_id', user.id)
    .is('revoked_at', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
