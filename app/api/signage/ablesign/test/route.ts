import { NextRequest, NextResponse } from 'next/server'
import { AbleSignApiError, isAbleSignConfigured, listScreens } from '@/lib/server/ablesign'
import { getSiteAbleSignCreds } from '@/lib/signage/ablesign-creds'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error

  const siteId = new URL(request.url).searchParams.get('siteId')
  const creds = await getSiteAbleSignCreds(auth.service, siteId)

  if (!isAbleSignConfigured(creds)) {
    return NextResponse.json(
      { connected: false, error: 'No AbleSign API key configured for this site or on the server' },
      { status: 500 },
    )
  }

  try {
    const { totalItems } = await listScreens({ limit: 1 }, creds)
    return NextResponse.json({ connected: true, totalScreens: totalItems })
  } catch (err) {
    const message = err instanceof AbleSignApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'AbleSign connection failed'
    return NextResponse.json({ connected: false, error: message }, { status: 502 })
  }
}
