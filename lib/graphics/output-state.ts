import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { deriveTheme } from '@/lib/graphics/theme'
import type {
  AirEntry,
  GraphicsChannel,
  GraphicsOutputState,
  GraphicsShowState,
  GraphicsTheme,
} from '@/lib/graphics/types'

export const GRAPHICS_DEFAULT_THEME: GraphicsTheme = {
  g1: '#c2283a', g2: '#234fb0', g3: '#f0cd7a', panel: '#0a1020',
}

export async function getChannelBySlug(slug: string): Promise<(GraphicsChannel & { output_token: string }) | null> {
  const service = getServiceSupabaseClient()
  if (!service) return null
  const { data, error } = await service
    .from('graphics_channels')
    .select('id, slug, name, note, listening, output_token')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  return data as GraphicsChannel & { output_token: string }
}

async function resolveTheme(
  service: SupabaseClient,
  schoolCode: string | null,
  override: unknown,
): Promise<GraphicsTheme> {
  if (override && typeof override === 'object') {
    const o = override as Partial<GraphicsTheme>
    if (o.g1 && o.g2 && o.g3 && o.panel) return o as GraphicsTheme
  }
  if (!schoolCode) return { ...GRAPHICS_DEFAULT_THEME }

  const { data: saved } = await service
    .from('graphics_theme_overrides')
    .select('g1, g2, g3, panel')
    .eq('school_code', schoolCode)
    .maybeSingle()
  if (saved?.g1 && saved.g2 && saved.g3 && saved.panel) return saved as GraphicsTheme

  const { data: school } = await service
    .from('schools')
    .select('primary_color, secondary_color, accent_color')
    .eq('code', schoolCode)
    .maybeSingle()
  return deriveTheme(school)
}

/**
 * Full state for a channel. The output page asks for this on every connect,
 * not just on first load, so a browser-source refresh mid-show restores
 * whatever was on air inside a second.
 */
export async function buildChannelOutputState(channelId: string): Promise<GraphicsOutputState> {
  const now = new Date().toISOString()
  const empty: GraphicsOutputState = {
    show_id: null, show_name: null, state: null,
    theme: { ...GRAPHICS_DEFAULT_THEME },
    air: [], audio: { one: null, bed: null },
    server_now: now, rev: 0,
  }

  const service = getServiceSupabaseClient()
  if (!service) return empty

  const { data: show } = await service
    .from('graphics_shows')
    .select('id, name, state, school_code, theme_override, updated_at')
    .eq('channel_id', channelId)
    .in('state', ['rehearsal', 'live'])
    .order('state', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!show) return empty

  const [{ data: airRows }, theme] = await Promise.all([
    service
      .from('graphics_air')
      .select('layer, graphic, source, out_seconds, taken_at')
      .eq('show_id', show.id),
    resolveTheme(service, show.school_code, show.theme_override),
  ])

  return {
    show_id: show.id,
    show_name: show.name,
    state: show.state as GraphicsShowState,
    theme,
    air: (airRows || []) as AirEntry[],
    audio: { one: null, bed: null },
    server_now: now,
    rev: Date.parse(show.updated_at || now) || 0,
  }
}
