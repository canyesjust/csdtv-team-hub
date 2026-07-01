import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { signBrandUrl } from '@/lib/server/brand-storage'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'

type FlaggedRow = {
  school_code: string
  category: string
  name: string
  format: 'png' | 'jpg' | 'svg' | 'docx'
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

  const map = new Map<string, { code: string; schoolName: string; category: string; name: string; preview: string | null; previewPath: string | null; formats: string[] }>()
  for (const r of rows) {
    const key = `${r.school_code}||${r.category}||${r.name}`
    if (!map.has(key)) {
      map.set(key, { code: r.school_code, schoolName: nameByCode.get(r.school_code) || r.school_code, category: r.category, name: r.name, preview: null, previewPath: null, formats: [] })
    }
    const entry = map.get(key)!
    entry.formats.push(r.format)
    // Prefer a PNG for the preview; docx has no image preview.
    if ((!entry.previewPath || r.format === 'png') && r.format !== 'docx') entry.previewPath = r.storage_path
  }

  // Bucket is private: sign each preview (short-lived), concurrently.
  const entries = [...map.values()]
  await Promise.all(entries.map(async (entry) => {
    if (entry.previewPath) entry.preview = await signBrandUrl(service, entry.previewPath)
  }))

  return NextResponse.json({
    reviewConfigured: Boolean(process.env.BRAND_REVIEW_KEY),
    reviewKey: process.env.BRAND_REVIEW_KEY || null,
    logos: entries.map((e) => ({ code: e.code, schoolName: e.schoolName, category: e.category, name: e.name, preview: e.preview, formats: e.formats })),
  })
}

export async function DELETE() {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  // Delete in batches so files and rows are removed together (no orphaned files),
  // and so it works regardless of how many are flagged (past the 1000-row cap).
  let deleted = 0
  for (;;) {
    const { data, error } = await service
      .from('school_logos')
      .select('id, storage_path')
      .eq('flagged_for_deletion', true)
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as { id: string; storage_path: string }[]
    if (rows.length === 0) break
    await service.storage.from(BUCKET).remove(rows.map((r) => r.storage_path))
    const { error: delErr } = await service.from('school_logos').delete().in('id', rows.map((r) => r.id))
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    deleted += rows.length
  }

  return NextResponse.json({ success: true, deleted })
}
