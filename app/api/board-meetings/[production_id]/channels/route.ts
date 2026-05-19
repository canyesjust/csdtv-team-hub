import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { assignChannel, unassignChannel } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId }) => {
    const [{ data: channels }, { data: assignments }] = await Promise.all([
      service
        .from('output_channels')
        .select('id, channel_number, channel_name, view_type, tier')
        .eq('is_active', true)
        .order('channel_number'),
      service
        .from('channel_assignments')
        .select('id, output_channel_id, assigned_at, output_channels(channel_number, channel_name, view_type)')
        .eq('board_meeting_id', boardMeetingId)
        .is('unassigned_at', null),
    ])
    return NextResponse.json({ channels: channels || [], assignments: assignments || [] })
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const outputChannelId = body?.output_channel_id as string | undefined
    if (!outputChannelId) return controlError('output_channel_id required')
    try {
      await assignChannel(ctx.service, ctx.boardMeetingId, outputChannelId, ctx.teamUserId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Assign failed')
    }
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const outputChannelId = body?.output_channel_id as string | undefined
    if (!outputChannelId) return controlError('output_channel_id required')
    try {
      await unassignChannel(ctx.service, ctx.boardMeetingId, outputChannelId, ctx.teamUserId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Unassign failed')
    }
  })
}
