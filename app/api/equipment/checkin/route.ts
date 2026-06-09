import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canCheckoutEquipment } from '@/lib/equipment-access'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCheckoutEquipment(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { loanId } = await request.json()
  if (!loanId) return NextResponse.json({ error: 'Missing loan id' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const supabase = createClient(url, key)

  const { data, error } = await supabase.rpc('equipment_checkin_atomic', {
    p_loan_id: loanId,
    p_user_id: teamUser.id,
  })
  if (error) return NextResponse.json({ error: 'Check-in failed' }, { status: 500 })
  if (!data?.success) return NextResponse.json({ error: data?.message || 'Check-in failed' }, { status: data?.status || 400 })
  return NextResponse.json({ success: true })
}
