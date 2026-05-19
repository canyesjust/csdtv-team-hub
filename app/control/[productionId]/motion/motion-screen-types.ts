import type { VoteTally } from '@/lib/board-meetings/motion-types'
import type { VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'

export type MotionUi = {
  id: string
  motion_text: string
  status: string
  motion_type: string
  parent_motion_id: string | null
  result: string | null
  tally_yea?: number | null
  tally_nay?: number | null
  tally_abstain?: number | null
  moved_by?: { id: string; display_name: string } | null
  seconded_by?: { id: string; display_name: string } | null
}

export type MotionScreenModel = {
  activeMotion: MotionUi | null
  parentMotion: MotionUi | null
  currentItem: { id: string; title: string; item_number: string; type: string; consent_block?: string | null } | null
  members: { person_id: string; name: string }[]
  voters: VoterRow[]
  statusLabel: string
  isConsentLead: boolean
  consentRange: string | null
  canControl: boolean
  isLive: boolean
  resultOnOverlay: boolean
}

export function tallyFromMotion(m: MotionUi): VoteTally | null {
  if (m.tally_yea == null && m.tally_nay == null) return null
  return {
    yea: m.tally_yea ?? 0,
    nay: m.tally_nay ?? 0,
    abstain: m.tally_abstain ?? 0,
    absent: 0,
    recused: 0,
  }
}
