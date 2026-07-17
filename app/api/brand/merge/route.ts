import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'

// Combine two EXISTING logo entries into one, e.g. a PNG uploaded separately from an
// SVG that should really be the same logo. Moves every file format from "from" onto
// "to" (a plain rename/re-key -- the stored files themselves do not move). Refuses if
// both entries already share a format (can't have two PNGs on one logo).
//
// Authorized for a logged-in manager OR a reviewer with the shared BRAND_REVIEW_KEY,
// same dual-auth pattern as /api/brand/palettes and /api/brand/upload/sign+finalize.
export const dynamic = 'force-dynamic'

async function authorize(request: Request, body: { key?: string }): Promise<{ ok: true } | { ok: false }> {
  const teamUser = await getAuthenticatedTeamUser()
  if (teamUser && isManagerRole(teamUser.role)) return { ok: true }

  const reviewKey = process.env.BRAND_REVIEW_KEY
  if (reviewKey && timingSafeEqualStr(body.key, reviewKey)) {
    const rl = await checkRateLimit(request, { scope: 'brand_merge', max: 20, windowMs: 60 * 1000 })
    if (rl.limited) return { ok: false }
    return { ok: true }
  }
  return { ok: false }
}

export async function POST(request: Request) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    code?: string; key?: string; fromCategory?: string; fromName?: string; toCategory?: string; toName?: string
  }
  const auth = await authorize(request, body)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(body.code || '').trim()
  const fromCategory = String(body.fromCategory || '').trim()
  const fromName = String(body.fromName || '').trim()
  const toCategory = String(body.toCategory || '').trim()
  const toName = String(body.toName || '').trim()

  if (!code || !fromCategory || !fromName || !toCategory || !toName) {
    return NextResponse.json({ error: 'Missing code or logo identifiers' }, { status: 400 })
  }
  if (fromCategory === toCategory && fromName === toName) {
    return NextResponse.json({ error: 'Choose a different logo to combine with.' }, { status: 400 })
  }

  const { data: srcRows, error: srcErr } = await service
    .from('school_logos')
    .select('format')
    .eq('school_code', code)
    .eq('category', fromCategory)
    .eq('name', fromName)
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })
  if (!srcRows || srcRows.length === 0) {
    return NextResponse.json({ error: 'That logo no longer exists. Refresh the page and try again.' }, { status: 404 })
  }

  const { data: tgtRows, error: tgtErr } = await service
    .from('school_logos')
    .select('format')
    .eq('school_code', code)
    .eq('category', toCategory)
    .eq('name', toName)
  if (tgtErr) return NextResponse.json({ error: tgtErr.message }, { status: 500 })
  if (!tgtRows || tgtRows.length === 0) {
    return NextResponse.json({ error: 'The logo you picked to combine with no longer exists. Refresh the page and try again.' }, { status: 404 })
  }

  const srcFormats = new Set((srcRows as { format: string }[]).map((r) => r.format))
  const tgtFormats = new Set((tgtRows as { format: string }[]).map((r) => r.format))
  const collisions = [...srcFormats].filter((f) => tgtFormats.has(f))
  if (collisions.length > 0) {
    const list = collisions.map((f) => f.toUpperCase()).join(', ')
    const noun = collisions.length === 1 ? 'file' : 'files'
    return NextResponse.json(
      { error: `Both logos already have a ${list} ${noun}. Delete one of them first, then combine again.` },
      { status: 409 },
    )
  }

  const { error } = await service
    .from('school_logos')
    .update({ category: toCategory, name: toName, updated_at: new Date().toISOString() })
    .eq('school_code', code)
    .eq('category', fromCategory)
    .eq('name', fromName)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, category: toCategory, name: toName })
}
