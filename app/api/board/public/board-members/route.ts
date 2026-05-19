import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service
    .from('lower_third_people')
    .select('id, display_name')
    .eq('category', 'board_member')
    .eq('is_active', true)
    .order('display_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const response = NextResponse.json({ members: data || [] })
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}
