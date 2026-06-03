import type { SupabaseClient } from '@supabase/supabase-js'
import { getSiteBaseUrl } from '@/lib/board-meetings/time-format'
import { ensureBroadcastState, logMeetingEvent } from '@/lib/board-meetings/broadcast-control'

import { BUILTIN_QR_PRESET_KEYS, templateUsesAgendaUrl } from '@/lib/board-meetings/qr-presets'

const BUILTIN_KEYS = BUILTIN_QR_PRESET_KEYS
const DEFAULT_QR_DURATION = 12

export type QrStateFields = {
  active_qr_url: string | null
  active_qr_label: string | null
  active_qr_started_at: string | null
  active_qr_duration_seconds: number | null
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function getActiveQrRemainingSeconds(state: Pick<QrStateFields, 'active_qr_started_at' | 'active_qr_duration_seconds'>): number {
  if (!state.active_qr_started_at || !state.active_qr_duration_seconds) return 0
  const end = new Date(state.active_qr_started_at).getTime() + state.active_qr_duration_seconds * 1000
  return Math.max(0, Math.floor((end - Date.now()) / 1000))
}

export function isQrActive(state: QrStateFields): boolean {
  if (!state.active_qr_url || !state.active_qr_started_at) return false
  return getActiveQrRemainingSeconds(state) > 0
}

function applyQrUrlTemplate(
  template: string,
  vars: { production_number: string; youtube_url: string; agenda_url: string },
): string {
  let url = template
  for (const [key, value] of Object.entries(vars)) {
    url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return url
}

export async function resolvePresetQrUrl(
  service: SupabaseClient,
  boardMeetingId: string,
  productionId: string,
  presetKey: string,
): Promise<{ url: string; label: string }> {
  const { data: preset } = await service.from('qr_presets').select('*').eq('key', presetKey).maybeSingle()
  if (!preset) throw new Error('Preset not found')

  const [{ data: prod }, { data: bm }] = await Promise.all([
    service
      .from('productions')
      .select('production_number, livestream_url, title')
      .eq('id', productionId)
      .maybeSingle(),
    service
      .from('board_meetings')
      .select('public_agenda_url')
      .eq('id', boardMeetingId)
      .maybeSingle(),
  ])

  const templateVars = {
    production_number: String(prod?.production_number ?? ''),
    youtube_url: (prod?.livestream_url || '').trim(),
    agenda_url: (bm?.public_agenda_url || '').trim(),
  }

  if (presetKey === 'agenda') {
    if (!templateVars.agenda_url) {
      throw new Error('Set the public agenda URL on the Board Meeting tab before pushing this QR')
    }
    if (!isValidHttpUrl(templateVars.agenda_url)) {
      throw new Error('Public agenda URL is invalid')
    }
    return { url: templateVars.agenda_url, label: preset.label }
  }

  if (presetKey === 'document_current_item') {
    const { data: bstate } = await service
      .from('meeting_broadcast_state')
      .select('current_agenda_item_id')
      .eq('board_meeting_id', boardMeetingId)
      .maybeSingle()
    if (!bstate?.current_agenda_item_id) throw new Error('No current agenda item')
    const { data: doc } = await service
      .from('board_meeting_agenda_documents')
      .select('source_url, title')
      .eq('agenda_item_id', bstate.current_agenda_item_id)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!doc?.source_url) throw new Error('Current item has no document URL')
    return { url: doc.source_url, label: preset.label }
  }

  if (presetKey === 'youtube_live') {
    const yt = (prod?.livestream_url || '').trim()
    if (!yt) throw new Error('Meeting has no YouTube/livestream URL')
    return { url: yt, label: preset.label }
  }

  if (preset.url_template) {
    if (templateUsesAgendaUrl(preset.url_template) && !templateVars.agenda_url) {
      throw new Error('This preset needs a public agenda URL — set it on the Board Meeting tab')
    }
    const url = applyQrUrlTemplate(preset.url_template, templateVars)
    if (!isValidHttpUrl(url)) {
      throw new Error('Preset URL could not be resolved to a valid link')
    }
    return { url, label: preset.label }
  }

  throw new Error('Preset URL could not be resolved')
}

export async function pushQr(
  service: SupabaseClient,
  boardMeetingId: string,
  productionId: string,
  operatorId: string,
  opts: {
    preset_key?: string
    custom_url?: string
    custom_label?: string
    duration_seconds?: number
  },
) {
  let url: string
  let label: string

  if (opts.preset_key) {
    const resolved = await resolvePresetQrUrl(service, boardMeetingId, productionId, opts.preset_key)
    url = resolved.url
    label = opts.custom_label || resolved.label
  } else if (opts.custom_url) {
    if (!isValidHttpUrl(opts.custom_url)) throw new Error('Invalid URL')
    url = opts.custom_url
    label = opts.custom_label || 'Scan for more'
  } else {
    throw new Error('preset_key or custom_url required')
  }

  const duration = opts.duration_seconds ?? DEFAULT_QR_DURATION
  await ensureBroadcastState(service, boardMeetingId, operatorId)

  await service
    .from('meeting_broadcast_state')
    .update({
      active_qr_url: url,
      active_qr_label: label,
      active_qr_started_at: new Date().toISOString(),
      active_qr_duration_seconds: duration,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, 'qr_pushed', operatorId, {
    url,
    label,
    duration_seconds: duration,
    preset_key: opts.preset_key ?? null,
  })
}

export async function extendQr(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  additionalSeconds: number,
) {
  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('active_qr_duration_seconds, active_qr_url')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()
  if (!state?.active_qr_url) throw new Error('No active QR')
  const next = (state.active_qr_duration_seconds || DEFAULT_QR_DURATION) + additionalSeconds
  await service
    .from('meeting_broadcast_state')
    .update({
      active_qr_duration_seconds: next,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)
}

export async function dismissQr(service: SupabaseClient, boardMeetingId: string, operatorId: string) {
  await service
    .from('meeting_broadcast_state')
    .update({
      active_qr_url: null,
      active_qr_label: null,
      active_qr_started_at: null,
      active_qr_duration_seconds: null,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)
  await logMeetingEvent(service, boardMeetingId, 'qr_dismissed', operatorId)
}

/** Drop stale QR fields once the timer has elapsed (idempotent). */
export async function clearExpiredQrIfNeeded(
  service: SupabaseClient,
  boardMeetingId: string,
  state: QrStateFields,
): Promise<boolean> {
  if (!state.active_qr_url || isQrActive(state)) return false
  await service
    .from('meeting_broadcast_state')
    .update({
      active_qr_url: null,
      active_qr_label: null,
      active_qr_started_at: null,
      active_qr_duration_seconds: null,
      updated_at: new Date().toISOString(),
    })
    .eq('board_meeting_id', boardMeetingId)
  return true
}

export { BUILTIN_KEYS, DEFAULT_QR_DURATION, getSiteBaseUrl }
