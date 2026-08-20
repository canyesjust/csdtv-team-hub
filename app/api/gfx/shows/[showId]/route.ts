import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'
import { GRAPHICS_EVENT_TYPES, GRAPHICS_SHOW_STATES } from '@/lib/graphics/types'
import { sanitizeShowSponsors } from '@/lib/graphics/sponsors'
import { sanitizePrompterSeek } from '@/lib/graphics/prompter'

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

      /**
       * Wake the rig when the show goes live or into rehearsal, and put it back
       * to sleep when it wraps. Listening is what separates a 350ms poll from a
       * two minute one, and nobody should have to remember to flip it.
       */
      const { data: showRow } = await ctx.service
        .from('graphics_shows').select('channel_id').eq('id', ctx.showId).maybeSingle()
      if (showRow?.channel_id) {
        const wake = body.state === 'live' || body.state === 'rehearsal'
        await ctx.service
          .from('graphics_channels')
          .update({ listening: wake })
          .eq('id', showRow.channel_id)
      }
    }
    for (const key of ['air_at', 'hard_out_at'] as const) {
      if (typeof body[key] === 'string') {
        const parsed = Date.parse(body[key] as string)
        if (!Number.isFinite(parsed)) return controlError(`${key} is not a valid time`)
        patch[key] = new Date(parsed).toISOString()
      } else if (body[key] === null) patch[key] = null
    }
    for (const key of ['school_code', 'away_code', 'channel_id', 'show_date', 'home_roster_id', 'away_roster_id', 'production_id'] as const) {
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

    /**
     * A seek is a command, not a value. The counter is stamped server-side so
     * two surfaces pressing back at once cannot land on the same number and
     * have the output swallow one of them.
     */
    if (body.prompter_seek !== undefined) {
      const seek = sanitizePrompterSeek(body.prompter_seek)
      if (!seek) return controlError('Unknown prompter seek')
      const { data: current } = await ctx.service
        .from('graphics_shows').select('prompter_seek_n').eq('id', ctx.showId).maybeSingle()
      patch.prompter_seek_n = Number(current?.prompter_seek_n ?? 0) + 1
      patch.prompter_seek_kind = seek.kind
      patch.prompter_seek_value = seek.value
    }

    if (Object.keys(patch).length === 0) return controlError('Nothing to update')
    const { error } = await ctx.service.from('graphics_shows').update(patch).eq('id', ctx.showId)
    if (error) return controlError('Could not update the show', 500)
    return NextResponse.json({ success: true })
  })
}
