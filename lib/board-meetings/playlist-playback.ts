import type { SupabaseClient } from '@supabase/supabase-js'
import { mediaPlaybackUrl } from '@/lib/board-meetings/media-library'
import {
  defaultDurationForItemType,
  isInfoCardType,
  isMediaItemType,
  type AssetType,
  type LoopBehavior,
  type MeetingPlaylistRow,
  type PlaybackState,
  type PlaylistItemRow,
  type PlaylistItemType,
  type PublicPlaylistCurrentItem,
  type PublicPlaylistState,
} from '@/lib/board-meetings/playlist-types'

type PlaylistBundle = {
  playlist: MeetingPlaylistRow
  items: PlaylistItemRow[]
  assets: Map<string, { storage_path: string; asset_type: AssetType; duration_seconds: number | null; name: string }>
}

export async function loadMeetingPlaylistBundle(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<PlaylistBundle | null> {
  const { data: playlist } = await service
    .from('meeting_playlists')
    .select('*')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (!playlist) return null

  const { data: items } = await service
    .from('meeting_playlist_items')
    .select('*')
    .eq('meeting_playlist_id', playlist.id)
    .order('sort_order', { ascending: true })

  const rows = (items || []) as PlaylistItemRow[]
  const assetIds = [
    ...new Set(
      rows.map(i => i.media_asset_id).filter(Boolean) as string[],
    ),
    playlist.music_bed_id,
    playlist.replace_now_asset_id,
  ].filter(Boolean) as string[]

  const assets = new Map<string, { storage_path: string; asset_type: AssetType; duration_seconds: number | null; name: string }>()
  if (assetIds.length > 0) {
    const { data: assetRows } = await service
      .from('media_assets')
      .select('id, storage_path, asset_type, duration_seconds, name')
      .in('id', assetIds)
    for (const a of assetRows || []) {
      assets.set(a.id, {
        storage_path: a.storage_path,
        asset_type: a.asset_type as AssetType,
        duration_seconds: a.duration_seconds != null ? Number(a.duration_seconds) : null,
        name: a.name,
      })
    }
  }

  return { playlist: playlist as MeetingPlaylistRow, items: rows, assets }
}

function itemDuration(
  item: PlaylistItemRow,
  assets: PlaylistBundle['assets'],
): number {
  if (item.duration_seconds != null && item.duration_seconds > 0) return item.duration_seconds
  if (item.media_asset_id) {
    const a = assets.get(item.media_asset_id)
    if (a?.duration_seconds && a.duration_seconds > 0) return Math.ceil(a.duration_seconds)
  }
  return defaultDurationForItemType(item.item_type)
}

function resolveActiveItemId(playlist: MeetingPlaylistRow, items: PlaylistItemRow[]): string | null {
  if (playlist.held_item_id && items.some(i => i.id === playlist.held_item_id)) {
    return playlist.held_item_id
  }
  if (playlist.current_item_id && items.some(i => i.id === playlist.current_item_id)) {
    return playlist.current_item_id
  }
  return items[0]?.id ?? null
}

export function shouldPlaylistRun(
  playlist: MeetingPlaylistRow,
  broadcastStatus: string,
  mode: string,
): boolean {
  if (broadcastStatus === 'archived' || broadcastStatus === 'cancelled') return false
  if (broadcastStatus === 'live' && !playlist.play_during_live) return false
  if (mode === 'recess' && !playlist.play_during_recess) return false
  return true
}

export async function tickMeetingPlaylist(
  service: SupabaseClient,
  bundle: PlaylistBundle,
  broadcastStatus: string,
  mode: string,
): Promise<PlaylistBundle> {
  const { playlist, items, assets } = bundle
  if (items.length === 0) return bundle
  if (!shouldPlaylistRun(playlist, broadcastStatus, mode)) return bundle

  const now = Date.now()
  let pl = { ...playlist }

  if (pl.replace_now_asset_id && pl.replace_now_started_at) {
    const dur = pl.replace_now_duration_seconds ?? 15
    const elapsed = (now - new Date(pl.replace_now_started_at).getTime()) / 1000
    if (elapsed >= dur) {
      await service
        .from('meeting_playlists')
        .update({
          replace_now_asset_id: null,
          replace_now_started_at: null,
          replace_now_duration_seconds: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pl.id)
      pl.replace_now_asset_id = null
      pl.replace_now_started_at = null
    } else {
      return bundle
    }
  }

  if (pl.playback_state === 'idle') {
    const first = items[0]
    await service
      .from('meeting_playlists')
      .update({
        playback_state: 'playing',
        current_item_id: first.id,
        current_item_started_at: new Date().toISOString(),
        held_item_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pl.id)
    return (await loadMeetingPlaylistBundle(service, pl.board_meeting_id))!
  }

  if (pl.playback_state !== 'playing') return bundle
  if (pl.held_item_id) return bundle

  const activeId = resolveActiveItemId(pl, items)
  if (!activeId || !pl.current_item_started_at) return bundle

  const active = items.find(i => i.id === activeId)
  if (!active) return bundle

  const dur = itemDuration(active, assets)
  const elapsed = (now - new Date(pl.current_item_started_at).getTime()) / 1000
  if (elapsed < dur) return bundle

  const idx = items.findIndex(i => i.id === activeId)
  const nextIdx = idx + 1
  if (nextIdx >= items.length) {
    if (pl.loop_behavior === 'play_once') {
      await service
        .from('meeting_playlists')
        .update({
          playback_state: 'idle',
          current_item_id: null,
          current_item_started_at: null,
          held_item_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pl.id)
    } else {
      const first = items[0]
      await service
        .from('meeting_playlists')
        .update({
          current_item_id: first.id,
          current_item_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pl.id)
    }
  } else {
    const next = items[nextIdx]
    await service
      .from('meeting_playlists')
      .update({
        current_item_id: next.id,
        current_item_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pl.id)
  }

  return (await loadMeetingPlaylistBundle(service, pl.board_meeting_id))!
}

export async function buildPublicPlaylistPayload(
  service: SupabaseClient,
  bundle: PlaylistBundle,
): Promise<PublicPlaylistState> {
  const { playlist, items, assets } = bundle
  const held = !!playlist.held_item_id

  let music_bed_url: string | null = null
  if (playlist.music_bed_id && assets.has(playlist.music_bed_id)) {
    music_bed_url = await mediaPlaybackUrl(service, assets.get(playlist.music_bed_id)!.storage_path)
  }

  if (playlist.replace_now_asset_id && assets.has(playlist.replace_now_asset_id)) {
    const a = assets.get(playlist.replace_now_asset_id)!
    const dur = playlist.replace_now_duration_seconds ?? (a.asset_type === 'video' ? Math.ceil(a.duration_seconds || 30) : 15)
    return {
      playback_state: playlist.playback_state,
      loop_behavior: playlist.loop_behavior,
      music_bed_url,
      held,
      replace_now_asset: {
        asset_url: await mediaPlaybackUrl(service, a.storage_path),
        asset_type: a.asset_type,
        duration_seconds: dur,
        label: a.name,
        started_at: playlist.replace_now_started_at || new Date().toISOString(),
      },
      current_item: null,
    }
  }

  if (playlist.playback_state === 'idle' || items.length === 0) {
    return {
      playback_state: playlist.playback_state,
      loop_behavior: playlist.loop_behavior,
      music_bed_url,
      held,
      replace_now_asset: null,
      current_item: null,
    }
  }

  const activeId = resolveActiveItemId(playlist, items)
  const item = items.find(i => i.id === activeId)
  if (!item) {
    return {
      playback_state: playlist.playback_state,
      loop_behavior: playlist.loop_behavior,
      music_bed_url,
      held,
      replace_now_asset: null,
      current_item: null,
    }
  }

  let asset_url: string | null = null
  let asset_type: AssetType | null = null
  if (item.media_asset_id && assets.has(item.media_asset_id)) {
    const a = assets.get(item.media_asset_id)!
    asset_url = await mediaPlaybackUrl(service, a.storage_path)
    asset_type = a.asset_type
  }

  const current_item: PublicPlaylistCurrentItem = {
    id: item.id,
    item_type: item.item_type,
    asset_url,
    asset_type,
    duration_seconds: itemDuration(item, assets),
    label: item.label,
    transition: item.transition,
    started_at: playlist.current_item_started_at || new Date().toISOString(),
    info_card_config: item.info_card_config,
  }

  return {
    playback_state: playlist.playback_state,
    loop_behavior: playlist.loop_behavior,
    music_bed_url,
    held,
    replace_now_asset: null,
    current_item,
  }
}

async function getBoardMeetingId(service: SupabaseClient, productionId: string): Promise<string> {
  const { data } = await service
    .from('board_meetings')
    .select('id')
    .eq('production_id', productionId)
    .maybeSingle()
  if (!data) throw new Error('Board meeting not found')
  return data.id
}

async function ensurePlaylist(service: SupabaseClient, productionId: string): Promise<PlaylistBundle> {
  const bmId = await getBoardMeetingId(service, productionId)
  let bundle = await loadMeetingPlaylistBundle(service, bmId)
  if (!bundle) {
    const { data, error } = await service
      .from('meeting_playlists')
      .insert({ board_meeting_id: bmId })
      .select('*')
      .single()
    if (error || !data) throw new Error(error?.message || 'Could not create playlist')
    bundle = { playlist: data as MeetingPlaylistRow, items: [], assets: new Map() }
  }
  return bundle
}

export async function applyTemplateToMeeting(
  service: SupabaseClient,
  productionId: string,
  templateId: string,
): Promise<PlaylistBundle> {
  const bmId = await getBoardMeetingId(service, productionId)
  const { data: template } = await service.from('playlist_templates').select('*').eq('id', templateId).single()
  if (!template) throw new Error('Template not found')

  const { data: tplItems } = await service
    .from('playlist_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })

  await service.from('meeting_playlists').delete().eq('board_meeting_id', bmId)

  const { data: playlist, error: plErr } = await service
    .from('meeting_playlists')
    .insert({
      board_meeting_id: bmId,
      derived_from_template_id: templateId,
      music_bed_id: template.default_music_bed_id,
      loop_behavior: template.loop_behavior,
    })
    .select('*')
    .single()
  if (plErr || !playlist) throw new Error(plErr?.message || 'Could not create meeting playlist')

  if (tplItems?.length) {
    const { error } = await service.from('meeting_playlist_items').insert(
      tplItems.map((it, i) => ({
        meeting_playlist_id: playlist.id,
        item_type: it.item_type,
        media_asset_id: it.media_asset_id,
        info_card_config: it.info_card_config,
        duration_seconds: it.duration_seconds,
        label: it.label,
        transition: it.transition,
        sort_order: i,
      })),
    )
    if (error) throw new Error(error.message)
  }

  return (await loadMeetingPlaylistBundle(service, bmId))!
}

export async function playlistPlay(service: SupabaseClient, productionId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  if (bundle.items.length === 0) throw new Error('Playlist has no items')
  const first = bundle.items[0]
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'playing',
      current_item_id: bundle.playlist.current_item_id || first.id,
      current_item_started_at: new Date().toISOString(),
      held_item_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function playlistPause(service: SupabaseClient, productionId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  await service
    .from('meeting_playlists')
    .update({ playback_state: 'paused', updated_at: new Date().toISOString() })
    .eq('id', bundle.playlist.id)
}

export async function playlistEnd(service: SupabaseClient, productionId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'idle',
      current_item_id: null,
      current_item_started_at: null,
      held_item_id: null,
      replace_now_asset_id: null,
      replace_now_started_at: null,
      replace_now_duration_seconds: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function playlistSkip(service: SupabaseClient, productionId: string, direction: 1 | -1) {
  const bundle = await ensurePlaylist(service, productionId)
  const { playlist, items } = bundle
  if (items.length === 0) throw new Error('Playlist has no items')

  const activeId = resolveActiveItemId(playlist, items)
  let idx = items.findIndex(i => i.id === activeId)
  if (idx < 0) idx = 0

  let nextIdx = idx + direction
  if (nextIdx < 0) nextIdx = 0
  if (nextIdx >= items.length) {
    if (direction > 0 && playlist.loop_behavior === 'loop_all') nextIdx = 0
    else if (direction > 0) {
      await playlistEnd(service, productionId)
      return
    } else {
      nextIdx = items.length - 1
    }
  }

  const next = items[nextIdx]
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'playing',
      current_item_id: next.id,
      current_item_started_at: new Date().toISOString(),
      held_item_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playlist.id)
}

export async function playlistJumpTo(service: SupabaseClient, productionId: string, itemId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  if (!bundle.items.some(i => i.id === itemId)) throw new Error('Item not in playlist')
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'playing',
      current_item_id: itemId,
      current_item_started_at: new Date().toISOString(),
      held_item_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function playlistHold(service: SupabaseClient, productionId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  const activeId = resolveActiveItemId(bundle.playlist, bundle.items)
  if (!activeId) throw new Error('No current item')
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'held',
      held_item_id: activeId,
      current_item_id: activeId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function playlistReleaseHold(service: SupabaseClient, productionId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'playing',
      held_item_id: null,
      current_item_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function playlistReplaceNow(
  service: SupabaseClient,
  productionId: string,
  assetId: string,
  durationSeconds?: number,
) {
  const bundle = await ensurePlaylist(service, productionId)
  const { data: asset } = await service.from('media_assets').select('asset_type, duration_seconds').eq('id', assetId).single()
  if (!asset) throw new Error('Asset not found')

  let dur = durationSeconds
  if (!dur) {
    if (asset.asset_type === 'video' || asset.asset_type === 'bumper') {
      dur = asset.duration_seconds ? Math.ceil(Number(asset.duration_seconds)) : 30
    } else if (asset.asset_type === 'audio_bed') {
      dur = asset.duration_seconds ? Math.ceil(Number(asset.duration_seconds)) : 60
    } else {
      dur = 15
    }
  }

  await service
    .from('meeting_playlists')
    .update({
      replace_now_asset_id: assetId,
      replace_now_started_at: new Date().toISOString(),
      replace_now_duration_seconds: dur,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function playlistClearReplace(service: SupabaseClient, productionId: string) {
  const bundle = await ensurePlaylist(service, productionId)
  await service
    .from('meeting_playlists')
    .update({
      replace_now_asset_id: null,
      replace_now_started_at: null,
      replace_now_duration_seconds: null,
      playback_state: 'playing',
      current_item_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export async function stopPlaylistOnGoLive(service: SupabaseClient, boardMeetingId: string) {
  const bundle = await loadMeetingPlaylistBundle(service, boardMeetingId)
  if (!bundle || bundle.playlist.play_during_live) return
  if (bundle.playlist.playback_state === 'idle') return
  await service
    .from('meeting_playlists')
    .update({
      playback_state: 'idle',
      current_item_id: null,
      current_item_started_at: null,
      held_item_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bundle.playlist.id)
}

export { getBoardMeetingId, ensurePlaylist, itemDuration, isMediaItemType, isInfoCardType }
