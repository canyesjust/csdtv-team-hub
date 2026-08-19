import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'
import { GRAPHICS_EVENT_TYPES, GRAPHICS_SHOW_STATES } from '@/lib/graphics/types'
import { sanitizeShowSponsors } from '@/lib/graphics/sponsors'

export const dynamic = 'force-dynamic'

const TEXT = { name: 160, venue: 160 } as const

/** Update the show itself: name, times, school, channel, state. */
export async function PATCH(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const patch: Record<string, unknown> = {}

    for (const [key, limit] of Object.entries(TEXT)) {
      if (typeof body[key] === 'string') patch[key] = (body[key] as string).slice(0, limit)
    }
    if (typeof body.event_type === 'string' && (GRAPHICS_EVENT_TYPES as readonly string[]).includes(body.event_type)) {
      patch.event_type = body.event_type
    }
    if (typeof body.state === 'string' && (GRAPHICS_SHOW_STATES as readonly string[]).includes(body.state)) {
      patch.state = body.state
      // Going live for the first time stamps the clock the timing math rebases on.
      if (body.state === 'live') {
        const { data } = await ctx.service.from('graphics_shows').select('started_at').eq('id', ctx.showId).maybeSingle()
        if (data && !data.started_at) patch.started_at = new Date().toISOString()
      }
      if (body.state === 'done') patch.ended_at = new Date().toISOString()
    }
    for (const key of ['air_at', 'hard_out_at'] as const) {
      if (typeof body[key] === 'string') {
        const parsed = Date.parse(body[key] as string)
        if (!Number.isFinite(parsed)) return controlError(`${key} is not a valid time`)
        patch[key] = new Date(parsed).toISOString()
      } else if (body[key] === null) patch[key] = null
    }
    for (const key of ['school_code', 'away_code', 'channel_id', 'show_date', 'home_roster_id', 'away_roster_id'] as const) {
      if (typeof body[key] === 'string' || body[key] === null) patch[key] = body[key]
    }
    if (body.sponsors !== undefined) {
      if (!Array.isArray(body.sponsors)) return controlError('sponsors must be a list')
      patch.sponsors = sanitizeShowSponsors(body.sponsors)
    }
    if (typeof body.prompter_roll === 'boolean') patch.prompter_roll = body.prompter_roll
    if (body.prompter_speed !== undefined) {
      const n = Number(body.prompter_speed)
      if (!Number.isFinite(n)) return controlError('prompter_speed must be a number')
      patch.prompter_speed = Math.max(0.1, Math.min(6, n))
    }
    if (body.theme_override !== undefined) patch.theme_override = body.theme_override

    if (Object.keys(patch).length === 0) return controlError('Nothing to update')
    const { error } = await ctx.service.from('graphics_shows').update(patch).eq('id', ctx.showId)
    if (error) return controlError('Could not update the show', 500)
    return NextResponse.json({ success: true })
  })
}
