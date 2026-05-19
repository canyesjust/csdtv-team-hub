'use client'

import type { ControlAgendaItem } from '@/lib/board-meetings/types'

type Props = {
  item: ControlAgendaItem | null
  isLive: boolean
}

export default function OnAirCard({ item, isLive }: Props) {
  return (
    <div className="cs-card control-on-air-item">
      <div className="cs-eyebrow" style={{ marginBottom: 6 }}>
        {isLive ? 'On air' : 'Current item'}
      </div>
      {item ? (
        <>
          <p className="control-on-air-item__num">{item.item_number}</p>
          <p className="control-on-air-item__title">{item.title}</p>
        </>
      ) : (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>No current item</p>
      )}
    </div>
  )
}
