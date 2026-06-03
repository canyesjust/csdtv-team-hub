'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ControlAgendaItem } from '@/lib/board-meetings/types'

type Props = {
  items: ControlAgendaItem[]
  currentItemId?: string | null
  brandingHold?: boolean
  disabled?: boolean
  editMode?: boolean
  agendaEditBusy?: boolean
  onJump: (itemId: string) => void
  onBrandingHold: () => void
  onPatchItem?: (itemId: string, patch: Partial<ControlAgendaItem>) => void | Promise<void>
  onMoveItem?: (itemId: string, direction: 'up' | 'down') => void | Promise<void>
}

export default function AgendaPanel({
  items,
  currentItemId,
  brandingHold = false,
  disabled,
  editMode = false,
  agendaEditBusy = false,
  onJump,
  onBrandingHold,
  onPatchItem,
  onMoveItem,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(
    () => [...(items || [])].sort((a, b) => a.sort_order - b.sort_order),
    [items],
  )

  const currentSortIndex = useMemo(
    () => (currentItemId ? sorted.findIndex(i => i.id === currentItemId) : -1),
    [sorted, currentItemId],
  )

  const followLiveOrder = !editMode && !brandingHold && currentSortIndex >= 0

  const displayItems = useMemo(() => {
    if (!followLiveOrder) return sorted
    if (currentSortIndex <= 0) return sorted
    return [...sorted.slice(currentSortIndex), ...sorted.slice(0, currentSortIndex)]
  }, [sorted, followLiveOrder, currentSortIndex])

  useEffect(() => {
    if (!followLiveOrder) return
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentItemId, followLiveOrder])

  return (
    <div className="cs-agenda-scroll" ref={scrollRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={onBrandingHold}
        className={`cs-agenda-item cs-agenda-item-branding${brandingHold ? ' cs-agenda-item-onair' : ''}`}
      >
        <span className="cs-agenda-checkbox" aria-hidden="true" />
        <span className="cs-agenda-content">
          <span className="cs-agenda-num">
            HOLD
            {brandingHold ? <span className="cs-agenda-onair-marker"> · ON AIR</span> : null}
          </span>
          <span className="cs-agenda-title">CSDtv logo — agenda update</span>
        </span>
      </button>

      {displayItems.map((it, idx) => {
        const itemSortIndex = sorted.findIndex(i => i.id === it.id)
        const broadcastableRank = sorted.filter(i => i.is_broadcastable).findIndex(i => i.id === it.id)
        const isDone =
          followLiveOrder && itemSortIndex >= 0 && itemSortIndex < currentSortIndex
        return (
          <AgendaRow
            key={it.id}
            item={it}
            index={idx}
            broadcastableRank={broadcastableRank}
            broadcastableCount={sorted.filter(i => i.is_broadcastable).length}
            total={sorted.length}
            isCurrent={!brandingHold && it.id === currentItemId}
            isDone={isDone}
            disabled={disabled}
            editMode={editMode}
            agendaEditBusy={agendaEditBusy}
            onJump={onJump}
            onPatchItem={onPatchItem}
            onMoveItem={onMoveItem}
          />
        )
      })}
    </div>
  )
}

function AgendaRow({
  item,
  index,
  broadcastableRank,
  broadcastableCount,
  total,
  isCurrent,
  isDone = false,
  disabled,
  editMode,
  agendaEditBusy,
  onJump,
  onPatchItem,
  onMoveItem,
}: {
  item: ControlAgendaItem
  index: number
  broadcastableRank: number
  broadcastableCount: number
  total: number
  isCurrent: boolean
  isDone?: boolean
  disabled?: boolean
  editMode: boolean
  agendaEditBusy: boolean
  onJump: (itemId: string) => void
  onPatchItem?: (itemId: string, patch: Partial<ControlAgendaItem>) => void | Promise<void>
  onMoveItem?: (itemId: string, direction: 'up' | 'down') => void | Promise<void>
}) {
  const [titleDraft, setTitleDraft] = useState(item.title)

  useEffect(() => {
    setTitleDraft(item.title)
  }, [item.title])

  if (!editMode) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onJump(item.id)}
        className={`cs-agenda-item${isCurrent ? ' cs-agenda-item-onair' : ''}${isDone ? ' cs-agenda-item-done' : ''}`}
      >
        <span className="cs-agenda-checkbox" aria-hidden="true" />
        <span className="cs-agenda-content">
          <span className="cs-agenda-num">
            {item.item_number}
            {isCurrent ? <span className="cs-agenda-onair-marker"> · ON AIR</span> : null}
          </span>
          <span className="cs-agenda-title">{item.title}</span>
        </span>
      </button>
    )
  }

  const saveTitle = () => {
    const next = titleDraft.trim()
    if (!next || next === item.title) return
    void onPatchItem?.(item.id, { title: next })
  }

  return (
    <div
      className={`cs-agenda-item cs-agenda-item-edit${isCurrent ? ' cs-agenda-item-onair' : ''}${!item.is_broadcastable ? ' cs-agenda-item-skipped' : ''}`}
    >
      <div className="cs-agenda-edit-tools">
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-small"
          disabled={disabled || agendaEditBusy || !item.is_broadcastable || broadcastableRank <= 0}
          onClick={() => onMoveItem?.(item.id, 'up')}
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-small"
          disabled={
            disabled ||
            agendaEditBusy ||
            !item.is_broadcastable ||
            broadcastableRank < 0 ||
            broadcastableRank >= broadcastableCount - 1
          }
          onClick={() => onMoveItem?.(item.id, 'down')}
          aria-label="Move down"
        >
          ↓
        </button>
      </div>
      <div className="cs-agenda-content">
        <span className="cs-agenda-num">
          {item.item_number}
          {isCurrent ? <span className="cs-agenda-onair-marker"> · ON AIR</span> : null}
        </span>
        <input
          className="cs-agenda-edit-title"
          value={titleDraft}
          disabled={disabled || agendaEditBusy}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <label className="cs-agenda-edit-skip">
          <input
            type="checkbox"
            checked={item.is_broadcastable}
            disabled={disabled || agendaEditBusy}
            onChange={e => void onPatchItem?.(item.id, { is_broadcastable: e.target.checked })}
          />
          On air
        </label>
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-small cs-agenda-go-btn"
          disabled={disabled || agendaEditBusy}
          onClick={() => onJump(item.id)}
        >
          Go to item
        </button>
      </div>
    </div>
  )
}
