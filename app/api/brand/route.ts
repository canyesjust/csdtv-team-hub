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

type LogoRow = {
  school_code: string
  category: string
  name: string
  format: 'png' | 'jpg'
  storage_path: string
  sort_order: number
  is_cover: boolean
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

  const schoolsRes = await supabase
    .from('schools')
    .select('code, name, type, short_name, mascot, mascot_name, city, level, primary_color, secondary_color, accent_color, text_color')
    .in('type', ['school', 'district', 'department'])
    .not('active', 'is', false)
    .order('name', { ascending: true })

  if (schoolsRes.error) return NextResponse.json({ error: schoolsRes.error.message }, { status: 500 })

  // Fetch every logo row, paginating past Supabase's 1000-row response cap.
  const logoRows: LogoRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('school_logos')
      .select('school_code, category, name, format, storage_path, sort_order, is_cover')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const batch = (data ?? []) as LogoRow[]
    logoRows.push(...batch)
    if (batch.length < PAGE) break
  }

  // Count distinct logos (by category+name) per school and pick a preview file.
  // Preview priority: chosen cover PNG > cover (any) > Official PNG > any PNG > any file.
  const namesByCode = new Map<string, Set<string>>()
  const previewByCode = new Map<string, string>()
  const previewRank = new Map<string, number>()
  for (const row of logoRows) {
    if (!namesByCode.has(row.school_code)) namesByCode.set(row.school_code, new Set())
    namesByCode.get(row.school_code)!.add(`${row.category}||${row.name}`)

    let rank = 0
    if (row.is_cover && row.format === 'png') rank = 5
    else if (row.is_cover) rank = 4
    else if (row.category.toLowerCase() === 'official' && row.format === 'png') rank = 3
    else if (row.format === 'png') rank = 2
    else rank = 1
    if (rank > (previewRank.get(row.school_code) ?? -1)) {
      previewRank.set(row.school_code, rank)
      previewByCode.set(row.school_code, supabase.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl)
    }
  }

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
      logoCount: namesByCode.get(code)?.size ?? 0,
    }
  }

  const schools = allRows.filter((r) => r.type === 'school').map(toSummary)
  const departments = allRows.filter((r) => r.type === 'department').map(toSummary)
  const districtRow = allRows.find((r) => r.type === 'district')
  const district = districtRow ? toSummary(districtRow) : null

  return NextResponse.json({ schools, district, departments }, { headers: { 'Cache-Control': 'no-store' } })
}
