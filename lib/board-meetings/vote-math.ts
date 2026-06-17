// Single source of truth for motion pass/fail under Robert's Rules of Order.
//
// IMPORTANT: this is the ONLY place that decides whether a motion carries.
// Both the operator control surface and the broadcast/output side import this,
// so what the operator sees can never disagree with what is pushed to screen.
//
// Robert's Rules basics encoded here:
//   * A "vote cast" is a Yea or a Nay. Abstentions, recusals, and absences are
//     NOT votes cast and never count toward the threshold.
//   * Quorum is about who is PRESENT, not who voted — a member who is present and
//     abstains still counts toward quorum.
//   * A tie fails: a motion needs MORE than half of the votes cast to carry.

export type VoteThreshold = 'majority' | 'two_thirds' | 'majority_of_membership'

export type VoteTallyLike = {
  yea: number
  nay: number
  abstain?: number
  absent?: number
  recused?: number
}

export type MotionDecision = {
  /** Final outcome: requires both quorum AND the threshold to be met. */
  result: 'passed' | 'failed'
  /** Would the threshold pass on its own, ignoring quorum. */
  carried: boolean
  /** Was quorum present. */
  quorumMet: boolean
  /** Yea + Nay. Abstentions/absences excluded. */
  votesCast: number
  /** Everyone not absent (counts toward quorum): yea + nay + abstain + recused. */
  presentCount: number
  /** Yea votes needed to carry, for display. */
  needed: number
  threshold: VoteThreshold
}

export function decideMotion(
  tally: VoteTallyLike,
  opts: { quorumThreshold: number; threshold?: VoteThreshold; membershipSize?: number },
): MotionDecision {
  const yea = tally.yea ?? 0
  const nay = tally.nay ?? 0
  const abstain = tally.abstain ?? 0
  const recused = tally.recused ?? 0
  const threshold = opts.threshold ?? 'majority'

  const votesCast = yea + nay
  // Quorum counts everyone present, including abstainers and recused members.
  const presentCount = yea + nay + abstain + recused
  const quorumMet = presentCount >= opts.quorumThreshold

  let carried: boolean
  let needed: number
  if (threshold === 'two_thirds') {
    // At least two-thirds of the votes cast must be Yea: yea / votesCast >= 2/3.
    needed = Math.ceil((2 * votesCast) / 3)
    carried = votesCast > 0 && yea >= needed
  } else if (threshold === 'majority_of_membership') {
    // More than half of ALL seats, regardless of attendance.
    const m = opts.membershipSize ?? presentCount
    needed = Math.floor(m / 2) + 1
    carried = yea >= needed
  } else {
    // Simple majority: more than half of the votes cast (a tie fails).
    needed = Math.floor(votesCast / 2) + 1
    carried = yea > nay
  }

  const result: 'passed' | 'failed' = quorumMet && carried ? 'passed' : 'failed'
  return { result, carried, quorumMet, votesCast, presentCount, needed, threshold }
}
