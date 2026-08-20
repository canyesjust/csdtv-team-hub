import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { isGraphicsDepth, defaultDepthFor } from '@/lib/graphics/depth'
import { GRAPHICS_EVENT_TYPES, type GraphicsEventType } from '@/lib/graphics/types'
import { starterFor } from '@/lib/graphics/starters'
import { mergeLibraryIntoShow } from '@/lib/graphics/sponsors'

export const dynamic = 'force-dynamic'

/**
 * Create a show. Nobody should start from an empty grid, so a new show comes
 * seeded with the blocks, rows and shelf for its event type.
 */
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 160) : 'Untitled show'
  const eventType: GraphicsEventType =
    typeof body.event_type === 'string' && (GRAPHICS_EVENT_TYPES as readonly string[]).includes(body.event_type)
      ? (body.event_type as GraphicsEventType)
      : 'other'

  const airAt = typeof body.air_at === 'string' && Number.isFinite(Date.parse(body.air_at))
    ? new Date(Date.parse(body.air_at)).toISOString() : null
  const hardOutAt = typeof body.hard_out_at === 'string' && Number.isFinite(Date.parse(body.hard_out_at))
    ? new Date(Date.parse(body.hard_out_at)).toISOString() : null

  // District sponsors carry into every new show, switched on. Untick one on
  // the show if it should not run tonight.
  const { data: sponsorLibrary } = await service
    .from('graphics_sponsors')
    .select('id, name, scope')
    .eq('active', true)
    .order('sort_order')
  const sponsors = mergeLibraryIntoShow([], (sponsorLibrary || []) as { id: string; name: string; scope: 'district' | 'school' }[])

  const { data: show, error } = await service
    .from('graphics_shows')
    .insert({
      sponsors,
      name,
      event_type: eventType,
      depth: isGraphicsDepth(body.depth) ? body.depth : defaultDepthFor(eventType),
      state: 'draft',
      school_code: typeof body.school_code === 'string' ? body.school_code : null,
      away_code: typeof body.away_code === 'string' ? body.away_code : null,
      channel_id: typeof body.channel_id === 'string' ? body.channel_id : null,
      production_id: typeof body.production_id === 'string' ? body.production_id : null,
      venue: typeof body.venue === 'string' ? body.venue.slice(0, 160) : null,
      show_date: typeof body.show_date === 'string' ? body.show_date : null,
      air_at: airAt,
      hard_out_at: hardOutAt,
      created_by: teamUser.id,
    })
    .select('id')
    .single()
  if (error || !show) return NextResponse.json({ error: 'Could not create the show' }, { status: 500 })

  const starter = starterFor(eventType)
  if (starter.blocks.length > 0) {
    const { data: blocks } = await service
      .from('graphics_blocks')
      .insert(starter.blocks.map((b, i) => ({
        show_id: show.id, label: b.label, anchor_type: b.anchor_type, sort_order: (i + 1) * 10,
      })))
      .select('id, label')

    const byLabel = new Map((blocks || []).map(b => [b.label, b.id]))
    if (starter.rows.length > 0) {
      await service.from('graphics_rows').insert(starter.rows.map((r, i) => ({
        show_id: show.id,
        block_id: byLabel.get(r.block) ?? null,
        page: r.page, slug: r.slug, form: r.form,
        est_seconds: r.est_seconds, is_break: r.is_break ?? false,
        graphic: r.graphic ?? null, approved: false, sort_order: (i + 1) * 10,
      })))
    }
    if (starter.shelf.length > 0) {
      await service.from('graphics_shelf_items').insert(starter.shelf.map((s, i) => ({
        show_id: show.id, label: s.label, graphic: s.graphic, sort_order: (i + 1) * 10,
      })))
    }
  }

  return NextResponse.json({ success: true, id: show.id })
}
