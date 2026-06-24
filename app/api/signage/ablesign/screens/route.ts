import { NextRequest, NextResponse } from 'next/server'
import { AbleSignApiError, listAllScreens } from '@/lib/server/ablesign'
import { getSiteAbleSignCreds } from '@/lib/signage/ablesign-creds'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error

  try {
    const siteId = new URL(request.url).searchParams.get('siteId')
    const creds = await getSiteAbleSignCreds(auth.service, siteId)
    const screens = await listAllScreens(creds)
    return NextResponse.json({
      screens: screens.map(s => ({
        id: s.id,
        title: s.title,
        orientation: s.orientation,
        onlineStatus: s.onlineStatus ?? null,
        heartbeatTime: s.heartbeatTime ?? null,
      })),
    })
  } catch (err) {
    const message = err instanceof AbleSignApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Failed to load AbleSign screens'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
