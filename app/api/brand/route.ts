import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'

// Public, non-sensitive brand catalog. Service role is used deliberately to read
// public brand data; this route takes no user input. Mirrors the public signage feeds.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'school-logos'
type LogoType = 'logo' | 'seal' | 'mascot'
type LogoColor = 'full' | 'white' | 'black'
type LogoOrientation = 'horizontal' | 'stacked' | 'icon'
type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type LogoEntry = {
  type: LogoType
  color: LogoColor
  orientation: LogoOrientation
  label: string | null
  png: string | null
  jpg: string | null
}

type BrandSchool = {
  code: string
  name: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
  preview: string | null
  logos: LogoEntry[]
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
  type: LogoType
  color: LogoColor
  orientation: LogoOrientation
  format: 'png' | 'jpg'
  label: string | null
  storage_path: string
  sort_order: number
}

// Levels not set on the row but confirmed by an admin.
const SPECIALTY_CODES = new Set(['996', '981', '180', '955', '995'])

function resolveLevel(level: string | null, code: string): BrandLevel {
  if (SPECIALTY_CODES.has(code)) return 'Specialty'
  const l = (level || '').trim().toLowerCase()
  if (l === 'elementary') return 'Elementary'
  if (l === 'middle school' || l === 'middle') return 'Middle'
  if (l === 'high school' || l === 'high') return 'High'
  return 'Specialty'
}

function slugifyName(name: string): string {
  return name.replace(/[^A-Za-z0-9 ]+/g, '').trim().replace(/\s+/g, '-') || 'logo'
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
      .select('school_code, type, color, orientation, format, label, storage_path, sort_order')
      .order('sort_order', { ascending: true }),
  ])

  if (schoolsRes.error) return NextResponse.json({ error: schoolsRes.error.message }, { status: 500 })
  // If the school_logos table is missing for any reason, fall back to no logos.
  const logoRows = (logosRes.error ? [] : (logosRes.data ?? [])) as LogoRow[]

  // Group logo rows per school code for quick lookup.
  const rowsByCode = new Map<string, LogoRow[]>()
  for (const row of logoRows) {
    if (!rowsByCode.has(row.school_code)) rowsByCode.set(row.school_code, [])
    rowsByCode.get(row.school_code)!.push(row)
  }

  const schools: BrandSchool[] = ((schoolsRes.data ?? []) as SchoolRow[])
    .filter((r) => r.code && r.name)
    .map((r) => {
      const code = String(r.code)
      const name = String(r.name)
      const cleanName = slugifyName(name)
      const entries: LogoEntry[] = []
      for (const row of rowsByCode.get(code) ?? []) {
        const key = `${row.type}|${row.color}|${row.orientation}`
        let entry = entries.find((e) => `${e.type}|${e.color}|${e.orientation}` === key)
        if (!entry) {
          entry = { type: row.type, color: row.color, orientation: row.orientation, label: row.label, png: null, jpg: null }
          entries.push(entry)
        }
        if (row.label && !entry.label) entry.label = row.label
        const dl = `${cleanName}-${row.type}-${row.color}-${row.orientation}.${row.format}`
        const url = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path, { download: dl }).data.publicUrl
        if (row.format === 'png') entry.png = url
        else entry.jpg = url
      }
      entries.sort((a, b) =>
        a.type.localeCompare(b.type) || a.color.localeCompare(b.color) || a.orientation.localeCompare(b.orientation),
      )

      const previewEntry =
        entries.find((e) => e.type === 'logo' && e.color === 'full' && (e.png || e.jpg)) ||
        entries.find((e) => e.png || e.jpg) ||
        null
      const preview = previewEntry ? previewEntry.png || previewEntry.jpg : null

      return {
        code,
        name,
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
        preview,
        logos: entries,
      }
    })

  return NextResponse.json({ schools }, { headers: { 'Cache-Control': 'no-store' } })
}
