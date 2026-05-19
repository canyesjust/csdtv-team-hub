import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttendanceStatus } from '@/lib/board-meetings/motion-types'
import { logMeetingEvent } from '@/lib/board-meetings/broadcast-control'
import { getCachedBoardMembersForAttendance } from '@/lib/board-meetings/control-meeting-cache'

export type AttendanceRecord = {
  id: string
  person_id: string
  status: AttendanceStatus
  arrived_at: string | null
  left_at: string | null
  notes: string | null
  person?: { id: string; name: string; title: string | null }
}

export async function loadBoardMembers(service: SupabaseClient) {
  const people = await getCachedBoardMembersForAttendance(service)
  return people.map(p => ({
    id: p.id,
    display_name: p.display_name,
    primary_title: p.primary_title,
  }))
}

/** Attendance status only — board member list comes from cache. */
export async function loadAttendance(service: SupabaseClient, boardMeetingId: string) {
  const members = await loadBoardMembers(service)
  const { data: rows } = await service
    .from('meeting_attendance')
    .select('id, person_id, status, arrived_at, left_at, notes')
    .eq('board_meeting_id', boardMeetingId)

  const byPerson = new Map((rows || []).map(r => [r.person_id, r]))
  const records = members.map(m => {
    const att = byPerson.get(m.id)
    return {
      person_id: m.id,
      name: m.display_name,
      title: m.primary_title,
      status: (att?.status as AttendanceStatus) || 'present',
      arrived_at: att?.arrived_at ?? null,
      left_at: att?.left_at ?? null,
      notes: att?.notes ?? null,
      attendance_id: att?.id ?? null,
    }
  })

  const quorum = computeQuorum(records.length, records)
  return { records, quorum, board_member_count: members.length }
}

export function isEligibleToVote(
  status: AttendanceStatus,
  at: Date,
  arrivedAt: string | null,
  leftAt: string | null,
): boolean {
  if (status === 'absent') return false
  if (status === 'left_early' && leftAt && new Date(leftAt) <= at) return false
  if (status === 'arrived_late' && arrivedAt && new Date(arrivedAt) > at) return false
  return status === 'present' || status === 'remote' || status === 'arrived_late' || status === 'left_early'
}

export function computeQuorum(
  boardMemberCount: number,
  records: { status: AttendanceStatus }[],
) {
  const threshold = Math.ceil(boardMemberCount / 2)
  const presentCount = records.filter(r =>
    r.status === 'present' || r.status === 'remote' || r.status === 'arrived_late',
  ).length
  return {
    threshold,
    present_count: presentCount,
    quorum_met: presentCount >= threshold,
  }
}

export async function upsertAttendanceBulk(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  updates: {
    person_id: string
    status: AttendanceStatus
    arrived_at?: string | null
    left_at?: string | null
    notes?: string | null
  }[],
) {
  for (const u of updates) {
    const { data: existing } = await service
      .from('meeting_attendance')
      .select('id, status')
      .eq('board_meeting_id', boardMeetingId)
      .eq('person_id', u.person_id)
      .maybeSingle()

    const patch = {
      status: u.status,
      arrived_at: u.arrived_at ?? null,
      left_at: u.left_at ?? null,
      notes: u.notes ?? null,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const fromStatus = existing.status
      await service.from('meeting_attendance').update(patch).eq('id', existing.id)
      if (fromStatus !== u.status) {
        await logMeetingEvent(service, boardMeetingId, 'attendance_changed', operatorId, {
          person_id: u.person_id,
          from_status: fromStatus,
          to_status: u.status,
        })
      }
    } else {
      await service.from('meeting_attendance').insert({
        board_meeting_id: boardMeetingId,
        person_id: u.person_id,
        ...patch,
      })
      await logMeetingEvent(service, boardMeetingId, 'attendance_changed', operatorId, {
        person_id: u.person_id,
        from_status: null,
        to_status: u.status,
      })
    }
  }
}

export async function ensureDefaultAttendance(
  service: SupabaseClient,
  boardMeetingId: string,
) {
  const members = await loadBoardMembers(service)
  const { data: existing } = await service
    .from('meeting_attendance')
    .select('person_id')
    .eq('board_meeting_id', boardMeetingId)
  const have = new Set((existing || []).map(e => e.person_id))
  const missing = members.filter(m => !have.has(m.id))
  if (missing.length === 0) return
  await service.from('meeting_attendance').insert(
    missing.map(m => ({
      board_meeting_id: boardMeetingId,
      person_id: m.id,
      status: 'present',
    })),
  )
}
