import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { buildBoardWatchPayload } from '@/lib/board-meetings/public-watch-data'

export const dynamic = 'force-dynamic'

// Public, read-only endpoint that powers the district website's
// "Watch Board Meetings Live" page. No auth, no cookies, no write access.
// Served cross-origin to canyonsdistrict.org via the CORS headers below.

const ALLOWED_ORIGINS = new Set([
  'https://www.canyonsdistrict.org',
  'https://canyonsdistrict.org',
  'https://www.csdtvstaff.org',
  'https://csdtvstaff.org',
  'http://localhost:3000',
])

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

export async function GET(request: Request) {
  const cors = corsHeaders(request.headers.get('origin'))
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500, headers: cors })
  }

  try {
    const payload = await buildBoardWatchPayload(service)
    // Live: very fresh (follows the agenda). Today: fresh enough that an already-open
    // page flips to live within ~30s of the gavel. Otherwise: relax to 5 minutes.
    const cache =
      payload.state === 'live'
        ? 's-maxage=15, stale-while-revalidate=30'
        : payload.state === 'today'
          ? 's-maxage=30, stale-while-revalidate=60'
          : 's-maxage=300, stale-while-revalidate=600'
    return NextResponse.json(payload, {
      status: 200,
      headers: { ...cors, 'Cache-Control': cache },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build board watch payload' },
      { status: 500, headers: cors },
    )
  }
}
