'use client'

import { useEffect, useMemo, useState } from 'react'
import { resolveSuggestedMotionText } from '@/lib/board-meetings/motion-api'
import type { ControlAgendaItem } from '@/lib/board-meetings/types'
import { toast } from '@/lib/toast'

function isActionItem(item: ControlAgendaItem): boolean {
  return item.type === 'action' || !!item.action_requested
}

export default function MotionTemplatePanel({
  items,
  currentItem,
  canControl,
  busy,
  onSave,
}: {
  items: ControlAgendaItem[]
  currentItem: ControlAgendaItem | null | undefined
  canControl: boolean
  busy?: boolean
  onSave: (itemId: string, suggested_motion_text: string | null) => Promise<void>
}) {
  const actionItems = useMemo(() => {
    const byId = new Map<string, ControlAgendaItem>()
    for (const it of items || []) {
      if (isActionItem(it)) byId.set(it.id, it)
    }
    if (currentItem && isActionItem(currentItem)) {
      byId.set(currentItem.id, currentItem)
    }
    return [...byId.values()].sort((a, b) => a.sort_order - b.sort_order)
  }, [items, currentItem])

  const [selectedId, setSelectedId] = useState<string>('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const preferred =
      currentItem && isActionItem(currentItem)
        ? currentItem.id
        : actionItems[0]?.id ?? ''
    setSelectedId(preferred)
  }, [currentItem?.id, actionItems])

  const selected = useMemo(
    () => actionItems.find(i => i.id === selectedId) ?? null,
    [actionItems, selectedId],
  )

  useEffect(() => {
    if (!selected) {
      setDraft('')
      return
    }
    setDraft(selected.suggested_motion_text?.trim() ?? '')
  }, [selected?.id, selected?.suggested_motion_text])

  const savedText = selected?.suggested_motion_text?.trim() ?? ''
  const draftTrimmed = draft.trim()
  const isDirty = !!selected && draftTrimmed !== savedText

  const fillFromTitle = () => {
    if (!selected) return
    setDraft(
      resolveSuggestedMotionText({
        id: selected.id,
        item_number: selected.item_number,
        title: selected.title,
        type: selected.type,
        suggested_motion_text: null,
      }),
    )
  }

  const handleSave = async () => {
    if (!selected || !canControl) return
    setSaving(true)
    try {
      await onSave(selected.id, draftTrimmed.length > 0 ? draftTrimmed : null)
      toast('Motion template saved', 'success')
    } catch {
      toast('Could not save motion template', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (actionItems.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
        No action items on the agenda. Motion templates apply to action items only.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Save wording for an agenda item here. It is recalled automatically when you open a motion on the motion
        screen or from the control flow.
      </p>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Agenda item</span>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          disabled={!canControl || saving || busy}
          style={{
            fontSize: '14px',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            minHeight: '44px',
          }}
        >
          {actionItems.map(it => (
            <option key={it.id} value={it.id}>
              {it.item_number} — {it.title.slice(0, 80)}
              {it.title.length > 80 ? '…' : ''}
              {it.suggested_motion_text?.trim() ? ' · saved' : ''}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Motion text
            </span>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              disabled={!canControl || saving || busy}
              rows={3}
              placeholder="e.g. Move to approve Minutes for May 5, 2026"
              style={{
                fontSize: '14px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '0.5px solid var(--border-subtle)',
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '72px',
              }}
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              className="cs-touchbtn cs-touchbtn-small"
              disabled={!canControl || saving || busy}
              onClick={fillFromTitle}
            >
              Suggest from title
            </button>
            <button
              type="button"
              className="cs-touchbtn cs-touchbtn-small cs-touchbtn-primary"
              disabled={!canControl || saving || busy || !isDirty}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : savedText ? 'Update saved motion' : 'Save motion'}
            </button>
          </div>

          {savedText && !isDirty ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Saved for {selected.item_number}. Open motion on air to use this text.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
