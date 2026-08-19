import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'
import { sanitizeAudioCue, fireAudioCue, stopAudioSlot } from '@/lib/graphics/audio'

export const dynamic = 'force-dynamic'

/**
 *   { action: 'fire', cue: { asset_id, mode, gain_db } }
 *   { action: 'stop', slot: 'oneshot' | 'bed' | 'all' }
 */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    if (body.action === 'fire') {
      const cue = sanitizeAudioCue(body.cue)
      if (!cue) return controlError('A cue needs an asset_id')
      const { data: asset } = await ctx.service
        .from('graphics_audio_assets').select('id').eq('id', cue.asset_id).maybeSingle()
      if (!asset) return controlError('Unknown audio asset', 404)
      await fireAudioCue(ctx.service, ctx.showId, cue)
      return NextResponse.json({ success: true })
    }

    if (body.action === 'stop') {
      const slot = body.slot === 'oneshot' || body.slot === 'bed' ? body.slot : 'all'
      await stopAudioSlot(ctx.service, ctx.showId, slot)
      return NextResponse.json({ success: true })
    }

    return controlError('Unknown action')
  })
}
