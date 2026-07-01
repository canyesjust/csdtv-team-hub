import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'
import { hasBrandSiteAccess } from '@/lib/server/brand-access'

// Public per-school brand detail. Service role reads public brand data only.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'school-logos'
// Grid thumbnails are display-only; serve a small CDN-resized image so the page does not
// download every full-size logo at once. Requires Supabase image transformations (Pro).
const THUMB_TRANSFORM = { width: 480, quality: 75, resize: 'contain' as const }
type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type LogoRow = {
  category: string
  name: string
  format: 'png' | 'jpg' | 'svg' | 'docx'
  storage_path: string
  sort_order: number
  flagged_for_deletion: boolean
  is_cover: boolean
  notes: string | null
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
  const map = new Map<string, { category: string; name: string; sort: number; png: string | null; jpg: string | null; svg: string | null; docx: string | null; thumb: string | null; thumbRank: number; flagged: boolean; cover: boolean; notes: string | null }>()
  for (const row of (logoData ?? []) as LogoRow[]) {
    const key = `${row.category}||${row.name}`
    if (!map.has(key)) map.set(key, { category: row.category, name: row.name, sort: row.sort_order, png: null, jpg: null, svg: null, docx: null, thumb: null, thumbRank: -1, flagged: false, cover: false, notes: null })
    const entry = map.get(key)!
    if (row.flagged_for_deletion) entry.flagged = true
    if (row.is_cover) entry.cover = true
    if (row.notes && !entry.notes) entry.notes = row.notes
    const dl = `${cleanName}-${slugify(row.category)}-${slugify(row.name)}.${row.format}`
    const url = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path, { download: dl }).data.publicUrl
    if (row.format === 'png') entry.png = url
    else if (row.format === 'jpg') entry.jpg = url
    else if (row.format === 'svg') entry.svg = url
    else entry.docx = url
    // One thumbnail per logo for the grid. Prefer SVG (vector, tiny, scales crisply -
    // image transforms do not apply to it), then a CDN-resized PNG, then JPG. Word
    // documents (docx) have no image preview and are never used as a thumbnail.
    const isSvg = row.format === 'svg'
    const rank = isSvg ? 3 : row.format === 'png' ? 2 : row.format === 'jpg' ? 1 : -1
    if (rank > entry.thumbRank) {
      entry.thumbRank = rank
      entry.thumb = isSvg
        ? supabase.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl
        : supabase.storage.from(BUCKET).getPublicUrl(row.storage_path, { transform: THUMB_TRANSFORM }).data.publicUrl
    }
  }

  const logos = [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))

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
        fonts: {
          heading: school.heading_font || null,
          body: school.body_font || null,
          notes: school.font_notes || null,
        },
      },
      logos: logos.map((l) => ({ category: l.category, name: l.name, png: l.png, jpg: l.jpg, svg: l.svg, docx: l.docx, thumb: l.thumb, flagged: l.flagged, cover: l.cover, notes: l.notes })),
    },
    // Never shared-cache the per-school detail: managers mutate it (add/rename/delete)
    // and must see the change on the very next load, and gated responses are per-user.
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
