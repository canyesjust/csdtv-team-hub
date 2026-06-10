import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.team_id || typeof body.signage_approver !== 'boolean') {
    return NextResponse.json({ error: 'team_id and signage_approver required' }, { status: 400 })
  }
  const { error } = await service.from('team').update({ signage_approver: body.signage_approver }).eq('id', body.team_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
