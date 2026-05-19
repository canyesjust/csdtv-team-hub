import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { buildArchivePayload } from '@/lib/board-meetings/archive-data'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_number: string }> },
) {
  const { production_number } = await params
  const num = parseInt(production_number, 10)
  if (!Number.isFinite(num)) {
    return NextResponse.json({ error: 'Invalid production number' }, { status: 400 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const payload = await buildArchivePayload(service, num)
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const response = NextResponse.json(payload)
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}
