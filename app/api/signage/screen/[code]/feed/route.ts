import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { buildScreenFeed } from '@/lib/signage/build-screen-feed'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const result = await buildScreenFeed(service, code)
  if ('error' in result) {
    if (result.error === 'not_found') {
      return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json(result.feed, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
