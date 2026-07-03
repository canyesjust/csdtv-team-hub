import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { hasObsSiteAccess } from '@/lib/server/obs-access'
import { obsSignedDownloadUrl } from '@/lib/obs-assets'

// Returns a short-lived signed URL for downloading a single OBS asset. Gated by the
// shared password (or a signed-in team user) and lightly rate-limited.
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasObsSiteAccess())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rl = await checkRateLimit(request, { scope: 'obs_download', max: 60, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many downloads. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: row } = await service
    .from('obs_assets')
    .select('storage_path, enabled')
    .eq('id', id)
    .maybeSingle()

  if (!row || row.enabled === false) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = await obsSignedDownloadUrl(service, row.storage_path as string)
  if (!url) return NextResponse.json({ error: 'Could not create download link' }, { status: 500 })

  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
}
