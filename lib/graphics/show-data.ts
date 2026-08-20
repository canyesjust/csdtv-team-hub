import 'server-only'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { deriveTheme } from '@/lib/graphics/theme'
import { GRAPHICS_DEFAULT_THEME } from '@/lib/graphics/output-state'
import type {
  AirEntry, GraphicPayload, GraphicsEventType, GraphicsShowState, GraphicsTheme,
} from '@/lib/graphics/types'
import { sanitizePlayers, type Player } from '@/lib/graphics/rosters'

export type ShowBlock = {
  id: string
  label: string
  anchor_type: 'none' | 'hard_start' | 'hard_out' | 'soft_target'
  anchor_at: string | null
  sort_order: number
}

export type ShowRow = {
  id: string
  block_id: string | null
  page: string
  slug: string
  form: string
  est_seconds: number
  repeat_count: number
  per_unit_seconds: number
  talent: string
  video: string
  camera: string
  audio_source: string
  script: string
  ifb: string
  notes: string
  graphic: GraphicPayload | null
  audio_cue: unknown
  hold_full: boolean
  is_break: boolean
  floated: boolean
  approved: boolean
  sort_order: number
  started_at: string | null
  ended_at: string | null
}

export type ShelfItem = {
  id: string
  label: string
  graphic: GraphicPayload | null
  sort_order: number
}

export type ShowBundle = {
  show: {
    id: string
    name: string
    event_type: GraphicsEventType
    state: GraphicsShowState
    show_date: string | null
    air_at: string | null
    hard_out_at: string | null
    venue: string | null
    school_code: string | null
    away_code: string | null
    started_at: string | null
    prompter_roll: boolean
    prompter_speed: number
    sponsors: { id: string; name: string; scope: 'district' | 'event'; on: boolean }[]
    home_roster_id: string | null
    away_roster_id: string | null
    package_id: string | null
    production_id: string | null
    channel: { id: string; slug: string; name: string; listening: boolean } | null
  }
  blocks: ShowBlock[]
  rows: ShowRow[]
  shelf: ShelfItem[]
  air: AirEntry[]
  /** Resolved for the jersey pad, so the operator types a number and stops there. */
  rosters: { home: Player[]; away: Player[] }
  audioAssets: { id: string; name: string; kind: string; duration_seconds: number | null }[]
  theme: GraphicsTheme
  /** Brand data for every school the show references, for logo marks. */
  schools: Record<string, {
    short_name: string | null; name: string | null; mascot: string | null
    primary_color: string | null; secondary_color: string | null; accent_color: string | null
  }>
}

export async function loadShowBundle(showId: string): Promise<ShowBundle | null> {
  const service = getServiceSupabaseClient()
  if (!service) return null

  const { data: show } = await service
    .from('graphics_shows')
    .select(
      'id, name, event_type, state, show_date, air_at, hard_out_at, venue, school_code, away_code, started_at, theme_override, sponsors, prompter_roll, prompter_speed, home_roster_id, away_roster_id, package_id, production_id, graphics_channels(id, slug, name, listening)',
    )
    .eq('id', showId)
    .maybeSingle()
  if (!show) return null

  const [{ data: blocks }, { data: rows }, { data: shelf }, { data: air }] = await Promise.all([
    service.from('graphics_blocks').select('id, label, anchor_type, anchor_at, sort_order').eq('show_id', showId).order('sort_order'),
    service.from('graphics_rows').select('*').eq('show_id', showId).order('sort_order'),
    service.from('graphics_shelf_items').select('id, label, graphic, sort_order').eq('show_id', showId).order('sort_order'),
    service.from('graphics_air').select('layer, graphic, source, out_seconds, taken_at').eq('show_id', showId),
  ])

  const rosterIds = [show.home_roster_id, show.away_roster_id].filter((r): r is string => Boolean(r))
  const rosters: { home: Player[]; away: Player[] } = { home: [], away: [] }
  if (rosterIds.length > 0) {
    const { data: rosterRows } = await service
      .from('graphics_rosters').select('id, players').in('id', rosterIds)
    for (const r of rosterRows || []) {
      if (r.id === show.home_roster_id) rosters.home = sanitizePlayers(r.players)
      if (r.id === show.away_roster_id) rosters.away = sanitizePlayers(r.players)
    }
  }

  const { data: audioAssets } = await service
    .from('graphics_audio_assets')
    .select('id, name, kind, duration_seconds')
    .order('name')

  const codes = [show.school_code, show.away_code].filter((c): c is string => Boolean(c))
  const schools: ShowBundle['schools'] = {}
  if (codes.length > 0) {
    const { data: schoolRows } = await service
      .from('schools')
      .select('code, short_name, name, mascot, primary_color, secondary_color, accent_color')
      .in('code', codes)
    for (const s of schoolRows || []) {
      schools[s.code] = {
        short_name: s.short_name, name: s.name, mascot: s.mascot,
        primary_color: s.primary_color, secondary_color: s.secondary_color, accent_color: s.accent_color,
      }
    }
  }

  let theme: GraphicsTheme = { ...GRAPHICS_DEFAULT_THEME }
  const override = show.theme_override as Partial<GraphicsTheme> | null
  if (override?.g1 && override.g2 && override.g3 && override.panel) {
    theme = override as GraphicsTheme
  } else if (show.school_code) {
    const { data: saved } = await service
      .from('graphics_theme_overrides')
      .select('g1, g2, g3, panel')
      .eq('school_code', show.school_code)
      .maybeSingle()
    theme = saved?.g1 ? (saved as GraphicsTheme) : deriveTheme(schools[show.school_code])
  }

  // PostgREST returns an embedded relation as an array unless it can prove the
  // join is to-one, so accept either shape.
  const embedded = (show as unknown as { graphics_channels?: unknown }).graphics_channels
  const channel = (Array.isArray(embedded) ? embedded[0] : embedded) as
    { id: string; slug: string; name: string; listening: boolean } | null | undefined ?? null

  return {
    show: {
      id: show.id, name: show.name,
      event_type: show.event_type as GraphicsEventType,
      state: show.state as GraphicsShowState,
      show_date: show.show_date, air_at: show.air_at, hard_out_at: show.hard_out_at,
      venue: show.venue, school_code: show.school_code, away_code: show.away_code,
      started_at: show.started_at,
      prompter_roll: Boolean(show.prompter_roll),
      prompter_speed: Number(show.prompter_speed ?? 1),
      sponsors: Array.isArray(show.sponsors) ? show.sponsors : [],
      home_roster_id: show.home_roster_id ?? null,
      away_roster_id: show.away_roster_id ?? null,
      package_id: show.package_id ?? null,
      production_id: show.production_id ?? null,
      channel,
    },
    blocks: (blocks || []) as ShowBlock[],
    rows: (rows || []) as ShowRow[],
    shelf: (shelf || []) as ShelfItem[],
    air: (air || []) as AirEntry[],
    rosters,
    audioAssets: audioAssets || [],
    theme,
    schools,
  }
}
