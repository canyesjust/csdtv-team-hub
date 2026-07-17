import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'
import { brandGateEnabled, hasBrandSiteAccess } from '@/lib/server/brand-access'
import { signBrandUrl } from '@/lib/server/brand-storage'
import { ensurePrimaryPalette, listPalettes } from '@/lib/server/brand-palettes'

// Public per-school brand detail. Service role reads public brand data only.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Grid thumbnails are display-only; serve a small CDN-resized image so the page does not
// download every full-size logo at once. Requires Supabase image transformations (Pro).
const THUMB_TRANSFORM = { width: 480, quality: 75, resize: 'contain' as const }
type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type LogoRow = {
  category: string
  name: string
  format: 'png' | 'jpg' | 'svg' | 'docx' | 'eps'
  storage_path: string
  sort_order: number
  flagged_for_deletion: boolean
  is_cover: boolean
  notes: string | null
}

type LogoFormat = 'png' | 'jpg' | 'svg' | 'docx' | 'eps'

type LogoEntry = {
  category: string
  name: string
  sort: number
  files: Partial<Record<LogoFormat, { path: string; dl: string }>>
  thumbPath: string | null
  thumbIsSvg: boolean
  thumbRank: number
  flagged: boolean
  cover: boolean
  notes: string | null
  png: string | null
  jpg: string | null
  svg: string | null
  docx: string | null
  eps: string | null
  thumb: string | null
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

function slugify(s: string): string {
  return s.replace(/[^A-Za-z0-9 ]+/g, '').trim().replace(/\s+/g, '-') || 'logo'
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!(await hasBrandSiteAccess())) {
    return NextResponse.json({ error: 'Access to the brand library is restricted.' }, { status: 401 })
  }

  const { code } = await params
  const supabase = getServiceSupabaseClient()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: school, error: schoolErr } = await supabase
    .from('schools')
    .select('code, name, type, short_name, mascot, mascot_name, city, level, primary_color, secondary_color, accent_color, text_color, heading_font, body_font, font_notes')
    .eq('code', code)
    .in('type', ['school', 'district', 'department'])
    .not('active', 'is', false)
    .maybeSingle()
  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const { data: logoData } = await supabase
    .from('school_logos')
    .select('category, name, format, storage_path, sort_order, flagged_for_deletion, is_cover, notes')
    .eq('school_code', code)
    .order('sort_order', { ascending: true })

  const cleanName = slugify(String(school.name || 'school'))
  const map = new Map<string, LogoEntry>()
  for (const row of (logoData ?? []) as LogoRow[]) {
    const key = `${row.category}||${row.name}`
    if (!map.has(key)) {
      map.set(key, { category: row.category, name: row.name, sort: row.sort_order, files: {}, thumbPath: null, thumbIsSvg: false, thumbRank: -1, flagged: false, cover: false, notes: null, png: null, jpg: null, svg: null, docx: null, eps: null, thumb: null })
    }
    const entry = map.get(key)!
    if (row.flagged_for_deletion) entry.flagged = true
    if (row.is_cover) entry.cover = true
    if (row.notes && !entry.notes) entry.notes = row.notes
    const dl = `${cleanName}-${slugify(row.category)}-${slugify(row.name)}.${row.format}`
    entry.files[row.format] = { path: row.storage_path, dl }
    // One thumbnail per logo for the grid. Prefer SVG (vector, tiny, scales crisply -
    // image transforms do not apply to it), then a CDN-resized PNG, then JPG. Word
    // documents (docx) and EPS files have no image preview and are never used as a thumbnail.
    const isSvg = row.format === 'svg'
    const rank = isSvg ? 3 : row.format === 'png' ? 2 : row.format === 'jpg' ? 1 : -1
    if (rank > entry.thumbRank) {
      entry.thumbRank = rank
      entry.thumbPath = row.storage_path
      entry.thumbIsSvg = isSvg
    }
  }

  // Bucket is private: mint short-lived signed URLs. Sign everything concurrently so a
  // school with many logos does not serialize dozens of round-trips.
  const signTasks: Promise<void>[] = []
  for (const entry of map.values()) {
    for (const fmt of ['png', 'jpg', 'svg', 'docx', 'eps'] as LogoFormat[]) {
      const info = entry.files[fmt]
      if (!info) continue
      signTasks.push((async () => { entry[fmt] = await signBrandUrl(supabase, info.path, { download: info.dl }) })())
    }
    if (entry.thumbPath) {
      const path = entry.thumbPath
      const isSvg = entry.thumbIsSvg
      signTasks.push((async () => { entry.thumb = await signBrandUrl(supabase, path, isSvg ? undefined : { transform: THUMB_TRANSFORM }) })())
    }
  }
  await Promise.all(signTasks)

  const logos = [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))

  // Every school gets at least a "Primary" palette (seeded from the legacy 4 color
  // columns the first time it's read) so the palette editor always has something to show.
  await ensurePrimaryPalette(supabase, code)
  const palettes = await listPalettes(supabase, code)

  return NextResponse.json(
    {
      school: {
        code: String(school.code),
        name: String(school.name),
        type: String(school.type || 'school'),
        shortName: school.short_name || null,
        mascot: school.mascot_name || school.mascot || null,
        city: school.city || null,
        level: resolveLevel(school.level, String(school.code)),
        colors: {
          primary: pickHex(school.primary_color),
          secondary: pickHex(school.secondary_color),
          accent: pickHex(school.accent_color),
          text: pickHex(school.text_color),
        },
        palettes: palettes.map((p) => ({ id: p.id, name: p.name, colors: p.colors })),
        fonts: {
          heading: school.heading_font || null,
          body: school.body_font || null,
          notes: school.font_notes || null,
        },
      },
      logos: logos.map((l) => ({ category: l.category, name: l.name, png: l.png, jpg: l.jpg, svg: l.svg, docx: l.docx, eps: l.eps, thumb: l.thumb, flagged: l.flagged, cover: l.cover, notes: l.notes })),
    },
    // Cache public reads briefly (window << the 1-hour signed-URL lifetime, so cached
    // URLs never expire before the response). Managers/reviewers cache-bust their own
    // fetches so edits show immediately. When gated, responses are per-user -> no-store.
    { headers: { 'Cache-Control': (await brandGateEnabled()) ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
