import { NextResponse } from 'next/server'
import { AbleSignApiError, isAbleSignConfigured, listScreens } from '@/lib/server/ablesign'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error

  if (!isAbleSignConfigured()) {
    return NextResponse.json(
      { connected: false, error: 'ABLESIGN_API_KEY is not configured on the server' },
      { status: 500 },
    )
  }

  try {
    const { totalItems } = await listScreens({ limit: 1 })
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
