'use client'

import type { ControlAgendaItem } from '@/lib/board-meetings/types'

type Props = {
  item: ControlAgendaItem | null
  brandingHold?: boolean
  isLive: boolean
}

const TYPE_BADGE_LABEL: Record<string, string> = {
  action: 'ACTION',
  recognition: 'RECOGNITION',
  procedural: 'PROCEDURAL',
  information: 'INFO',
}

export default function OnAirCard({ item, brandingHold = false, isLive }: Props) {
  const badgeLabel = item ? TYPE_BADGE_LABEL[item.type] : null
  const showActionBadge = item?.type === 'action' || item?.type === 'recognition'

  return (
    <div className="cs-card cs-onair-card">
      <div className="cs-onair-eyebrow">
        {isLive ? (
          <span className="cs-pulse-dot cs-onair-pulse" aria-hidden="true" />
        ) : null}
        <span>{isLive ? 'ON AIR' : 'NEXT UP'}</span>
        {brandingHold ? (
          <>
            <span className="cs-onair-divider" aria-hidden="true">·</span>
            <span>CSDTV HOLD</span>
          </>
        ) : item ? (
          <>
            <span className="cs-onair-divider" aria-hidden="true">·</span>
            <span>ITEM {item.item_number}</span>
            {showActionBadge && badgeLabel ? (
              <span className="cs-onair-badge">{badgeLabel}</span>
            ) : null}
          </>
        ) : null}
      </div>
      {brandingHold ? (
        <h2 className="cs-onair-title">CSDtv logo slide</h2>
      ) : item ? (
        <h2 className="cs-onair-title">{item.title}</h2>
      ) : (
        <p className="cs-onair-empty">No current item</p>
      )}
    </div>
  )
}