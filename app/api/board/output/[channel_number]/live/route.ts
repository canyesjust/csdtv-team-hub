import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { buildPublicChannelLivePatch } from '@/lib/board-meetings/public-output-live'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channel_number: string }> },
) {
  const { channel_number } = await params
  const num = parseInt(channel_number, 10)
  if (!Number.isFinite(num) || num < 1) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const patch = await buildPublicChannelLivePatch(service, num)
  if (!patch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const response = NextResponse.json(patch)
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET')
  response.headers.set('Cache-Control', 'no-store')
  return response
}
