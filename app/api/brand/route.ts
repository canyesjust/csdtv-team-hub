import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'
import { brandGateEnabled, hasBrandSiteAccess } from '@/lib/server/brand-access'
import { signBrandUrl } from '@/lib/server/brand-storage'

// Public, non-sensitive brand catalog summary (one card per school). Service role is
// used deliberately to read public brand data; this route takes no user input.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Card previews are display-only, so serve a small CDN-resized image instead of the
// full file (some logos are 20 MB). Requires Supabase image transformations (Pro plan).
const PREVIEW_TRANSFORM = { width: 480, quality: 75, resize: 'contain' as const }
type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type BrandSchoolSummary = {
  code: string
  name: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
  preview: string | null
  previewRaw: string | null
  logoCount: number
}

type SchoolRow = {
  code: string | null
  name: string | null
  type: string | null
  short_name: string | null
  mascot: string | null
  mascot_name: string | null
  city: string | null
  level: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  text_color: string | null
}

const SPECIALTY_CODES = new Set(['996', '981', '180', '955', '995'])

function resolveLevel(level: string | null, code: string): BrandLevel {
  if (SPECIALTY_CODES.has(code)) return 'Specialty'
  const l = (level || '').trim().toLowerCase()
  if (l === 'elementary') return 'Elementary'
  if (l === 'middle school' || l === 'middle') return 'Middle'
  if (l === 'high school' || l === 'high') return 'High'
  return 'Specialty'
}

export async function GET() {
  if (!(await hasBrandSiteAccess())) {
    return NextResponse.json({ error: 'Access to the brand library is restricted.' }, { status: 401 })
  }

  const supabase = getServiceSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const schoolsRes = await supabase
    .from('schools')
    .select('code, name, type, short_name, mascot, mascot_name, city, level, primary_color, secondary_color, accent_color, text_color')
    .in('type', ['school', 'district', 'department'])
    .not('active', 'is', false)
    .order('name', { ascending: true })

  if (schoolsRes.error) return NextResponse.json({ error: schoolsRes.error.message }, { status: 500 })

  // Per-school logo count + chosen preview file, computed in one indexed DB query
  // (see migration 20260701150000) instead of streaming every logo row into the app.
  const { data: summaryRows, error: rpcErr } = await supabase.rpc('brand_school_summaries')
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  const logoCountByCode = new Map<string, number>()
  const previewPathByCode = new Map<string, string>()
  for (const row of (summaryRows ?? []) as { school_code: string; logo_count: number; preview_path: string | null }[]) {
    logoCountByCode.set(row.school_code, Number(row.logo_count) || 0)
    if (row.preview_path) previewPathByCode.set(row.school_code, row.preview_path)
  }

  // Bucket is private: sign the chosen preview per school (raw + a CDN-resized display
  // version). Sign concurrently so we do not serialize one round-trip per school.
  const previewByCode = new Map<string, string>()
  const previewRawByCode = new Map<string, string>()
  await Promise.all([...previewPathByCode.entries()].map(async ([schoolCode, path]) => {
    const isSvg = path.toLowerCase().endsWith('.svg')
    const raw = await signBrandUrl(supabase, path)
    if (raw) previewRawByCode.set(schoolCode, raw)
    const display = isSvg ? raw : await signBrandUrl(supabase, path, { transform: PREVIEW_TRANSFORM })
    if (display) previewByCode.set(schoolCode, display)
  }))

  const allRows = ((schoolsRes.data ?? []) as SchoolRow[]).filter((r) => r.code && r.name)
  const toSummary = (r: SchoolRow): BrandSchoolSummary => {
    const code = String(r.code)
    return {
      code,
      name: String(r.name),
      shortName: r.short_name || null,
      mascot: r.mascot_name || r.mascot || null,
      city: r.city || null,
      level: resolveLevel(r.level, code),
      colors: {
        primary: pickHex(r.primary_color),
        secondary: pickHex(r.secondary_color),
        accent: pickHex(r.accent_color),
        text: pickHex(r.text_color),
      },
      preview: previewByCode.get(code) ?? null,
      previewRaw: previewRawByCode.get(code) ?? null,
      logoCount: logoCountByCode.get(code) ?? 0,
    }
  }

  const schools = allRows.filter((r) => r.type === 'school').map(toSummary)
  const departments = allRows.filter((r) => r.type === 'department').map(toSummary)
  const districtRow = allRows.find((r) => r.type === 'district')
  const district = districtRow ? toSummary(districtRow) : null

  // When the site is open, let the CDN cache the gallery so repeat loads are instant.
  // The cache window (<=20 min) stays well under the 1-hour signed-URL lifetime, so
  // cached URLs never expire before the response does. Managers/reviewers cache-bust
  // their own requests to stay fresh. When gated, responses are per-user -> no-store.
  const cacheControl = (await brandGateEnabled())
    ? 'private, no-store'
    : 'public, s-maxage=300, stale-while-revalidate=900'
  return NextResponse.json(
    { schools, district, departments },
    { headers: { 'Cache-Control': cacheControl } },
  )
}
