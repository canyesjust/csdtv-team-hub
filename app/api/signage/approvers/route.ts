import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.team_id) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.signage_approver === 'boolean') {
    update.signage_approver = body.signage_approver
  }
  if ('signage_role' in body) {
    const role = body.signage_role
    if (role !== null && role !== 'editor') {
      return NextResponse.json({ error: "signage_role must be 'editor' or null" }, { status: 400 })
    }
    if (role === 'editor') {
      // Never lock a Manager out of the Hub by making them signage-only.
      const { data: target } = await service.from('team').select('role').eq('id', body.team_id).maybeSingle()
      if (!target) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
      if ((target.role || '').toLowerCase() === 'manager') {
        return NextResponse.json({ error: 'Cannot make a Manager signage-only' }, { status: 400 })
      }
    }
    update.signage_role = role
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'signage_approver or signage_role required' }, { status: 400 })
  }

  const { error } = await service.from('team').update(update).eq('id', body.team_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
