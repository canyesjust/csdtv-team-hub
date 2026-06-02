/** Shape returned from extract-agenda edge function */
export type ExtractedAgendaPresenter = {
  name: string
  title?: string | null
  affiliation?: string | null
}
export type ExtractedAgendaDocument = { title: string; filename: string; source_url?: string | null }

export type ExtractedAgendaItem = {
  section_number: number
  section_title: string
  item_number: string
  sort_order: number
  title: string
  original_title?: string | null
  type: 'procedural' | 'information' | 'action' | 'recognition'
  action_requested?: boolean
  is_broadcastable?: boolean
  consent_block?: string | null
  presenters?: ExtractedAgendaPresenter[]
  documents?: ExtractedAgendaDocument[]
  subitems?: unknown[] | null
  notes?: string | null
  needs_review?: boolean
  review_notes?: string | null
  /** Proposed motion for operator template; from agenda wording only. */
  suggested_motion_text?: string | null
}

export type ExtractedAgendaResponse = {
  meeting?: {
    type?: string
    date?: string
    scheduled_public_start?: string | null
    closed_session_start?: string | null
    location_name?: string | null
    location_address?: string | null
    livestream_url?: string | null
    audio_archive_url?: string | null
  }
  sections?: { number: number; title: string; broadcastable?: boolean; start_time?: string | null }[]
  agenda_items: ExtractedAgendaItem[]
}

const AGENDA_TYPES = new Set(['procedural', 'information', 'action', 'recognition'])

export function normalizeAgendaType(raw: string): ExtractedAgendaItem['type'] {
  const t = (raw || 'information').toLowerCase()
  if (AGENDA_TYPES.has(t)) return t as ExtractedAgendaItem['type']
  return 'information'
}

/** Map section number -> title from extraction payload */
export function sectionTitleMap(extracted: ExtractedAgendaResponse): Map<number, string> {
  const m = new Map<number, string>()
  for (const s of extracted.sections || []) {
    m.set(s.number, s.title || '')
  }
  return m
}

export function enrichExtractedItems(extracted: ExtractedAgendaResponse): ExtractedAgendaItem[] {
  const secTitles = sectionTitleMap(extracted)
  const items = extracted.agenda_items || []
  return items.map((it, idx) => {
    const section_title = secTitles.get(it.section_number) || `Section ${it.section_number}`
    return {
      ...it,
      section_title,
      sort_order: typeof it.sort_order === 'number' ? it.sort_order : idx + 1,
      type: normalizeAgendaType(String(it.type)),
      action_requested: !!it.action_requested,
      is_broadcastable: it.is_broadcastable !== false,
      needs_review: !!it.needs_review,
      notes: it.notes ?? null,
      suggested_motion_text:
        typeof it.suggested_motion_text === 'string' && it.suggested_motion_text.trim()
          ? it.suggested_motion_text.trim()
          : null,
    }
  })
}

export function agendaItemKey(section: number, itemNum: string): string {
  return `${section}:${itemNum.trim()}`
}
