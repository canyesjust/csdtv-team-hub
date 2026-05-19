import type { AttendanceStatus } from '@/lib/board-meetings/motion-types'

export type ControlAttendanceRecord = {
  person_id: string
  name: string
  status: AttendanceStatus
  arrived_at: string | null
  left_at: string | null
  notes: string | null
}

export type BoardMeetingRecord = {
  id: string
  production_id: string
  scheduled_public_start: string | null
  closed_session_start: string | null
  broadcast_status: string
  agenda_extracted_at: string | null
  agenda_locked: boolean
  agenda_locked_at: string | null
  agenda_locked_by: string | null
}

export type AgendaItemUI = {
  id?: string
  section_number: number
  section_title: string
  item_number: string
  sort_order: number
  title: string
  original_title?: string | null
  type: string
  action_requested: boolean
  is_broadcastable: boolean
  consent_block?: string | null
  notes?: string | null
  subitems?: unknown
  needs_review: boolean
  review_notes?: string | null
  presenters?: { name: string; title?: string | null }[]
  documents?: { title: string; filename: string }[]
}

export type LowerThirdPerson = {
  id: string
  display_name: string
  primary_title: string | null
  affiliation: string | null
  photo_path: string | null
  alternate_titles: string[] | null
  category: string
  officer_position: string | null
  is_active: boolean
}

export type OutputChannel = {
  id: string
  channel_number: number
  channel_name: string
  view_type: string
  tier: string
  access_secret: string
  is_active: boolean
}

export type ControlAgendaItem = {
  id: string
  section_number: number
  section_title: string
  item_number: string
  title: string
  type: string
  is_broadcastable: boolean
  consent_block?: string | null
}

export type ActiveMotion = {
  id: string
  motion_type: 'main' | 'substitute' | 'amendment'
  text: string | null
  agenda_item_id: string | null
  mover_id: string | null
  mover_name: string | null
  seconder_id: string | null
  seconder_name: string | null
  vote_type: 'voice' | 'roll_call'
  status: string
  parent_motion_id: string | null
  created_at: string
  result?: 'passed' | 'failed' | null
  tally_yea?: number
  tally_nay?: number
  tally_abstain?: number
}

export type MotionScreenBundle = {
  meeting: {
    id: string
    production_id: string
    title: string | null
    broadcast_status: string
    agenda_locked: boolean
  }
  active_motion: ActiveMotion | null
  parent_motion: ActiveMotion | null
  lifecycle_state: MotionLifecycleState['state']
  current_agenda_item: ControlAgendaItem | null
  consent_is_lead: boolean
  consent_range: string | null
  attendance: { person_id: string; name: string; status: string }[]
  can_control: boolean
  is_live: boolean
  result_on_overlay: boolean
}

export type MotionLifecycleState = {
  state: 'no_motion' | 'drafting' | 'open_for_discussion' | 'voting' | 'voted' | 'pushed' | 'closed'
  active_motion: ActiveMotion | null
  parent_motion: ActiveMotion | null
  recorded_votes_count: number
}

export type ResultOverlayState = {
  active: boolean
  motion_id: string
  passed: boolean
  yea_count: number
  nay_count: number
  abstain_count: number
  started_at: string
  total_duration: number
  seconds_remaining: number
  held: boolean
}

export type ControlBundle = {
  meeting: {
    title: string
    production_number: number | null
    quorum_size?: number
  } | null
  broadcast_state: {
    status: string
    mode: string
    live_started_at?: string | null
    current_agenda_item_id?: string | null
    agenda_overlay_visible?: boolean
    active_qr_url?: string | null
    active_qr_label?: string | null
    mode_ends_at?: string | null
    overlay_visible?: boolean
    mode_message?: string | null
    active_motion_id?: string | null
    active_vote_result_motion_id?: string | null
    vote_result_started_at?: string | null
    vote_result_duration_seconds?: number | null
    active_lower_third_person_id?: string | null
    active_qr_started_at?: string | null
    active_qr_duration_seconds?: number | null
  } | null
  agenda_items: ControlAgendaItem[]
  motion_lifecycle: MotionLifecycleState | null
  attendance: {
    records: ControlAttendanceRecord[]
    quorum: { threshold: number; present_count: number; quorum_met: boolean }
  } | null
  lower_third_active: {
    person_id: string
    display_name: string
    primary_title: string | null
  } | null
  lower_third_people: LowerThirdPerson[]
  result_overlay: ResultOverlayState | null
  playlist_state: {
    playback_state: string
    held_item_id: string | null
    current_item_id: string | null
  } | null
  channel_assignments: { output_channel_id: string }[]
  channels: { id: string; channel_number: number; channel_name: string; view_type?: string; tier?: string }[]
  active_timer: { id: string; label: string; duration_seconds?: number; started_at: string } | null
  recent_events: { event_type: string; created_at: string; occurred_at: string }[]
  timer_templates: { id: string; name: string; duration_seconds?: number }[]
  meeting_playlist: unknown | null
  board_meeting: BoardMeetingRecord
  production?: { production_number: number; livestream_url: string | null; title: string } | null
  items: ControlAgendaItem[]
  output_channels: ControlBundle['channels']
  active_lower_third: ControlBundle['lower_third_active']
  current_documents?: { source_url: string | null; title: string }[]
}
