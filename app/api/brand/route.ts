import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'

// Public, non-sensitive brand catalog summary (one card per school). Service role is
// used deliberately to read public brand data; this route takes no user input.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'school-logos'
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
  logoCount: number
}

type SchoolRow = {
  code: string | null
  name: string | null
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

type LogoRow = {
  school_code: string
  category: string
  name: string
  format: 'png' | 'jpg'
  storage_path: string
  sort_order: number
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
  const supabase = getServiceSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const [schoolsRes, logosRes] = await Promise.all([
    supabase
      .from('schools')
      .select('code, name, short_name, mascot, mascot_name, city, level, primary_color, secondary_color, accent_color, text_color')
      .eq('type', 'school')
      .not('active', 'is', false)
      .order('name', { ascending: true }),
    supabase
      .from('school_logos')
      .select('school_code, category, name, format, storage_path, sort_order')
      .order('sort_order', { ascending: true }),
  ])

  if (schoolsRes.error) return NextResponse.json({ error: schoolsRes.error.message }, { status: 500 })
  const logoRows = (logosRes.error ? [] : (logosRes.data ?? [])) as LogoRow[]

  // Count distinct logos (by category+name) per school and pick a preview file.
  const namesByCode = new Map<string, Set<string>>()
  const previewByCode = new Map<string, string>()
  for (const row of logoRows) {
    if (!namesByCode.has(row.school_code)) namesByCode.set(row.school_code, new Set())
    namesByCode.get(row.school_code)!.add(`${row.category}||${row.name}`)
    // Prefer an Official PNG as the card preview; first row by sort_order wins otherwise.
    const isOfficialPng = row.category.toLowerCase() === 'official' && row.format === 'png'
    if (!previewByCode.has(row.school_code) || isOfficialPng) {
      const url = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl
      if (isOfficialPng || !previewByCode.has(row.school_code)) previewByCode.set(row.school_code, url)
    }
  }

  const schools: BrandSchoolSummary[] = ((schoolsRes.data ?? []) as SchoolRow[])
    .filter((r) => r.code && r.name)
    .map((r) => {
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
        logoCount: namesByCode.get(code)?.size ?? 0,
      }
    })

  return NextResponse.json({ schools }, { headers: { 'Cache-Control': 'no-store' } })
}
