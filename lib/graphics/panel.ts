import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { takeRow, clearLayers, putGraphic, sanitizeGraphic } from '@/lib/graphics/control'
import { ROW_OWNED_LAYERS, defaultOutSeconds } from '@/lib/graphics/layers'
import { stopAudioSlot } from '@/lib/graphics/audio'
import { templateById } from '@/lib/graphics/templates'
import { GRAPHICS_LAYERS, type GraphicPayload, type GraphicsLayer } from '@/lib/graphics/types'
import { currentIndex, stepTarget } from '@/lib/graphics/panel-nav'

export { currentIndex, stepTarget }

/**
 * Hardware panel commands.
 *
 * A Stream Deck key is one word. Everything here is a single verb with at most
 * one number, because the person pressing it is looking at the field, not at
 * the screen.
 */
export const PANEL_ACTIONS = [
  'status',
  'take_next',
  'take_prev',
  'take_row',
  'clear',
  'clear_all',
  'shelf',
  'prompter',
  'audio_stop',
] as const
export type PanelAction = (typeof PANEL_ACTIONS)[number]

export function isPanelAction(value: unknown): value is PanelAction {
  return typeof value === 'string' && (PANEL_ACTIONS as readonly string[]).includes(value)
}

export type PanelShow = {
  id: string
  name: string
  state: string
}

export type PanelRow = {
  id: string
  page: string
  slug: string
  sort_order: number
  started_at: string | null
  ended_at: string | null
}

/**
 * The show a panel is driving. A panel is bound to a rig, not to a show, so
 * this resolves the same way the OBS output does: whatever is live on this
 * channel, and a rehearsal if nothing is live.
 */
export async function panelShow(
  service: SupabaseClient,
  channelId: string,
): Promise<PanelShow | null> {
  const { data } = await service
    .from('graphics_shows')
    .select('id, name, state')
    .eq('channel_id', channelId)
    .in('state', ['rehearsal', 'live'])
    .order('state', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PanelShow | null) ?? null
}

async function takeableRows(service: SupabaseClient, showId: string): Promise<PanelRow[]> {
  const { data } = await service
    .from('graphics_rows')
    .select('id, page, slug, sort_order, started_at, ended_at')
    .eq('show_id', showId)
    .eq('floated', false)
    .order('sort_order')
  return (data || []) as PanelRow[]
}

export type PanelResult = {
  ok: boolean
  action: string
  message: string
  show?: { id: string; name: string; state: string }
  row?: { page: string; slug: string } | null
  next?: { page: string; slug: string } | null
}

function label(row: PanelRow | undefined | null) {
  return row ? { page: row.page, slug: row.slug } : null
}

/**
 * Run one command. Returns a small object rather than a bare 200, so a panel
 * with a display can put the slug on the key.
 */
export async function runPanelCommand(
  service: SupabaseClient,
  channelId: string,
  action: PanelAction,
  arg: string | null,
): Promise<PanelResult> {
  const show = await panelShow(service, channelId)
  if (!show) {
    return { ok: false, action, message: 'No live or rehearsal show on this rig' }
  }
  const base = { show: { id: show.id, name: show.name, state: show.state } }
  const rows = await takeableRows(service, show.id)
  const at = currentIndex(rows)

  switch (action) {
    case 'status':
      return {
        ok: true, action, ...base,
        message: rows.length === 0 ? 'No rows' : 'ok',
        row: label(at >= 0 ? rows[at] : null),
        next: label(rows[at + 1]),
      }

    case 'take_next':
    case 'take_prev': {
      const step = action === 'take_next' ? 1 : -1
      const target = stepTarget(rows, step)
      if (!target) {
        return { ok: false, action, ...base, message: step > 0 ? 'End of the rundown' : 'Top of the rundown' }
      }
      const result = await takeRow(service, show.id, target.id)
      if (!result.ok) return { ok: false, action, ...base, message: result.error }
      const after = rows.findIndex(r => r.id === target.id)
      return {
        ok: true, action, ...base,
        message: `${target.page} ${target.slug}`,
        row: label(target),
        next: label(rows[after + 1]),
      }
    }

    case 'take_row': {
      if (!arg) return { ok: false, action, ...base, message: 'A page number is required' }
      const target = rows.find(r => r.page.toLowerCase() === arg.toLowerCase())
      if (!target) return { ok: false, action, ...base, message: `No row on page ${arg}` }
      const result = await takeRow(service, show.id, target.id)
      if (!result.ok) return { ok: false, action, ...base, message: result.error }
      return { ok: true, action, ...base, message: `${target.page} ${target.slug}`, row: label(target) }
    }

    case 'clear': {
      const layer = arg && (GRAPHICS_LAYERS as readonly string[]).includes(arg)
        ? ([arg] as GraphicsLayer[])
        : ROW_OWNED_LAYERS
      await clearLayers(service, show.id, layer)
      return { ok: true, action, ...base, message: `Cleared ${layer.join(', ')}` }
    }

    case 'clear_all':
      await clearLayers(service, show.id, [...GRAPHICS_LAYERS] as GraphicsLayer[])
      return { ok: true, action, ...base, message: 'All layers out' }

    case 'shelf': {
      const slot = Number(arg)
      if (!Number.isFinite(slot) || slot < 1) {
        return { ok: false, action, ...base, message: 'A shelf slot number is required' }
      }
      const { data: shelf } = await service
        .from('graphics_shelf_items')
        .select('id, label, graphic')
        .eq('show_id', show.id)
        .order('sort_order')
      const item = (shelf || [])[Math.round(slot) - 1] as { label: string; graphic: unknown } | undefined
      if (!item) return { ok: false, action, ...base, message: `Nothing in shelf slot ${slot}` }

      const graphic = sanitizeGraphic(item.graphic) as GraphicPayload | null
      if (!graphic) return { ok: false, action, ...base, message: 'That shelf item is malformed' }
      const template = templateById(graphic.tid)!

      // A shelf key is a toggle. Pressing it while its own graphic is up takes
      // it out, which is the only behaviour that survives a dark van.
      const { data: onAir } = await service
        .from('graphics_air')
        .select('layer, graphic, source')
        .eq('show_id', show.id)
        .eq('layer', template.layer)
        .maybeSingle()
      const same =
        onAir?.source === 'shelf' &&
        (onAir.graphic as GraphicPayload | null)?.tid === graphic.tid
      if (same) {
        await clearLayers(service, show.id, [template.layer])
        return { ok: true, action, ...base, message: `${item.label} out` }
      }
      await putGraphic(
        service, show.id, graphic, 'shelf',
        defaultOutSeconds(template.layer, 'shelf', graphic.tid), null,
      )
      return { ok: true, action, ...base, message: `${item.label} in` }
    }

    case 'prompter': {
      const want = arg === 'on' ? true : arg === 'off' ? false : null
      const { data: current } = await service
        .from('graphics_shows').select('prompter_roll').eq('id', show.id).maybeSingle()
      const roll = want === null ? !current?.prompter_roll : want
      await service.from('graphics_shows').update({ prompter_roll: roll }).eq('id', show.id)
      return { ok: true, action, ...base, message: roll ? 'Prompter rolling' : 'Prompter paused' }
    }

    case 'audio_stop': {
      const slot = arg === 'bed' || arg === 'oneshot' ? arg : 'all'
      await stopAudioSlot(service, show.id, slot)
      return { ok: true, action, ...base, message: `Audio ${slot} stopped` }
    }
  }
}
