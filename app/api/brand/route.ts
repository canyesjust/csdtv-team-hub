import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { pickHex } from '@/lib/thumbnail-school-brand'

// Public, non-sensitive brand catalog. Service role is used deliberately to read
// public brand data and to list the storage bucket; this route takes no user input.
// Mirrors the existing public signage feed routes.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'school-logos'
type Format = 'jpg' | 'png' | 'eps'
type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type BrandSchool = {
  code: string
  name: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: {
    primary: string | null
    secondary: string | null
    accent: string | null
    text: string | null
  }
  logos: {
    jpg: string | null
    png: string | null
    eps: string | null
  }
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

// Levels for these schools are not set on the row but were confirmed by an admin.
const SPECIALTY_CODES = new Set(['996', '981', '180', '955', '995'])

function resolveLevel(level: string | null, code: string): BrandLevel {
  if (SPECIALTY_CODES.has(code)) return 'Specialty'
  const l = (level || '').trim().toLowerCase()
  if (l === 'elementary') return 'Elementary'
  if (l === 'middle school' || l === 'middle') return 'Middle'
  if (l === 'high school' || l === 'high') return 'High'
  // Special School and any other unlabeled school is treated as Specialty.
  return 'Specialty'
}

// Letters, numbers, and spaces only; spaces become hyphens. "Alta High" -> "Alta-High".
function slugifyName(name: string): string {
  return name.replace(/[^A-Za-z0-9 ]+/g, '').trim().replace(/\s+/g, '-') || 'logo'
}

function normalizeExt(ext: string): Format | null {
  const e = ext.toLowerCase()
  if (e === 'jpg' || e === 'jpeg') return 'jpg'
  if (e === 'png') return 'png'
  if (e === 'eps') return 'eps'
  return null
}

export async function GET() {
  const supabase = getServiceSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: rows, error } = await supabase
    .from('schools')
    .select('code, name, short_name, mascot, mascot_name, city, level, primary_color, secondary_color, accent_color, text_color')
    .eq('type', 'school')
    .not('active', 'is', false)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // List the bucket once and map code -> which formats exist. If the bucket has not
  // been created yet, treat every logo as missing rather than failing the catalog.
  const filesByCode = new Map<string, Set<Format>>()
  const { data: objects } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  for (const obj of objects ?? []) {
    const name = obj.name || ''
    const dot = name.lastIndexOf('.')
    if (dot <= 0) continue
    const base = name.slice(0, dot)
    const fmt = normalizeExt(name.slice(dot + 1))
    if (!fmt) continue
    if (!filesByCode.has(base)) filesByCode.set(base, new Set())
    filesByCode.get(base)!.add(fmt)
  }

  const downloadUrl = (code: string, ext: Format, cleanName: string): string =>
    supabase.storage.from(BUCKET).getPublicUrl(`${code}.${ext}`, {
      download: `${cleanName}.${ext}`,
    }).data.publicUrl

  const schools: BrandSchool[] = ((rows ?? []) as SchoolRow[])
    .filter((r) => r.code && r.name)
    .map((r) => {
      const code = String(r.code)
      const name = String(r.name)
      const cleanName = slugifyName(name)
      const have = filesByCode.get(code) ?? new Set<Format>()
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
        logos: {
          jpg: have.has('jpg') ? downloadUrl(code, 'jpg', cleanName) : null,
          png: have.has('png') ? downloadUrl(code, 'png', cleanName) : null,
          eps: have.has('eps') ? downloadUrl(code, 'eps', cleanName) : null,
        },
      }
    })

  return NextResponse.json({ schools }, { headers: { 'Cache-Control': 'no-store' } })
}
