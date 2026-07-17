import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'

// Step 1 of a logo upload: hand the browser a signed URL so it uploads the file
// DIRECTLY to Supabase storage, bypassing the serverless request-body size limit.
// The browser then calls /finalize to record the row.
//
// Authorized for a logged-in manager OR a reviewer with a valid BRAND_REVIEW_KEY
// (the shared review link). Review-key uploads are rate-limited since they are
// unauthenticated.
export async function POST(request: Request) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { code?: string; category?: string; name?: string; format?: string; key?: string }
  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim().slice(0, 60)
  const name = String(body.name || '').trim().slice(0, 120)
  const format = body.format === 'png' || body.format === 'jpg' || body.format === 'svg' || body.format === 'docx' || body.format === 'eps' ? body.format : null

  // Authorize: manager session, or the shared review key.
  const teamUser = await getAuthenticatedTeamUser()
  const isManager = !!(teamUser && isManagerRole(teamUser.role))
  const reviewKey = process.env.BRAND_REVIEW_KEY
  const viaReviewKey = !isManager && !!reviewKey && timingSafeEqualStr(body.key, reviewKey)
  if (!isManager && !viaReviewKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (viaReviewKey) {
    const rl = await checkRateLimit(request, { scope: 'brand_upload_review', max: 20, windowMs: 60 * 1000 })
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait a minute.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }
  }

  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })
  if (!category) return NextResponse.json({ error: 'Missing category' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Missing logo name' }, { status: 400 })
  if (!format) return NextResponse.json({ error: 'File must be a PNG, JPG, SVG, EPS, or Word document (.docx)' }, { status: 400 })
  // Word documents belong to the Letterhead category only.
  if (format === 'docx' && category.toLowerCase() !== 'letterhead') {
    return NextResponse.json({ error: 'Word documents can only be added to the Letterhead category' }, { status: 400 })
  }

  const { data: school, error: schoolErr } = await service
    .from('schools')
    .select('code')
    .eq('code', code)
    .in('type', ['school', 'district', 'department'])
    .not('active', 'is', false)
    .maybeSingle()
  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'Unknown school code' }, { status: 400 })

  // Always a fresh path; finalize swaps the row's storage_path and removes the old file on replace.
  const path = `${code}/${randomUUID()}.${format}`
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start upload' }, { status: 500 })

  return NextResponse.json({ bucket: BUCKET, path: data.path, token: data.token, format })
}
