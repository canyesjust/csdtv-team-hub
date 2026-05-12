import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashTaskIntakeToken } from '@/lib/task-intake'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const token = new URL(request.url).searchParams.get('t')?.trim()
  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 400 })
  }

  const supabase = createClient(url, key)
  const tokenHash = hashTaskIntakeToken(token)
  const nowIso = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('task_intake_tokens')
    .select('id, team_user_id, revoked_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }
  if (row.revoked_at) {
    return NextResponse.json({ error: 'This link has been revoked' }, { status: 410 })
  }
  if (row.expires_at && row.expires_at < nowIso) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const { data: prods, error: prodErr } = await supabase
    .from('productions')
    .select('id, production_number, title')
    .neq('status', 'Complete')
    .neq('status', 'Abandoned')
    .order('start_datetime', { ascending: true, nullsFirst: false })
    .limit(400)

  if (prodErr) {
    return NextResponse.json({ error: 'Failed to load productions' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    productions: (prods || []).map((p: { id: string; production_number: number; title: string }) => ({
      id: p.id,
      production_number: p.production_number,
      title: p.title,
    })),
  })
}
