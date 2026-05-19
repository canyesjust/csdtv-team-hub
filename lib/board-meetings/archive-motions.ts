import type { SupabaseClient } from '@supabase/supabase-js'
import { listMotionsEnriched } from '@/lib/board-meetings/motion-control'
import type { EnrichedMotion, EnrichedMotionVote } from '@/lib/board-meetings/motion-types'

export type ArchiveMotionPayload = {
  id: string
  motion_text: string
  motion_type: string
  status: string
  result: string | null
  moved_by: { id: string; name: string } | null
  seconded_by: { id: string; name: string } | null
  vote_mode: string | null
  tally: { yea: number; nay: number; abstain: number; absent: number; recused: number }
  votes: { person: { name: string }; vote: string }[]
  substitutes: ArchiveMotionPayload[]
  voted_at_offset_seconds: number | null
}

function personName(person: EnrichedMotionVote['person']): string {
  return person?.display_name || 'Unknown'
}

export async function enrichAgendaWithMotions(
  service: SupabaseClient,
  boardMeetingId: string,
  agenda: {
    id: string
    item_number: string
    consent_block?: string | null
    [key: string]: unknown
  }[],
  t0: number | null,
) {
  const motions = await listMotionsEnriched(service, boardMeetingId)
  const byItem = new Map<string, EnrichedMotion[]>()
  const byConsent = new Map<string, EnrichedMotion>()

  for (const m of motions) {
    if (m.consent_block) {
      if (!byConsent.has(m.consent_block) || m.opened_at < (byConsent.get(m.consent_block)?.opened_at || '')) {
        byConsent.set(m.consent_block, m)
      }
    }
    if (m.agenda_item_id) {
      const list = byItem.get(m.agenda_item_id) || []
      list.push(m)
      byItem.set(m.agenda_item_id, list)
    }
  }

  const substitutesByParent = new Map<string, EnrichedMotion[]>()
  for (const m of motions) {
    if (m.parent_motion_id) {
      const list = substitutesByParent.get(m.parent_motion_id) || []
      list.push(m)
      substitutesByParent.set(m.parent_motion_id, list)
    }
  }

  function formatMotion(m: EnrichedMotion): ArchiveMotionPayload {
    const votedOffset =
      m.voted_at && t0 ? Math.max(0, Math.floor((new Date(m.voted_at).getTime() - t0) / 1000)) : null
    return {
      id: m.id,
      motion_text: m.motion_text,
      motion_type: m.motion_type,
      status: m.status,
      result: m.result,
      moved_by: m.moved_by ? { id: m.moved_by.id, name: m.moved_by.display_name } : null,
      seconded_by: m.seconded_by ? { id: m.seconded_by.id, name: m.seconded_by.display_name } : null,
      vote_mode: m.vote_mode,
      tally: m.tally,
      votes: m.votes.map((v: EnrichedMotionVote) => ({
        person: { name: personName(v.person) },
        vote: v.vote,
      })),
      substitutes: (substitutesByParent.get(m.id) || []).map(s => formatMotion(s)),
      voted_at_offset_seconds: votedOffset,
    }
  }

  const passed = motions.filter(m => m.result === 'passed').length
  const failed = motions.filter(m => m.result === 'failed').length
  const substituteCount = motions.filter(m => m.motion_type === 'substitute').length

  return {
    agenda: agenda.map(it => {
      const itemMotions = (byItem.get(it.id) || []).filter(m => m.motion_type !== 'substitute')
      const primary = itemMotions[itemMotions.length - 1]
      const consentMotion = it.consent_block ? byConsent.get(it.consent_block) : null
      const coveredByConsent =
        consentMotion &&
        consentMotion.id !== primary?.id &&
        consentMotion.consent_block === it.consent_block

      return {
        ...it,
        motion: primary ? formatMotion(primary) : null,
        consolidated_consent_motion_id: coveredByConsent ? consentMotion!.id : null,
        consolidated_consent_motion: coveredByConsent ? formatMotion(consentMotion!) : null,
      }
    }),
    motionSummary: {
      motions_count: motions.length,
      passed_count: passed,
      failed_count: failed,
      substitute_motions_count: substituteCount,
    },
  }
}
