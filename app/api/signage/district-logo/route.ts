import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { BRAND_BUCKET } from '@/lib/server/brand-storage'

export const dynamic = 'force-dynamic'

// Serves an official Canyons district logo from the brand library as an inlined
// base64 data URI, so AI signage slides can overlay the real logo and stay
// offline-safe (no external requests on the players). Two variants: a white
// logo for dark slides and a color logo for light slides.

type LogoRow = { name: string | null; format: string | null; storage_path: string; is_cover: boolean | null }

function pickLogo(rows: LogoRow[], variant: 'white' | 'color'): LogoRow | null {
  const usable = rows.filter(r => r.storage_path && (r.format === 'png' || r.format === 'svg'))
  if (!usable.length) return null
  const name = (r: LogoRow) => (r.name || '').toLowerCase()
  const score = (r: LogoRow): number => {
    const n = name(r)
    const isWhite = n.includes('white') || n.includes('off white')
    const isColor = n.includes('color')
    const isSquare = n.includes('square')
    let s = 0
    if (variant === 'white') { if (isWhite) s += 100; if (isColor) s -= 50 }
    else { if (isColor) s += 100; if (isWhite) s -= 50 }
    if (isSquare) s += 20 // square reads better in a corner
    if (r.format === 'png') s += 10 // transparent background preferred
    if (r.is_cover) s += 5
    return s
  }
  return [...usable].sort((a, b) => score(b) - score(a))[0] ?? null
}

export async function GET(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const variant = new URL(request.url).searchParams.get('variant') === 'color' ? 'color' : 'white'

  const { data: rows } = await service
    .from('school_logos')
    .select('name, format, storage_path, is_cover')
    .eq('school_code', 'district')
    .neq('flagged_for_deletion', true)

  const pick = pickLogo((rows ?? []) as LogoRow[], variant)
  if (!pick) return NextResponse.json({ error: 'No district logo found.' }, { status: 404 })

  const { data: blob, error } = await service.storage.from(BRAND_BUCKET).download(pick.storage_path)
  if (error || !blob) return NextResponse.json({ error: 'Could not load the logo.' }, { status: 502 })

  const buf = Buffer.from(await blob.arrayBuffer())
  const mime = pick.format === 'svg' ? 'image/svg+xml' : 'image/png'
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`

  return NextResponse.json(
    { dataUri, name: pick.name, variant },
    { headers: { 'Cache-Control': 'private, max-age=3600' } },
  )
}
