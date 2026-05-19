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
      {(items || []).map(it => (
        <button
          key={it.id}
          type="button"
          disabled={disabled}
          onClick={() => onJump(it.id)}
          className={`control-agenda-btn${it.id === currentItemId ? ' control-agenda-btn--current' : ''}`}
        >
          <span className="control-agenda-btn__num">{it.item_number}</span>
          <span className="control-agenda-btn__title">{it.title}</span>
        </button>
      ))}
    </>
  )
}
