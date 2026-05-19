import type { VoteTally } from '@/lib/board-meetings/motion-types'
import type { ActiveMotion, MotionScreenBundle } from '@/lib/board-meetings/types'

export type MotionScreenViewProps = {
  bundle: MotionScreenBundle
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
  onPushResult: () => Promise<void>
}

export type MotionScreenStateProps = MotionScreenViewProps & {
  active: ActiveMotion | null
  parent?: ActiveMotion | null
}

export function tallyFromActiveMotion(m: ActiveMotion | null): VoteTally | null {
  if (!m || (m.tally_yea == null && m.tally_nay == null)) return null
  return {
    yea: m.tally_yea ?? 0,
    nay: m.tally_nay ?? 0,
    abstain: m.tally_abstain ?? 0,
    absent: 0,
    recused: 0,
  }
}

export function uiMotionStatus(bundle: MotionScreenBundle, active: ActiveMotion | null): string {
  if (!active) return 'No motion'
  if (bundle.lifecycle_state === 'drafting' && bundle.active_motion?.id === active.id) {
    return 'drafting'
  }
  return active.status
}
