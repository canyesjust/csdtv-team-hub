'use client'

import type { VoteTally } from '@/lib/board-meetings/motion-types'

export default function TallyRow({ tally, result }: { tally: VoteTally; result: string | null }) {
  const passed = result === 'passed'
  return (
    <div className="ms-tally" style={passed ? { borderColor: 'var(--semantic-success-border)', background: 'var(--semantic-success-bg)' } : { borderColor: 'var(--semantic-danger-border)', background: 'var(--semantic-danger-bg)' }}>
      <span className="ms-tally__item">Yea {tally.yea}</span>
      <span className="ms-tally__item">Nay {tally.nay}</span>
      <span className="ms-tally__item">Abstain {tally.abstain}</span>
      <span className="ms-tally__item" style={{ color: passed ? 'var(--semantic-success-text)' : 'var(--semantic-danger-text)' }}>
        {passed ? 'Passed' : 'Failed'}
      </span>
    </div>
  )
}
