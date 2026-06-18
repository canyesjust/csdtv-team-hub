export const ASSET_TYPES = ['video', 'image', 'bumper', 'audio_bed'] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export const PLAYLIST_ITEM_TYPES = [
  'video',
  'image',
  'bumper',
  'info_card_countdown',
  'info_card_agenda_preview',
  'info_card_meet_the_board',
  'info_card_past_meetings',
  'info_card_custom',
] as const
export type PlaylistItemType = (typeof PLAYLIST_ITEM_TYPES)[number]

export const LOOP_BEHAVIORS = ['loop_all', 'play_once'] as const
export type LoopBehavior = (typeof LOOP_BEHAVIORS)[number]

export const PLAYBACK_STATES = ['idle', 'playing', 'paused', 'held'] as const
export type PlaybackState = (typeof PLAYBACK_STATES)[number]

export const TRANSITIONS = ['cut', 'fade', 'slide'] as const
export type Transition = (typeof TRANSITIONS)[number]

export type MediaAssetRow = {
  id: string
  name: string
  description: string | null
  asset_type: AssetType
  filename: string
  storage_path: string
  file_size_bytes: number | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  mime_type: string
  tags: string[]
  thumbnail_path: string | null
  created_at: string
  updated_at: string
}

export type PlaylistItemRow = {
  id: string
  item_type: PlaylistItemType
  media_asset_id: string | null
  info_card_config: Record<string, unknown> | null
  duration_seconds: number | null
  label: string
  transition: Transition
  sort_order: number
}

export type MeetingPlaylistRow = {
  id: string
  /** null = the single global pre-roll playlist shared by all meetings. */
  board_meeting_id: string | null
  derived_from_template_id: string | null
  music_bed_id: string | null
  loop_behavior: LoopBehavior
  play_during_live: boolean
  play_during_recess: boolean
  playback_state: PlaybackState
  current_item_id: string | null
  current_item_started_at: string | null
  held_item_id: string | null
  replace_now_asset_id: string | null
  replace_now_started_at: string | null
  replace_now_duration_seconds: number | null
}

export type PublicPlaylistCurrentItem = {
  id: string
  item_type: PlaylistItemType
  asset_url: string | null
  asset_type: AssetType | null
  duration_seconds: number
  label: string
  transition: Transition
  started_at: string
  info_card_config: Record<string, unknown> | null
}

export type PublicPlaylistState = {
  playback_state: PlaybackState
  loop_behavior: LoopBehavior
  music_bed_url: string | null
  held: boolean
  replace_now_asset: {
    asset_url: string
    asset_type: AssetType
    duration_seconds: number
    label: string
    started_at: string
  } | null
  current_item: PublicPlaylistCurrentItem | null
}

export const INFO_CARD_LABELS: Record<string, string> = {
  info_card_countdown: 'Countdown',
  info_card_agenda_preview: "Tonight's agenda",
  info_card_meet_the_board: 'Meet the board',
  info_card_past_meetings: 'Past meetings',
  info_card_custom: 'Custom message',
}

export function isMediaItemType(t: string): boolean {
  return t === 'video' || t === 'image' || t === 'bumper'
}

export function isInfoCardType(t: string): boolean {
  return t.startsWith('info_card_')
}

export function defaultDurationForItemType(itemType: PlaylistItemType): number {
  switch (itemType) {
    case 'info_card_countdown':
      return 600
    case 'info_card_meet_the_board':
      return 24
    case 'info_card_agenda_preview':
    case 'info_card_past_meetings':
    case 'info_card_custom':
      return 15
    case 'image':
      return 12
    default:
      return 15
  }
}
