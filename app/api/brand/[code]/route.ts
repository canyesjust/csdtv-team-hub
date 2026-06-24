import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'

// Public per-school brand detail. Service role reads public brand data only.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'school-logos'
type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type LogoRow = {
  category: string
  name: string
  format: 'png' | 'jpg'
  storage_path: string
  sort_order: number
  flagged_for_deletion: boolean
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
  const { code } = await params
  const supabase = getServiceSupabaseClient()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: school, error: schoolErr } = await supabase
    .from('schools')
    .select('code, name, short_name, mascot, mascot_name, city, level, primary_color, secondary_color, accent_color, text_color')
    .eq('code', code)
    .eq('type', 'school')
    .not('active', 'is', false)
    .maybeSingle()
  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const { data: logoData } = await supabase
    .from('school_logos')
    .select('category, name, format, storage_path, sort_order, flagged_for_deletion')
    .eq('school_code', code)
    .order('sort_order', { ascending: true })

  const cleanName = slugify(String(school.name || 'school'))
  const map = new Map<string, { category: string; name: string; sort: number; png: string | null; jpg: string | null; flagged: boolean }>()
  for (const row of (logoData ?? []) as LogoRow[]) {
    const key = `${row.category}||${row.name}`
    if (!map.has(key)) map.set(key, { category: row.category, name: row.name, sort: row.sort_order, png: null, jpg: null, flagged: false })
    const entry = map.get(key)!
    if (row.flagged_for_deletion) entry.flagged = true
    const dl = `${cleanName}-${slugify(row.category)}-${slugify(row.name)}.${row.format}`
    const url = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path, { download: dl }).data.publicUrl
    if (row.format === 'png') entry.png = url
    else entry.jpg = url
  }

  const logos = [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))

  return NextResponse.json(
    {
      school: {
        code: String(school.code),
        name: String(school.name),
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
      },
      logos: logos.map((l) => ({ category: l.category, name: l.name, png: l.png, jpg: l.jpg, flagged: l.flagged })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
