import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'

type FlaggedRow = {
  school_code: string
  category: string
  name: string
  format: 'png' | 'jpg'
  storage_path: string
}

async function requireManager() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return null
  return teamUser
}

export async function GET() {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: rowsData, error } = await service
    .from('school_logos')
    .select('school_code, category, name, format, storage_path')
    .eq('flagged_for_deletion', true)
    .order('school_code', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (rowsData ?? []) as FlaggedRow[]

  const codes = [...new Set(rows.map((r) => r.school_code))]
  const nameByCode = new Map<string, string>()
  if (codes.length > 0) {
    const { data: schools } = await service.from('schools').select('code, name').in('code', codes)
    for (const s of schools ?? []) nameByCode.set(String(s.code), String(s.name))
  }

  const map = new Map<string, { code: string; schoolName: string; category: string; name: string; preview: string | null; formats: string[] }>()
  for (const r of rows) {
    const key = `${r.school_code}||${r.category}||${r.name}`
    if (!map.has(key)) {
      map.set(key, { code: r.school_code, schoolName: nameByCode.get(r.school_code) || r.school_code, category: r.category, name: r.name, preview: null, formats: [] })
    }
    const entry = map.get(key)!
    entry.formats.push(r.format)
    const url = service.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl
    if (!entry.preview || r.format === 'png') entry.preview = url
  }

  return NextResponse.json({
    reviewConfigured: Boolean(process.env.BRAND_REVIEW_KEY),
    reviewKey: process.env.BRAND_REVIEW_KEY || null,
    logos: [...map.values()],
  })
}

export async function DELETE() {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: rowsData, error } = await service
    .from('school_logos')
    .select('id, storage_path')
    .eq('flagged_for_deletion', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (rowsData ?? []) as { id: string; storage_path: string }[]
  if (rows.length === 0) return NextResponse.json({ success: true, deleted: 0 })

  const paths = rows.map((r) => r.storage_path)
  await service.storage.from(BUCKET).remove(paths)

  const { error: delErr } = await service.from('school_logos').delete().eq('flagged_for_deletion', true)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true, deleted: rows.length })
}
