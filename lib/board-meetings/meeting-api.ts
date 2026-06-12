import type { SupabaseClient } from '@supabase/supabase-js'

export type BoardMeetingRow = {
  id: string
  production_id: string
  scheduled_public_start: string | null
  closed_session_start: string | null
  broadcast_status: string
  agenda_extracted_at: string | null
  agenda_locked: boolean
  agenda_locked_at: string | null
  agenda_locked_by: string | null
  icompass_meeting_id: string | null
  created_at: string
  updated_at: string
}

export type AgendaItemBundle = {
  id: string
  board_meeting_id: string
  section_number: number
  section_title: string
  item_number: string
  sort_order: number
  title: string
  original_title: string | null
  type: string
  action_requested: boolean
  is_broadcastable: boolean
  consent_block: string | null
  notes: string | null
  subitems: unknown
  needs_review: boolean
  review_notes: string | null
  presenters: {
    id: string
    agenda_item_id: string
    person_id: string | null
    name: string
    title: string | null
    sort_order: number
  }[]
  documents: {
    id: string
    agenda_item_id: string
    title: string
    filename: string
    source_url: string | null
    storage_path: string | null
    sort_order: number
  }[]
}

export type BoardMeetingProductionCheck =
  | { error: string; status?: number }
  | { productionId: string }

/** Resolved production UUID + board meeting row for control/motion routes. */
export type BoardMeetingRouteContext = {
  productionId: string
  boardMeetingId: string
  title: string
}

const BOARD_MEETING_REQUEST_TYPE = 4

/**
 * Resolves a route param (production UUID or production number) to a board meeting.
 */
export async function resolveBoardMeetingRouteContext(
  service: SupabaseClient,
  routeProductionId: string,
): Promise<BoardMeetingRouteContext | null> {
  const prod = await lookupBoardMeetingProduction(service, routeProductionId)
  if (!prod) return null

  const { data: bm, error: bmError } = await service
    .from('board_meetings')
    .select('id, production_id')
    .eq('production_id', prod.id)
    .maybeSingle()

  if (bmError || !bm) return null

  return {
    productionId: bm.production_id,
    boardMeetingId: bm.id,
    title: prod.title,
  }
}

async function lookupBoardMeetingProduction(
  service: SupabaseClient,
  routeProductionId: string,
): Promise<{ id: string; title: string } | null> {
  const { data: byId, error: byIdError } = await service
    .from('productions')
    .select('id, title, request_type_number')
    .eq('id', routeProductionId)
    .maybeSingle()

  if (!byIdError && byId?.request_type_number === BOARD_MEETING_REQUEST_TYPE) {
    return { id: byId.id, title: byId.title || 'Board Meeting' }
  }

  if (/^\d+$/.test(routeProductionId)) {
    const { data: byNumber, error: byNumberError } = await service
      .from('productions')
      .select('id, title, request_type_number')
      .eq('production_number', Number(routeProductionId))
      .maybeSingle()

    if (!byNumberError && byNumber?.request_type_number === BOARD_MEETING_REQUEST_TYPE) {
      return { id: byNumber.id, title: byNumber.title || 'Board Meeting' }
    }
  }

  return null
}

export async function assertBoardMeetingProduction(
  service: SupabaseClient,
  productionId: string,
): Promise<BoardMeetingProductionCheck> {
  const { data, error } = await service
    .from('productions')
    .select('id, request_type_number')
    .eq('id', productionId)
    .maybeSingle()
  if (error || !data) return { error: 'Production not found', status: 404 }
  if (data.request_type_number !== 4) return { error: 'Not a board meeting production', status: 400 }
  return { productionId: data.id }
}

export async function loadBoardMeetingBundle(
  service: SupabaseClient,
  productionId: string,
): Promise<{ board_meeting: BoardMeetingRow | null; items: AgendaItemBundle[] }> {
  const { data: bm } = await service
    .from('board_meetings')
    .select('*')
    .eq('production_id', productionId)
    .maybeSingle()

  if (!bm) return { board_meeting: null, items: [] }

  const { data: itemRows } = await service
    .from('board_meeting_agenda_items')
    .select('*')
    .eq('board_meeting_id', bm.id)
    .order('sort_order', { ascending: true })

  const items = itemRows || []
  if (items.length === 0) {
    return { board_meeting: bm as BoardMeetingRow, items: [] }
  }

  const ids = items.map(i => i.id)
  const [{ data: allPres }, { data: allDocs }] = await Promise.all([
    service.from('board_meeting_presenters').select('*').in('agenda_item_id', ids),
    service.from('board_meeting_agenda_documents').select('*').in('agenda_item_id', ids),
  ])

  const presByItem = new Map<string, typeof allPres>()
  for (const p of allPres || []) {
    const list = presByItem.get(p.agenda_item_id) || []
    list.push(p)
    presByItem.set(p.agenda_item_id, list)
  }
  const docsByItem = new Map<string, typeof allDocs>()
  for (const d of allDocs || []) {
    const list = docsByItem.get(d.agenda_item_id) || []
    list.push(d)
    docsByItem.set(d.agenda_item_id, list)
  }

  const bundles: AgendaItemBundle[] = items.map(i => ({
    ...i,
    presenters: (presByItem.get(i.id) || []).sort((a, b) => a.sort_order - b.sort_order),
    documents: (docsByItem.get(i.id) || []).sort((a, b) => a.sort_order - b.sort_order),
  }))

  return { board_meeting: bm as BoardMeetingRow, items: bundles }
}

export async function callExtractAgendaEdge(pdfBase64: string): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Missing Supabase configuration')

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 90_000)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${anon}`,
  }
  const invokeSecret = process.env.EXTRACT_AGENDA_INVOKE_SECRET?.trim()
  if (invokeSecret) headers['x-extract-agenda-secret'] = invokeSecret

  try {
    const res = await fetch(`${url}/functions/v1/extract-agenda`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pdf_base64: pdfBase64 }),
      signal: controller.signal,
    })
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = { error: text.slice(0, 200) }
    }
    if (!res.ok) {
      const errMsg = typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Extraction failed (${res.status})`
      throw new Error(errMsg)
    }
    return body
  } finally {
    clearTimeout(t)
  }
}

export function parseExtractedAgenda(body: unknown): import('@/lib/board-meetings/extraction').ExtractedAgendaResponse {
  if (!body || typeof body !== 'object') throw new Error('Invalid extraction response')
  const o = body as Record<string, unknown>
  if (!Array.isArray(o.agenda_items)) throw new Error('Extraction missing agenda_items')
  return body as import('@/lib/board-meetings/extraction').ExtractedAgendaResponse
}
