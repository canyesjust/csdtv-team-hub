'use client'

import type { ControlAgendaItem } from '@/lib/board-meetings/types'

type Props = {
  items: ControlAgendaItem[]
  currentItemId?: string | null
  disabled?: boolean
  onJump: (itemId: string) => void
}

export default function AgendaPanel({ items, currentItemId, disabled, onJump }: Props) {
  return (
    <>
      {(items || []).map(it => {
        const isCurrent = it.id === currentItemId
        return (
          <button
            key={it.id}
            type="button"
            disabled={disabled}
            onClick={() => onJump(it.id)}
            className={`cs-agenda-item${isCurrent ? ' cs-agenda-item-onair' : ''}`}
          >
            <span className="cs-agenda-checkbox" aria-hidden="true" />
            <span className="cs-agenda-content">
              <span className="cs-agenda-num">
                {it.item_number}
                {isCurrent ? <span className="cs-agenda-onair-marker"> · ON AIR</span> : null}
              </span>
              <span className="cs-agenda-title">{it.title}</span>
            </span>
          </button>
        )
      })}
    </>
  )
}