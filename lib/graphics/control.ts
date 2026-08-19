import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { broadcastGraphicsChange } from '@/lib/graphics/realtime'
import { resolveTake } from '@/lib/graphics/layers'
import { GRAPHICS_LAYERS, type GraphicPayload, type GraphicsLayer } from '@/lib/graphics/types'
import { templateById } from '@/lib/graphics/templates'
import { sanitizeAudioCue, fireAudioCue } from '@/lib/graphics/audio'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ControlContext = {
  service: SupabaseClient
  teamUserId: string
  showId: string
  channelSlug: string | null
}

export function controlError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Every mutation goes through here. Mirrors withControlContext on the board
 * side: authenticated team user, staff or manager role, then and only then the
 * service client. Broadcasts to the assigned channel after a successful
 * handler so the OBS output updates without waiting for its next poll.
 */
export async function withGraphicsControl(
  showId: string,
  handler: (ctx: ControlContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!UUID.test(showId)) return controlError('Not found', 404)

  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return controlError('Unauthorized', 401)
  if (!isStaffOrManagerRole(teamUser.role)) return controlError('Forbidden', 403)

  const service = getServiceSupabaseClient()
  if (!service) return controlError('Server configuration error', 500)

  const { data: show } = await service
    .from('graphics_shows')
    .select('id, channel_id, graphics_channels(slug)')
    .eq('id', showId)
    .maybeSingle()
  if (!show) return controlError('Not found', 404)

  const embedded = (show as unknown as { graphics_channels?: unknown }).graphics_channels
  const channel = (Array.isArray(embedded) ? embedded[0] : embedded) as { slug?: string } | null | undefined
  const channelSlug = channel?.slug ?? null

  const response = await handler({ service, teamUserId: teamUser.id, showId, channelSlug })

  if (channelSlug && response.status >= 200 && response.status < 300) {
    // Best effort. The polling ladder catches a dropped push, so a failure here
    // never shows on air.
    try {
      await broadcastGraphicsChange(channelSlug)
    } catch {
      /* ignore */
    }
  }
  return response
}

/** Server-side validation of a graphic payload. Never trust a client blob. */
export function sanitizeGraphic(input: unknown): GraphicPayload | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as { tid?: unknown; data?: unknown }
  if (typeof raw.tid !== 'string') return null
  const template = templateById(raw.tid)
  if (!template) return null

  const data: Record<string, string> = {}
  const incoming = (raw.data && typeof raw.data === 'object' ? raw.data : {}) as Record<string, unknown>
  for (const field of template.fields) {
    const value = incoming[field.id]
    data[field.id] = typeof value === 'string' ? value.slice(0, field.type === 'textarea' ? 4000 : 400) : ''
  }
  return { tid: template.id, data }
}

export function isLayer(value: unknown): value is GraphicsLayer {
  return typeof value === 'string' && (GRAPHICS_LAYERS as readonly string[]).includes(value)
}

type AirRow = { layer: GraphicsLayer; source: 'row' | 'shelf' }

async function readAir(service: SupabaseClient, showId: string): Promise<AirRow[]> {
  const { data } = await service.from('graphics_air').select('layer, source').eq('show_id', showId)
  return (data || []) as AirRow[]
}

/** Puts a graphic on a layer. `source` decides whether a take can clear it. */
export async function putGraphic(
  service: SupabaseClient,
  showId: string,
  graphic: GraphicPayload,
  source: 'row' | 'shelf',
  outSeconds: number,
  rowId: string | null,
): Promise<void> {
  const template = templateById(graphic.tid)
  if (!template) return
  await service.from('graphics_air').upsert(
    {
      show_id: showId,
      layer: template.layer,
      graphic,
      source,
      row_id: rowId,
      out_seconds: outSeconds,
      taken_at: new Date().toISOString(),
    },
    { onConflict: 'show_id,layer' },
  )
  await service.from('graphics_air_log').insert({
    show_id: showId, layer: template.layer, graphic, source, row_id: rowId,
  })
}

export async function clearLayers(
  service: SupabaseClient,
  showId: string,
  layers: GraphicsLayer[],
): Promise<void> {
  if (layers.length === 0) return
  await service.from('graphics_air').delete().eq('show_id', showId).in('layer', layers)
  await service
    .from('graphics_air_log')
    .update({ out_at: new Date().toISOString() })
    .eq('show_id', showId)
    .in('layer', layers)
    .is('out_at', null)
}

/**
 * Take a rundown row.
 *
 * Stamps the as-run timestamps, applies the layer policy, and fires the row's
 * graphic. The policy is what stops a show-open slate sitting over the rest of
 * the show: anything a *row* put up is cleared unless the incoming row replaces
 * that layer or the row is flagged hold. Shelf graphics survive.
 */
export async function takeRow(
  service: SupabaseClient,
  showId: string,
  rowId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row } = await service
    .from('graphics_rows')
    .select('id, show_id, graphic, audio_cue, hold_full, floated')
    .eq('id', rowId)
    .eq('show_id', showId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Row not found' }
  if (row.floated) return { ok: false, error: 'Row is floated' }

  const now = new Date().toISOString()

  // Close out whatever was on air, then open this one.
  await service
    .from('graphics_rows')
    .update({ ended_at: now })
    .eq('show_id', showId)
    .not('started_at', 'is', null)
    .is('ended_at', null)
  await service.from('graphics_rows').update({ started_at: now, ended_at: null }).eq('id', rowId)

  const { data: show } = await service
    .from('graphics_shows')
    .select('started_at, state')
    .eq('id', showId)
    .maybeSingle()
  if (show && !show.started_at) {
    await service
      .from('graphics_shows')
      .update({ started_at: now, state: show.state === 'live' ? 'live' : show.state })
      .eq('id', showId)
  }

  const incoming = sanitizeGraphic(row.graphic)
  const current = await readAir(service, showId)
  const plan = resolveTake({ current, incoming, holdFull: Boolean(row.hold_full) })

  await clearLayers(service, showId, plan.clear)
  if (plan.put) await putGraphic(service, showId, plan.put.graphic, 'row', plan.put.out_seconds, rowId)

  // A prevoiced tease or a sponsor read fires with its row.
  const cue = sanitizeAudioCue(row.audio_cue)
  if (cue) await fireAudioCue(service, showId, cue)

  return { ok: true }
}
