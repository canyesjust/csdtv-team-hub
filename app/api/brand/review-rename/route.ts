import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'

// Key-gated rename for the review link (no login). Lets a reviewer with the shared
// ?review=KEY change a logo's display name in one step. Renames all formats of the
// logo identity (png/jpg/svg/docx) together.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const expected = process.env.BRAND_REVIEW_KEY
  if (!expected) return NextResponse.json({ error: 'Review link is not configured' }, { status: 503 })

  const rl = await checkRateLimit(request, { scope: 'brand_review_rename', max: 30, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({})) as {
    key?: string; code?: string; category?: string; name?: string; newName?: string
  }
  if (!timingSafeEqualStr(body.key, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim()
  const name = String(body.name || '').trim()
  const newName = String(body.newName || '').trim().slice(0, 120)
  if (!code || !category || !name || !newName) {
    return NextResponse.json({ error: 'Missing code, category, name, or new name' }, { status: 400 })
  }
  if (newName === name) return NextResponse.json({ success: true, newName })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  // Renaming onto an existing name in the same category merges formats, which is only
  // allowed when the formats do not collide (can't have two PNGs with the same name).
  const { data: srcRows } = await service
    .from('school_logos').select('format').eq('school_code', code).eq('category', category).eq('name', name)
  const srcFormats = new Set(((srcRows ?? []) as { format: string }[]).map((r) => r.format))
  const { data: tgtRows } = await service
    .from('school_logos').select('format').eq('school_code', code).eq('category', category).eq('name', newName)
  const tgtFormats = new Set(((tgtRows ?? []) as { format: string }[]).map((r) => r.format))
  if ([...srcFormats].some((f) => tgtFormats.has(f))) {
    return NextResponse.json({ error: 'A logo with that name already exists in this category.' }, { status: 409 })
  }

  const { error } = await service
    .from('school_logos')
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, newName })
}
