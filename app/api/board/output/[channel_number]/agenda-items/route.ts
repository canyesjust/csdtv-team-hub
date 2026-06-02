import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { buildPublicAgendaItemsForChannel } from '@/lib/board-meetings/public-output-state'

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

  const items = await buildPublicAgendaItemsForChannel(service, num)
  const response = NextResponse.json({ items })
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET')
  response.headers.set('Cache-Control', 'private, max-age=60')
  return response
}
