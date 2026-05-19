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
