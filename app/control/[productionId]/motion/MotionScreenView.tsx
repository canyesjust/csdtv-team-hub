'use client'

import DraftingState from './states/DraftingState'
import OpenForDiscussionState from './states/OpenForDiscussionState'
import VotingState from './states/VotingState'
import SubstituteVotingState from './states/SubstituteVotingState'
import type { MotionScreenBundle } from '@/lib/board-meetings/types'

type Props = {
  bundle: MotionScreenBundle
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
  onPushResult: () => Promise<void>
}

export default function MotionScreenView(props: Props) {
  const { bundle } = props
  const active = bundle.active_motion
  const parent = bundle.parent_motion

  if (active?.motion_type === 'substitute' && parent) {
    return <SubstituteVotingState {...props} active={active} parent={parent} />
  }

  if (!active) {
    return <DraftingState {...props} active={null} />
  }

  switch (active.status) {
    case 'drafting':
      return <DraftingState {...props} active={active} />
    case 'open_for_discussion':
      return <OpenForDiscussionState {...props} active={active} />
    case 'voting':
    case 'passed':
    case 'failed':
      return <VotingState {...props} active={active} />
    default:
      return <DraftingState {...props} active={active} />
  }
}
