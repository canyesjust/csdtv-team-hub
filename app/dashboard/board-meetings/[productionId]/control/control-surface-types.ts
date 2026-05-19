export type ControlBundle = {
  board_meeting: { id: string; broadcast_status: string; agenda_locked: boolean }
  items: {
    id: string
    section_number: number
    section_title: string
    item_number: string
    title: string
    is_broadcastable: boolean
    type: string
    consent_block?: string | null
  }[]
  production?: { production_number: number; livestream_url: string | null; title: string } | null
  current_documents?: { source_url: string | null; title: string }[]
  broadcast_state: {
    current_agenda_item_id: string | null
    overlay_visible: boolean
    mode: string
    mode_message: string | null
    active_qr_url?: string | null
    active_qr_label?: string | null
    active_qr_started_at?: string | null
    active_qr_duration_seconds?: number | null
    active_motion_id?: string | null
    active_vote_result_motion_id?: string | null
    vote_result_started_at?: string | null
    vote_result_duration_seconds?: number | null
    active_lower_third_person_id?: string | null
  } | null
  channel_assignments: { output_channel_id: string }[]
  active_timer: { id: string; label: string; duration_seconds: number; started_at: string } | null
  recent_events: { event_type: string; occurred_at: string }[]
  output_channels: { id: string; channel_number: number; channel_name: string }[]
  timer_templates: { id: string; name: string; duration_seconds: number }[]
}
