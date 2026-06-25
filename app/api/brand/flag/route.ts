import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'

// Key-gated flag toggle for the one-time logo cleanup review link. No login: a
// reviewer with the shared ?review=KEY can mark logos as old. This only sets a
// flag; nothing is deleted here. A manager reviews and bulk-deletes separately.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const expected = process.env.BRAND_REVIEW_KEY
  if (!expected) return NextResponse.json({ error: 'Review link is not configured' }, { status: 503 })

  const rl = await checkRateLimit(request, { scope: 'brand_flag', max: 30, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({})) as {
    key?: string
    code?: string
    category?: string
    name?: string
    flagged?: boolean
  }

  if (!timingSafeEqualStr(body.key, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim()
  const name = String(body.name || '').trim()
  const flagged = body.flagged !== false // default to flagging
  if (!code || !category || !name) {
    return NextResponse.json({ error: 'Missing code, category, or name' }, { status: 400 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  // A logo identity (code+category+name) can have both png and jpg rows; flag both.
  const { error } = await service
    .from('school_logos')
    .update({ flagged_for_deletion: flagged, flagged_at: flagged ? new Date().toISOString() : null })
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, flagged })
}
