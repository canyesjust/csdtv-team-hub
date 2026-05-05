import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { kitId, borrowerName, borrowerInfo, dueDate } = await request.json()
  if (!kitId || !borrowerName) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const supabase = createClient(url, key)

  const { data, error } = await supabase.rpc('kit_checkout_atomic', {
    p_kit_id: kitId,
    p_borrower_name: String(borrowerName).trim(),
    p_borrower_info: borrowerInfo ? String(borrowerInfo).trim() : null,
    p_due_date: dueDate || null,
    p_user_id: teamUser.id,
  })
  if (error) return NextResponse.json({ error: 'Kit checkout failed' }, { status: 500 })
  if (!data?.success) return NextResponse.json({ error: data?.message || 'Kit checkout failed' }, { status: data?.status || 400 })
  return NextResponse.json({ success: true })
}
