import type { SupabaseClient } from '@supabase/supabase-js'
import { listMotionsEnriched } from '@/lib/board-meetings/motion-control'

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
  const byItem = new Map<string, typeof motions>()
  const byConsent = new Map<string, (typeof motions)[0]>()

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

  const substitutesByParent = new Map<string, typeof motions>()
  for (const m of motions) {
    if (m.parent_motion_id) {
      const list = substitutesByParent.get(m.parent_motion_id) || []
      list.push(m)
      substitutesByParent.set(m.parent_motion_id, list)
    }
  }

  const formatMotion = (m: (typeof motions)[0]) => {
    const votedOffset =
      m.voted_at && t0 ? Math.max(0, Math.floor((new Date(m.voted_at).getTime() - t0) / 1000)) : null
    return {
      id: m.id,
      motion_text: m.motion_text,
      motion_type: m.motion_type,
      status: m.status,
      result: m.result,
      moved_by: m.moved_by ? { id: m.moved_by.id, name: (m.moved_by as { display_name?: string }).display_name || '' } : null,
      seconded_by: m.seconded_by ? { id: m.seconded_by.id, name: (m.seconded_by as { display_name?: string }).display_name || '' } : null,
      vote_mode: m.vote_mode,
      tally: m.tally,
      votes: m.votes.map(v => ({
        person: v.person ? { name: (v.person as { display_name?: string }).display_name || 'Unknown' } : { name: 'Unknown' },
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
