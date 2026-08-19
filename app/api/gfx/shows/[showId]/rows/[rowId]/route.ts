import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError, sanitizeGraphic } from '@/lib/graphics/control'
import { sanitizeAudioCue } from '@/lib/graphics/audio'

export const dynamic = 'force-dynamic'

const TEXT_FIELDS = ['page', 'slug', 'form', 'talent', 'video', 'camera', 'audio_source', 'script', 'ifb', 'notes'] as const
const LIMITS: Record<string, number> = {
  page: 12, slug: 200, form: 12, talent: 200, video: 120, camera: 120,
  audio_source: 120, script: 20000, ifb: 2000, notes: 2000,
}
const NUMBER_FIELDS = ['est_seconds', 'repeat_count', 'per_unit_seconds'] as const
const BOUNDS: Record<string, [number, number]> = {
  est_seconds: [0, 86400], repeat_count: [0, 2000], per_unit_seconds: [0, 600],
}
const BOOL_FIELDS = ['floated', 'approved', 'hold_full', 'is_break'] as const

/** Update one row. Everything is bounded server-side. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ showId: string; rowId: string }> },
) {
  const { showId, rowId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const patch: Record<string, unknown> = {}

    for (const key of TEXT_FIELDS) {
      if (typeof body[key] === 'string') patch[key] = (body[key] as string).slice(0, LIMITS[key])
    }
    for (const key of NUMBER_FIELDS) {
      if (body[key] !== undefined) {
        const n = Number(body[key])
        if (!Number.isFinite(n)) return controlError(`${key} must be a number`)
        const [lo, hi] = BOUNDS[key]
        patch[key] = Math.max(lo, Math.min(hi, Math.round(n)))
      }
    }
    for (const key of BOOL_FIELDS) {
      if (typeof body[key] === 'boolean') patch[key] = body[key]
    }
    if ('graphic' in body) patch.graphic = body.graphic === null ? null : sanitizeGraphic(body.graphic)
    if ('audio_cue' in body) patch.audio_cue = body.audio_cue === null ? null : sanitizeAudioCue(body.audio_cue)
    if (typeof body.block_id === 'string' || body.block_id === null) patch.block_id = body.block_id
    if (body.sort_order !== undefined) {
      const n = Number(body.sort_order)
      if (!Number.isFinite(n)) return controlError('sort_order must be a number')
      patch.sort_order = n
    }

    if (Object.keys(patch).length === 0) return controlError('Nothing to update')

    const { error } = await ctx.service
      .from('graphics_rows')
      .update(patch)
      .eq('id', rowId)
      .eq('show_id', ctx.showId)
    if (error) return controlError('Could not update the row', 500)
    return NextResponse.json({ success: true })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ showId: string; rowId: string }> },
) {
  const { showId, rowId } = await params
  return withGraphicsControl(showId, async ctx => {
    const { error } = await ctx.service
      .from('graphics_rows')
      .delete()
      .eq('id', rowId)
      .eq('show_id', ctx.showId)
    if (error) return controlError('Could not delete the row', 500)
    return NextResponse.json({ success: true })
  })
}
