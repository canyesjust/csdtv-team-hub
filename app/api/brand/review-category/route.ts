import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

// Key-gated category change for the review link (no login). Lets a reviewer with
// the shared ?review=KEY re-file a logo into a different category in one click.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const expected = process.env.BRAND_REVIEW_KEY
  if (!expected) return NextResponse.json({ error: 'Review link is not configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as {
    key?: string; code?: string; category?: string; name?: string; newCategory?: string
  }
  if (!body.key || body.key !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim()
  const name = String(body.name || '').trim()
  const newCategory = String(body.newCategory || '').trim().slice(0, 60)
  if (!code || !category || !name || !newCategory) {
    return NextResponse.json({ error: 'Missing code, category, name, or new category' }, { status: 400 })
  }
  if (newCategory === category) return NextResponse.json({ success: true })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  // Block only if the target category+name already has the same file format.
  const { data: srcRows } = await service
    .from('school_logos').select('format').eq('school_code', code).eq('category', category).eq('name', name)
  const srcFormats = new Set(((srcRows ?? []) as { format: string }[]).map((r) => r.format))
  const { data: tgtRows } = await service
    .from('school_logos').select('format').eq('school_code', code).eq('category', newCategory).eq('name', name)
  const tgtFormats = new Set(((tgtRows ?? []) as { format: string }[]).map((r) => r.format))
  if ([...srcFormats].some((f) => tgtFormats.has(f))) {
    return NextResponse.json({ error: 'A logo with that name already exists in that category.' }, { status: 409 })
  }

  const { error } = await service
    .from('school_logos')
    .update({ category: newCategory, updated_at: new Date().toISOString() })
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, newCategory })
}
