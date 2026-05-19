<<<<<<< HEAD
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildControlSurfaceBundle } from '@/lib/board-meetings/control-bundle'
import { isEligibleToVote } from '@/lib/board-meetings/attendance-control'
import type { AttendanceStatus } from '@/lib/board-meetings/motion-types'
import {
  cancelMotionThread as cancelMotionThreadControl,
  confirmOpenDiscussion,
  dismissVoteResult,
  holdVoteResult,
  listMotionsEnriched,
  openMotion as insertMotion,
  openVote,
  pushVoteResult,
  recordMotionVote,
  setMotionVoteType,
  tableMotion,
  updateMotion,
  withdrawMotion,
  computeTally,
  getVoteResultRemainingSeconds,
} from '@/lib/board-meetings/motion-control'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  ActiveMotion,
  ControlAgendaItem,
  MotionScreenBundle,
  VoteRecord,
  VotingMember,
} from '@/lib/board-meetings/types'
import type { EnrichedMotion, VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import type { MotionRouteContext } from '@/lib/board-meetings/motion-route'

const VOTE_RESULT_SECONDS = 8

export type MotionWriteContext = Pick<
  MotionRouteContext,
  'service' | 'boardMeetingId' | 'productionId' | 'teamUserId'
>

function enrichActiveMotion(
  motion: ActiveMotion | null,
  rows: EnrichedMotion[],
): ActiveMotion | null {
  if (!motion) return null
  const row = rows.find(m => m.id === motion.id)
  if (!row) return motion
  return {
    ...motion,
    result: row.result,
    tally_yea: row.tally.yea,
    tally_nay: row.tally.nay,
    tally_abstain: row.tally.abstain,
    vote_type: (row.vote_mode || motion.vote_type) as ActiveMotion['vote_type'],
    status: row.status,
    text: row.motion_text,
    mover_id: row.moved_by_person_id,
    mover_name: row.moved_by?.display_name ?? null,
    seconder_id: row.seconded_by_person_id,
    seconder_name: row.seconded_by?.display_name ?? null,
  }
}

function formatLiveElapsed(liveStartedAt: string | null | undefined): string | null {
  if (!liveStartedAt) return null
  const ms = Date.now() - new Date(liveStartedAt).getTime()
  if (ms < 0) return null
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildSuggestedMotionText(
  currentItem: MotionScreenBundle['current_agenda_item'],
  agendaItems: ControlAgendaItem[],
): string | null {
  if (!currentItem) return null
  if (currentItem.consent_block) {
    const blockItems = agendaItems.filter(i => i.consent_block === currentItem.consent_block)
    if (blockItems.length > 1) {
      const first = blockItems[0].item_number
      const last = blockItems[blockItems.length - 1].item_number
      return `Move to approve the Consent Agenda items ${first} through ${last}`
    }
  }
  if (currentItem.action_requested || currentItem.type === 'action') {
    return `Move to approve ${currentItem.title}`
  }
  return `Move to approve ${currentItem.title}`
}

function buildVotesMap(
  motion: EnrichedMotion | undefined,
  attendanceRecords: {
    person_id: string
    status: string
    arrived_at?: string | null
    left_at?: string | null
  }[],
  voteMode: VoteMode | null,
): Record<string, VoteRecord> {
  const map: Record<string, VoteRecord> = {}
  const attendanceByPerson = new Map(attendanceRecords.map(r => [r.person_id, r.status]))
  const recorded = new Set<string>()

  for (const v of motion?.votes ?? []) {
    recorded.add(v.person_id)
    map[v.person_id] = {
      vote: v.vote,
      attendance: attendanceByPerson.get(v.person_id),
    }
  }

  const at = new Date()
  for (const r of attendanceRecords) {
    if (r.status === 'absent') {
      if (!map[r.person_id]) {
        map[r.person_id] = { vote: 'absent', attendance: 'absent' }
      }
      continue
    }
    if (
      voteMode === 'voice' &&
      !recorded.has(r.person_id) &&
      isEligibleToVote(r.status as AttendanceStatus, at, r.arrived_at ?? null, r.left_at ?? null)
    ) {
      map[r.person_id] = { vote: 'yea', attendance: r.status }
    }
  }

  return map
}

function computeDisplayTally(
  motion: EnrichedMotion | undefined,
  votes: Record<string, VoteRecord>,
  voteMode: VoteMode | null,
): { yea: number; nay: number; abstain: number; absent: number } {
  if (motion && (motion.status === 'voting' || motion.status === 'passed' || motion.status === 'failed')) {
    const tally = computeTally(
      Object.entries(votes).map(([, v]) => ({ vote: (v.vote || 'yea') as VoteValue })),
    )
    return { yea: tally.yea, nay: tally.nay, abstain: tally.abstain, absent: tally.absent }
  }
  if (voteMode === 'voice') {
    let yea = 0
    let nay = 0
    let abstain = 0
    let absent = 0
    for (const v of Object.values(votes)) {
      const vote = v.vote || 'yea'
      if (vote === 'yea') yea++
      else if (vote === 'nay') nay++
      else if (vote === 'abstain') abstain++
      else if (vote === 'absent') absent++
    }
    return { yea, nay, abstain, absent }
  }
  return { yea: 0, nay: 0, abstain: 0, absent: 0 }
}

async function loadVotingMembers(
  service: SupabaseClient,
  attendanceRecords: { person_id: string; name: string; status: string }[],
): Promise<VotingMember[]> {
  const { data: people } = await service
    .from('lower_third_people')
    .select('id, display_name, affiliation, officer_position')
    .eq('category', 'board_member')
    .eq('is_active', true)

  const meta = new Map(
    (people || []).map(p => [
      p.id,
      {
        display_name: p.display_name as string,
        district: (p.affiliation as string | null) ?? null,
        officer_position: (p.officer_position as string | null) ?? null,
      },
    ]),
  )

  return attendanceRecords.map(r => {
    const p = meta.get(r.person_id)
    return {
      id: r.person_id,
      display_name: p?.display_name ?? r.name,
      district: p?.district ?? null,
      officer_position: p?.officer_position ?? null,
    }
  })
}

export async function loadMotionScreenBundle(
  productionId: string,
  serviceClient?: SupabaseClient,
): Promise<MotionScreenBundle | null> {
  const service = serviceClient ?? createServiceClient()
  if (!service) return null

  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) return null

  const resolvedId = prodCheck.productionId
  const built = await buildControlSurfaceBundle(service, resolvedId)
  if (!built) return null

  const surface = built.bundle
  const motions = built.motions
  const attendance = surface.attendance
  if (!attendance) return null

  const lifecycle = surface.motion_lifecycle
  const agendaItems = surface.agenda_items || []

  const currentAgendaItemId = surface.broadcast_state?.current_agenda_item_id ?? null
  const currentItem = currentAgendaItemId
    ? agendaItems.find(i => i.id === currentAgendaItemId) ?? null
    : null
  const consentItems = currentItem?.consent_block
    ? agendaItems.filter(i => i.consent_block === currentItem.consent_block)
    : []
  const consentRange =
    consentItems.length > 1
      ? `${consentItems[0].item_number} – ${consentItems[consentItems.length - 1].item_number}`
      : null

  const status = surface.broadcast_state?.status ?? surface.board_meeting.broadcast_status
  const canControl =
    surface.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'

  let active_motion = enrichActiveMotion(lifecycle?.active_motion ?? null, motions)
  if (active_motion && lifecycle?.state === 'drafting') {
    active_motion = { ...active_motion, status: 'drafting' }
  }

  const activeRow = active_motion ? motions.find(m => m.id === active_motion!.id) : undefined
  const voteMode = (activeRow?.vote_mode ?? 'voice') as VoteMode
  const voting_members = await loadVotingMembers(service, attendance.records)
  const attendanceForVotes = attendance.records.map(r => ({
    person_id: r.person_id,
    status: r.status,
    arrived_at: r.arrived_at,
    left_at: r.left_at,
  }))
  const votes = buildVotesMap(activeRow, attendanceForVotes, activeRow ? voteMode : null)
  const tally = computeDisplayTally(activeRow, votes, activeRow ? voteMode : null)

  return {
    meeting: {
      id: surface.board_meeting.id,
      production_id: resolvedId,
      title: surface.meeting?.title ?? null,
      broadcast_status: status,
      agenda_locked: surface.board_meeting.agenda_locked,
    },
    active_motion,
    parent_motion: enrichActiveMotion(lifecycle?.parent_motion ?? null, motions),
    lifecycle_state: lifecycle?.state ?? 'no_motion',
    current_agenda_item: currentItem,
    current_agenda_item_id: currentItem?.id ?? null,
    suggested_motion_text: buildSuggestedMotionText(currentItem, agendaItems),
    live_elapsed: status === 'live' ? formatLiveElapsed(surface.broadcast_state?.live_started_at) : null,
    voting_members,
    votes,
    tally,
    quorum_size: attendance.quorum.threshold,
    consent_is_lead: !!(currentItem?.consent_block && consentItems[0]?.id === currentItem.id),
    consent_range: consentRange,
    attendance: attendance.records.map(r => ({
      person_id: r.person_id,
      name: r.name,
      status: r.status,
    })),
    can_control: canControl,
    is_live: status === 'live',
    result_on_overlay: surface.result_overlay?.active ?? false,
  }
}

async function loadAgendaItem(
  service: SupabaseClient,
  boardMeetingId: string,
  agendaItemId: string,
) {
  const { data } = await service
    .from('board_meeting_agenda_items')
    .select('id, title, item_number, consent_block, action_requested, type')
    .eq('board_meeting_id', boardMeetingId)
    .eq('id', agendaItemId)
    .maybeSingle()
  return data
}

export async function openMotion(
  ctx: MotionWriteContext,
  input: { agenda_item_id: string; mover_id?: string | null },
): Promise<{ motion_id: string }> {
  const item = await loadAgendaItem(ctx.service, ctx.boardMeetingId, input.agenda_item_id)
  if (!item) throw new Error('Agenda item not found')

  const { data: allItems } = await ctx.service
    .from('board_meeting_agenda_items')
    .select('id, item_number, title, consent_block, action_requested, type')
    .eq('board_meeting_id', ctx.boardMeetingId)
    .order('sort_order', { ascending: true })

  const motionText =
    buildSuggestedMotionText(
      {
        id: item.id,
        item_number: item.item_number ?? '',
        title: item.title,
        consent_block: item.consent_block,
        type: item.type,
        action_requested: item.action_requested,
        section_number: 0,
        section_title: '',
        is_broadcastable: true,
      },
      (allItems || []).map(i => ({
        id: i.id,
        item_number: i.item_number,
        title: i.title,
        consent_block: i.consent_block,
        type: i.type,
        action_requested: i.action_requested,
        section_number: 0,
        section_title: '',
        is_broadcastable: true,
      })),
    ) || `Move to approve ${item.title}`

  const motion = await insertMotion(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: input.agenda_item_id,
    consent_block: item.consent_block ?? null,
    motion_type: 'main',
    motion_text: motionText,
    moved_by_person_id: input.mover_id ?? null,
    seconded_by_person_id: null,
  })

  return { motion_id: motion.id }
}

export async function setMotionMover(
  ctx: MotionWriteContext,
  motionId: string,
  personId: string | null,
): Promise<void> {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    moved_by_person_id: personId,
  })
}

export async function setMotionSeconder(
  ctx: MotionWriteContext,
  motionId: string,
  personId: string | null,
): Promise<void> {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    seconded_by_person_id: personId,
  })
}

export async function setMotionText(
  ctx: MotionWriteContext,
  motionId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Motion text is required')
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    motion_text: trimmed,
  })
}

export async function setMotionVoteTypeApi(
  ctx: MotionWriteContext,
  motionId: string,
  voteType: VoteMode,
): Promise<void> {
  if (voteType !== 'voice' && voteType !== 'roll_call') {
    throw new Error('vote_type must be voice or roll_call')
  }
  await setMotionVoteType(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, voteType)
}

export async function openMotionDiscussion(
  ctx: MotionWriteContext,
  motionId: string,
): Promise<void> {
  await confirmOpenDiscussion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)
}

export async function openMotionVote(
  ctx: MotionWriteContext,
  motionId: string,
): Promise<void> {
  const motion = await ctx.service
    .from('meeting_motions')
    .select('vote_mode')
    .eq('id', motionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
    .maybeSingle()
  const voteMode = (motion.data?.vote_mode as VoteMode | null) || 'voice'
  await openVote(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, voteMode)
}

export async function recordVote(
  ctx: MotionWriteContext,
  motionId: string,
  personId: string,
  vote: VoteValue,
): Promise<void> {
  await recordMotionVote(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, personId, vote)
}

export async function pushResult(
  ctx: MotionWriteContext,
  motionId: string,
): Promise<{ result: 'passed' | 'failed'; overlay_active_until: string }> {
  await pushVoteResult(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, VOTE_RESULT_SECONDS)

  const { data: motion } = await ctx.service
    .from('meeting_motions')
    .select('result')
    .eq('id', motionId)
    .maybeSingle()

  const result = (motion?.result === 'passed' ? 'passed' : 'failed') as 'passed' | 'failed'
  const overlay_active_until = new Date(Date.now() + VOTE_RESULT_SECONDS * 1000).toISOString()
  return { result, overlay_active_until }
}

export async function withdrawMotionApi(ctx: MotionWriteContext, motionId: string): Promise<void> {
  const { data: motion } = await ctx.service
    .from('meeting_motions')
    .select('motion_type, parent_motion_id, status')
    .eq('id', motionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
=======
import { createClient } from '@supabase/supabase-js'
import type { MotionScreenBundle, ActiveMotion, VotingMember, VoteRecord, AgendaItem } from './motion-types'

/**
 * Centralized service-role Supabase client for motion operations.
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env.
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase service config')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

function initials(name: string): string {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function suggestedTextForItem(item: AgendaItem | null): string {
  if (!item) return ''
  const title = item.title
  if (item.type === 'action' || /approval of|approve /i.test(title)) {
    if (/^approval of /i.test(title)) {
      return `Move to approve ${title.replace(/^approval of /i, '')}`
    }
    return `Move to ${title.replace(/^approve /i, 'approve ').toLowerCase()}`
  }
  return `Move to approve ${title}`
}

/**
 * Loads the full bundle the motion screen needs.
 */
export async function loadMotionScreenBundle(productionId: string): Promise<MotionScreenBundle | null> {
  const supabase = getServiceClient()

  const { data: meeting } = await supabase
    .from('board_meetings')
    .select('id, production_id, title, quorum_size')
    .eq('production_id', productionId)
    .maybeSingle()

  if (!meeting) return null
  const meetingId: string = meeting.id

  const { data: state } = await supabase
    .from('meeting_broadcast_state')
    .select('current_agenda_item_id, status, live_started_at')
    .eq('board_meeting_id', meetingId)
    .maybeSingle()

  let currentItem: AgendaItem | null = null
  if (state?.current_agenda_item_id) {
    const { data: ai } = await supabase
      .from('board_meeting_agenda_items')
      .select('id, item_number, title, type')
      .eq('id', state.current_agenda_item_id)
      .maybeSingle()
    if (ai) currentItem = { id: ai.id, item_number: ai.item_number, title: ai.title, type: ai.type }
  }

  const { data: motions } = await supabase
    .from('meeting_motions')
    .select('*')
    .eq('board_meeting_id', meetingId)
    .not('status', 'in', '(closed,replaced,withdrawn,voted)')
    .order('created_at', { ascending: false })

  const openMotions = (motions || [])
  const substitute = openMotions.find(m => m.motion_type === 'substitute') || null
  const mainOpen = openMotions.find(m => m.motion_type === 'main') || null

  let active: ActiveMotion | null = null
  let parent: ActiveMotion | null = null
  if (substitute && mainOpen) {
    active = await hydrateMotion(supabase, substitute)
    parent = await hydrateMotion(supabase, mainOpen)
  } else if (substitute) {
    active = await hydrateMotion(supabase, substitute)
  } else if (mainOpen) {
    active = await hydrateMotion(supabase, mainOpen)
  }

  const { data: peopleRows } = await supabase
    .from('lower_third_people')
    .select('id, display_name, district, officer_position, category')
    .eq('category', 'board_member')
    .order('display_name', { ascending: true })

  const { data: attendanceRows } = await supabase
    .from('meeting_attendance')
    .select('person_id, status')
    .eq('board_meeting_id', meetingId)

  const attendanceByPerson = new Map<string, string>()
  for (const a of (attendanceRows || [])) {
    attendanceByPerson.set(a.person_id, a.status)
  }

  const voting_members: VotingMember[] = (peopleRows || []).map(p => ({
    id: p.id,
    display_name: p.display_name,
    district: p.district || null,
    officer_position: p.officer_position || null,
    initials: initials(p.display_name),
  }))

  const votes: Record<string, VoteRecord> = {}
  if (active) {
    const { data: voteRows } = await supabase
      .from('meeting_motion_votes')
      .select('person_id, vote, recorded_at')
      .eq('motion_id', active.id)
      .is('superseded_by_vote_id', null)

    for (const v of (voteRows || [])) {
      const attendance = (attendanceByPerson.get(v.person_id) === 'absent' ? 'absent' : 'present') as 'absent' | 'present'
      votes[v.person_id] = {
        vote: v.vote,
        attendance,
        recorded_at: v.recorded_at,
      }
    }

    for (const m of voting_members) {
      if (!votes[m.id]) {
        const att = (attendanceByPerson.get(m.id) === 'absent' ? 'absent' : 'present') as 'absent' | 'present'
        const defaultVote: 'yea' | 'absent' = att === 'absent' ? 'absent' : 'yea'
        votes[m.id] = { vote: defaultVote, attendance: att, recorded_at: null }
      }
    }
  } else {
    for (const m of voting_members) {
      const att = (attendanceByPerson.get(m.id) === 'absent' ? 'absent' : 'present') as 'absent' | 'present'
      votes[m.id] = { vote: att === 'absent' ? 'absent' : 'yea', attendance: att, recorded_at: null }
    }
  }

  const tally = { yea: 0, nay: 0, abstain: 0, absent: 0 }
  for (const m of voting_members) {
    const v = votes[m.id]?.vote || 'yea'
    if (v === 'yea') tally.yea++
    else if (v === 'nay') tally.nay++
    else if (v === 'abstain') tally.abstain++
    else if (v === 'absent') tally.absent++
  }

  const liveElapsed = state?.status === 'live' && state.live_started_at
    ? formatElapsed(Date.now() - new Date(state.live_started_at).getTime())
    : null

  return {
    meeting: { id: meeting.id, production_id: meeting.production_id, title: meeting.title },
    current_agenda_item: currentItem,
    current_agenda_item_id: state?.current_agenda_item_id || null,
    active_motion: active,
    parent_motion: parent,
    voting_members,
    votes,
    tally,
    quorum_size: meeting.quorum_size || 4,
    suggested_motion_text: suggestedTextForItem(currentItem),
    live_elapsed: liveElapsed,
  }
}

async function hydrateMotion(supabase: ReturnType<typeof getServiceClient>, row: Record<string, unknown>): Promise<ActiveMotion> {
  const moverId = row.mover_id as string | null
  const seconderId = row.seconder_id as string | null
  let moverName: string | null = null
  let seconderName: string | null = null

  const ids: string[] = []
  if (moverId) ids.push(moverId)
  if (seconderId) ids.push(seconderId)
  if (ids.length > 0) {
    const { data } = await supabase
      .from('lower_third_people')
      .select('id, display_name')
      .in('id', ids)
    for (const p of (data || [])) {
      if (p.id === moverId) moverName = p.display_name
      if (p.id === seconderId) seconderName = p.display_name
    }
  }

  return {
    id: row.id as string,
    motion_type: row.motion_type as 'main' | 'substitute' | 'amendment',
    text: (row.text as string) || null,
    agenda_item_id: (row.agenda_item_id as string) || null,
    mover_id: moverId,
    mover_name: moverName,
    seconder_id: seconderId,
    seconder_name: seconderName,
    vote_type: (row.vote_type as 'voice' | 'roll_call') || 'voice',
    status: row.status as string,
    parent_motion_id: (row.parent_motion_id as string) || null,
    created_at: row.created_at as string,
  }
}

export async function getMeetingIdForProduction(productionId: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('board_meetings')
    .select('id')
    .eq('production_id', productionId)
    .maybeSingle()
  return data?.id || null
}

export async function logEvent(meetingId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const supabase = getServiceClient()
  await supabase.from('meeting_event_log').insert({
    board_meeting_id: meetingId,
    event_type: eventType,
    payload,
  })
}

export async function openMotion(productionId: string, agendaItemId: string, moverPersonId: string | null) {
  const supabase = getServiceClient()
  const meetingId = await getMeetingIdForProduction(productionId)
  if (!meetingId) throw new Error('Meeting not found')

  const { data: item } = await supabase
    .from('board_meeting_agenda_items')
    .select('title, type')
    .eq('id', agendaItemId)
    .maybeSingle()

  const suggestedText = suggestedTextForItem({
    id: agendaItemId,
    item_number: '',
    title: item?.title || '',
    type: item?.type || null,
  })

  const { data: motion, error } = await supabase
    .from('meeting_motions')
    .insert({
      board_meeting_id: meetingId,
      agenda_item_id: agendaItemId,
      motion_type: 'main',
      status: 'drafting',
      text: suggestedText,
      mover_id: moverPersonId,
      vote_type: 'voice',
    })
    .select()
    .single()

  if (error) throw error
  await logEvent(meetingId, 'motion_opened', { motion_id: motion.id, agenda_item_id: agendaItemId })
  return { motion_id: motion.id }
}

export async function setMover(motionId: string, personId: string | null) {
  const supabase = getServiceClient()
  await supabase.from('meeting_motions').update({ mover_id: personId, updated_at: new Date().toISOString() }).eq('id', motionId)
}

export async function setSeconder(motionId: string, personId: string | null) {
  const supabase = getServiceClient()
  await supabase.from('meeting_motions').update({ seconder_id: personId, updated_at: new Date().toISOString() }).eq('id', motionId)
}

export async function setText(motionId: string, text: string) {
  const supabase = getServiceClient()
  await supabase.from('meeting_motions').update({ text, updated_at: new Date().toISOString() }).eq('id', motionId)
}

export async function setVoteType(motionId: string, voteType: 'voice' | 'roll_call') {
  const supabase = getServiceClient()
  await supabase.from('meeting_motions').update({ vote_type: voteType, updated_at: new Date().toISOString() }).eq('id', motionId)
}

export async function openDiscussion(motionId: string) {
  const supabase = getServiceClient()
  await supabase.from('meeting_motions').update({ status: 'open_for_discussion', updated_at: new Date().toISOString() }).eq('id', motionId)
}

export async function openVote(motionId: string) {
  const supabase = getServiceClient()

  const { data: motion } = await supabase
    .from('meeting_motions')
    .select('id, board_meeting_id, vote_type')
    .eq('id', motionId)
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
    .maybeSingle()

  if (!motion) throw new Error('Motion not found')

<<<<<<< HEAD
  await withdrawMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)

  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    await ctx.service
      .from('meeting_motions')
      .update({ status: 'open_for_discussion', updated_at: new Date().toISOString() })
      .eq('id', motion.parent_motion_id)
    await ctx.service
      .from('meeting_broadcast_state')
      .update({
        active_motion_id: motion.parent_motion_id,
        updated_at: new Date().toISOString(),
        updated_by: ctx.teamUserId,
      })
      .eq('board_meeting_id', ctx.boardMeetingId)
  }
}

export async function proposeSubstitute(
  ctx: MotionWriteContext,
  parentMotionId: string,
  agendaItemId: string,
): Promise<{ substitute_motion_id: string }> {
  const { data: parent } = await ctx.service
    .from('meeting_motions')
    .select('id, status, motion_text')
    .eq('id', parentMotionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
=======
  await supabase.from('meeting_motions').update({ status: 'voting', updated_at: new Date().toISOString() }).eq('id', motionId)

  if (motion.vote_type === 'voice') {
    const { data: members } = await supabase
      .from('lower_third_people')
      .select('id')
      .eq('category', 'board_member')

    const { data: attendance } = await supabase
      .from('meeting_attendance')
      .select('person_id, status')
      .eq('board_meeting_id', motion.board_meeting_id)

    const absentSet = new Set((attendance || []).filter(a => a.status === 'absent').map(a => a.person_id))

    const inserts = (members || [])
      .filter(m => !absentSet.has(m.id))
      .map(m => ({
        motion_id: motionId,
        person_id: m.id,
        vote: 'yea' as const,
        recorded_at: new Date().toISOString(),
      }))

    if (inserts.length > 0) {
      await supabase.from('meeting_motion_votes').insert(inserts)
    }
  }

  await logEvent(motion.board_meeting_id, 'motion_vote_opened', { motion_id: motionId })
}

export async function recordVote(motionId: string, personId: string, vote: string) {
  const supabase = getServiceClient()
  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('meeting_motion_votes')
    .select('id')
    .eq('motion_id', motionId)
    .eq('person_id', personId)
    .is('superseded_by_vote_id', null)
    .maybeSingle()

  if (existing) {
    const { data: newVote, error: insertErr } = await supabase
      .from('meeting_motion_votes')
      .insert({ motion_id: motionId, person_id: personId, vote, recorded_at: now })
      .select()
      .single()
    if (insertErr) throw insertErr

    await supabase
      .from('meeting_motion_votes')
      .update({ superseded_by_vote_id: newVote.id })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('meeting_motion_votes')
      .insert({ motion_id: motionId, person_id: personId, vote, recorded_at: now })
  }
}

export async function pushResult(motionId: string) {
  const supabase = getServiceClient()

  const { data: motion } = await supabase
    .from('meeting_motions')
    .select('id, board_meeting_id, motion_type, parent_motion_id')
    .eq('id', motionId)
    .maybeSingle()

  if (!motion) throw new Error('Motion not found')

  const { data: voteRows } = await supabase
    .from('meeting_motion_votes')
    .select('vote')
    .eq('motion_id', motionId)
    .is('superseded_by_vote_id', null)

  const tally = { yea: 0, nay: 0, abstain: 0 }
  for (const v of (voteRows || [])) {
    if (v.vote === 'yea') tally.yea++
    else if (v.vote === 'nay') tally.nay++
    else if (v.vote === 'abstain') tally.abstain++
  }

  const passed = tally.yea > tally.nay
  const result = passed ? 'passed' : 'failed'
  const now = new Date().toISOString()

  await supabase.from('meeting_motions').update({
    status: 'voted',
    result,
    yea_count: tally.yea,
    nay_count: tally.nay,
    abstain_count: tally.abstain,
    updated_at: now,
  }).eq('id', motionId)

  await supabase.from('meeting_broadcast_state').update({
    active_vote_result_motion_id: motionId,
    vote_result_started_at: now,
    vote_result_duration_seconds: 8,
    vote_result_held: false,
    updated_at: now,
  }).eq('board_meeting_id', motion.board_meeting_id)

  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    if (passed) {
      await supabase.from('meeting_motions').update({
        status: 'replaced',
        updated_at: now,
      }).eq('id', motion.parent_motion_id)
    } else {
      await supabase.from('meeting_motions').update({
        status: 'open_for_discussion',
        updated_at: now,
      }).eq('id', motion.parent_motion_id)
    }
  }

  await logEvent(motion.board_meeting_id, 'motion_result_pushed', { motion_id: motionId, result, tally })
  return { result, overlay_active_until: new Date(Date.now() + 8000).toISOString() }
}

export async function withdrawMotion(motionId: string) {
  const supabase = getServiceClient()

  const { data: motion } = await supabase
    .from('meeting_motions')
    .select('id, board_meeting_id, motion_type, parent_motion_id')
    .eq('id', motionId)
    .maybeSingle()

  if (!motion) throw new Error('Motion not found')

  await supabase.from('meeting_motions').update({
    status: 'withdrawn',
    updated_at: new Date().toISOString(),
  }).eq('id', motionId)

  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    await supabase.from('meeting_motions').update({
      status: 'open_for_discussion',
      updated_at: new Date().toISOString(),
    }).eq('id', motion.parent_motion_id)
  }

  await logEvent(motion.board_meeting_id, 'motion_withdrawn', { motion_id: motionId })
}

export async function proposeSubstitute(motionId: string, agendaItemId: string) {
  const supabase = getServiceClient()

  const { data: parent } = await supabase
    .from('meeting_motions')
    .select('id, board_meeting_id')
    .eq('id', motionId)
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
    .maybeSingle()

  if (!parent) throw new Error('Parent motion not found')

<<<<<<< HEAD
  if (['voting', 'open_for_discussion'].includes(parent.status)) {
    await tableMotion(ctx.service, ctx.boardMeetingId, parentMotionId, ctx.teamUserId)
  }

  const item = await loadAgendaItem(ctx.service, ctx.boardMeetingId, agendaItemId)
  const motionText = item?.title
    ? `I move to substitute the following motion regarding ${item.title}`
    : 'I move to substitute the following motion'

  const substitute = await insertMotion(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: agendaItemId,
    motion_type: 'substitute',
    parent_motion_id: parentMotionId,
    motion_text: motionText,
    moved_by_person_id: null,
    seconded_by_person_id: null,
  })

  return { substitute_motion_id: substitute.id }
}

export async function cancelMotionThreadApi(ctx: MotionWriteContext): Promise<void> {
  await cancelMotionThreadControl(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export async function holdResult(ctx: MotionWriteContext): Promise<void> {
  await holdVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export async function dismissResult(ctx: MotionWriteContext): Promise<void> {
  await dismissVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export { getVoteResultRemainingSeconds }
=======
  const { data: item } = await supabase
    .from('board_meeting_agenda_items')
    .select('title, type')
    .eq('id', agendaItemId)
    .maybeSingle()

  const suggestedText = suggestedTextForItem({
    id: agendaItemId,
    item_number: '',
    title: item?.title || '',
    type: item?.type || null,
  })

  const { data: substitute, error } = await supabase
    .from('meeting_motions')
    .insert({
      board_meeting_id: parent.board_meeting_id,
      agenda_item_id: agendaItemId,
      motion_type: 'substitute',
      parent_motion_id: parent.id,
      status: 'drafting',
      text: suggestedText,
      vote_type: 'voice',
    })
    .select()
    .single()

  if (error) throw error

  await logEvent(parent.board_meeting_id, 'substitute_proposed', { motion_id: motionId, substitute_motion_id: substitute.id })
  return { substitute_motion_id: substitute.id }
}

export async function cancelThread(motionId: string) {
  const supabase = getServiceClient()
  const now = new Date().toISOString()

  const { data: motion } = await supabase
    .from('meeting_motions')
    .select('id, board_meeting_id, parent_motion_id, motion_type')
    .eq('id', motionId)
    .maybeSingle()

  if (!motion) throw new Error('Motion not found')

  await supabase.from('meeting_motions').update({ status: 'closed', updated_at: now }).eq('id', motionId)

  if (motion.parent_motion_id) {
    await supabase.from('meeting_motions').update({ status: 'closed', updated_at: now }).eq('id', motion.parent_motion_id)
  }

  await logEvent(motion.board_meeting_id, 'motion_thread_cancelled', { motion_id: motionId })
}

export async function holdResult(productionId: string) {
  const supabase = getServiceClient()
  const meetingId = await getMeetingIdForProduction(productionId)
  if (!meetingId) throw new Error('Meeting not found')
  await supabase.from('meeting_broadcast_state').update({
    vote_result_held: true,
    updated_at: new Date().toISOString(),
  }).eq('board_meeting_id', meetingId)
  await logEvent(meetingId, 'result_held', {})
}

export async function dismissResult(productionId: string) {
  const supabase = getServiceClient()
  const meetingId = await getMeetingIdForProduction(productionId)
  if (!meetingId) throw new Error('Meeting not found')
  await supabase.from('meeting_broadcast_state').update({
    active_vote_result_motion_id: null,
    vote_result_started_at: null,
    vote_result_duration_seconds: null,
    vote_result_held: false,
    updated_at: new Date().toISOString(),
  }).eq('board_meeting_id', meetingId)
  await logEvent(meetingId, 'result_dismissed', {})
}
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
