'use client'

import { useCallback, useEffect, useState } from 'react'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'

type Preview = {
  retention_months: number
  eligible_meetings: number
  counts: { attendance: number; timers: number; events: number; motions: number; votes: number }
}

export default function CleanupTab() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/board-meetings/retention')
      const b = await r.json()
      if (r.ok) setPreview(b)
      else toast(b.error || 'Could not load cleanup info', 'error')
    } catch {
      toast('Could not load cleanup info', 'error')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async () => {
    if (!preview || preview.eligible_meetings === 0) return
    const ok = await confirmDialog({
      title: 'Clean up old meetings?',
      message: `This permanently removes the working data (attendance, timers, motions, vote tallies, and the event log) for ${preview.eligible_meetings} meeting${preview.eligible_meetings === 1 ? '' : 's'} older than ${preview.retention_months} months. The meetings, their agendas, and the recording links are kept.`,
      confirmLabel: 'Clean up',
      tone: 'danger',
    })
    if (!ok) return
    setRunning(true)
    const r = await fetch('/api/board-meetings/retention', { method: 'POST' })
    const b = await r.json().catch(() => ({}))
    setRunning(false)
    if (!r.ok) { toast(b.error || 'Cleanup failed', 'error'); return }
    toast(`Cleaned up ${b.eligible_meetings} meeting${b.eligible_meetings === 1 ? '' : 's'}`, 'success')
    void load()
  }

  if (loading) return <Loader />

  const c = preview?.counts
  const nothing = !preview || preview.eligible_meetings === 0

  return (
    <div style={{ maxWidth: '560px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: text }}>Clean up old meetings</h3>
      <p style={{ margin: '0 0 18px', fontSize: '13px', color: muted, lineHeight: 1.5 }}>
        Removes the heavy working data from meetings older than {preview?.retention_months ?? 12} months — attendance, timers,
        motions, vote tallies, and the event log. The meetings, agendas, and recording links are always kept for the public record.
      </p>

      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '16px 18px' }}>
        {nothing ? (
          <p style={{ margin: 0, fontSize: '14px', color: muted }}>Nothing to clean up — no meetings are older than {preview?.retention_months ?? 12} months yet.</p>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', fontSize: '14px', color: text }}>
              <strong>{preview!.eligible_meetings}</strong> meeting{preview!.eligible_meetings === 1 ? '' : 's'} eligible. This would remove:
            </p>
            <ul style={{ margin: '0 0 16px', paddingLeft: '18px', color: muted, fontSize: '13px', lineHeight: 1.7 }}>
              <li>{c!.attendance} attendance record{c!.attendance === 1 ? '' : 's'}</li>
              <li>{c!.motions} motion{c!.motions === 1 ? '' : 's'} and {c!.votes} vote tall{c!.votes === 1 ? 'y' : 'ies'}</li>
              <li>{c!.timers} timer{c!.timers === 1 ? '' : 's'}</li>
              <li>{c!.events} event-log entr{c!.events === 1 ? 'y' : 'ies'}</li>
            </ul>
            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              style={{ fontSize: '14px', fontWeight: 600, padding: '10px 16px', minHeight: '44px', borderRadius: '10px', border: 'none', background: '#b3261e', color: '#fff', cursor: running ? 'wait' : 'pointer', fontFamily: 'inherit' }}
            >
              {running ? 'Cleaning up…' : 'Clean up old meetings'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
