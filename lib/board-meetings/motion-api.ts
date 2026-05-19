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
    .maybeSingle()

  if (!motion) throw new Error('Motion not found')

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
    .maybeSingle()

  if (!parent) throw new Error('Parent motion not found')

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
