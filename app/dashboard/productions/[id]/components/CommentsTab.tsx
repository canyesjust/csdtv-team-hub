'use client'

import CommentsSection from '../../../components/CommentsSection'
import type { PTabCtx } from './production-tab-ctx'

export default function CommentsTab({ c }: { c: PTabCtx }) {
  if (!c.uuid || !c.currentUser) return null
  return (
    <div style={{ background: c.cardBg, border: `0.5px solid ${c.border}`, borderRadius: '12px', padding: '16px' }}>
      <CommentsSection
        entityType="production"
        entityId={c.uuid}
        currentUserId={c.currentUser.id}
        team={c.allTeam}
      />
    </div>
  )
}
