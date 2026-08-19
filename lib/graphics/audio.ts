import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AudioAsset = {
  id: string
  name: string
  kind: 'vo' | 'stinger' | 'bed' | 'sfx'
  storage_path: string
  mime_type: string
  duration_seconds: number | null
}

export type AudioCue = {
  asset_id: string
  mode: 'oneshot' | 'bed'
  gain_db: number
}

/** Signed URLs are short-lived; the output page refreshes them as it polls. */
export const AUDIO_URL_TTL_SECONDS = 60 * 60

export function sanitizeAudioCue(input: unknown): AudioCue | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (typeof raw.asset_id !== 'string') return null
  const mode = raw.mode === 'bed' ? 'bed' : 'oneshot'
  const gain = Number(raw.gain_db)
  return {
    asset_id: raw.asset_id,
    mode,
    gain_db: Number.isFinite(gain) ? Math.max(-60, Math.min(12, gain)) : 0,
  }
}

/**
 * Fire a cue. A one shot replaces the one-shot slot, a bed replaces the bed
 * slot, so a stinger never stops the music underneath it.
 */
export async function fireAudioCue(
  service: SupabaseClient,
  showId: string,
  cue: AudioCue,
): Promise<void> {
  await service.from('graphics_audio_state').upsert(
    {
      show_id: showId,
      slot: cue.mode,
      asset_id: cue.asset_id,
      gain_db: cue.gain_db,
      loop: cue.mode === 'bed',
      started_at: new Date().toISOString(),
    },
    { onConflict: 'show_id,slot' },
  )
}

export async function stopAudioSlot(
  service: SupabaseClient,
  showId: string,
  slot: 'oneshot' | 'bed' | 'all',
): Promise<void> {
  const query = service.from('graphics_audio_state').delete().eq('show_id', showId)
  if (slot !== 'all') await query.eq('slot', slot)
  else await query
}

export type PublicAudioState = {
  slot: 'oneshot' | 'bed'
  url: string
  gain_db: number
  loop: boolean
  started_at: string
  duration_seconds: number | null
  name: string
}

export async function buildAudioState(
  service: SupabaseClient,
  showId: string,
): Promise<PublicAudioState[]> {
  const { data } = await service
    .from('graphics_audio_state')
    .select('slot, gain_db, loop, started_at, graphics_audio_assets(id, name, storage_path, duration_seconds)')
    .eq('show_id', showId)
  if (!data || data.length === 0) return []

  const out: PublicAudioState[] = []
  for (const row of data) {
    const embedded = (row as unknown as { graphics_audio_assets?: unknown }).graphics_audio_assets
    const asset = (Array.isArray(embedded) ? embedded[0] : embedded) as
      { name: string; storage_path: string; duration_seconds: number | null } | undefined
    if (!asset) continue
    const { data: signed } = await service.storage
      .from('graphics-audio')
      .createSignedUrl(asset.storage_path, AUDIO_URL_TTL_SECONDS)
    if (!signed?.signedUrl) continue
    out.push({
      slot: row.slot as 'oneshot' | 'bed',
      url: signed.signedUrl,
      gain_db: Number(row.gain_db),
      loop: Boolean(row.loop),
      started_at: row.started_at,
      duration_seconds: asset.duration_seconds,
      name: asset.name,
    })
  }
  return out
}
