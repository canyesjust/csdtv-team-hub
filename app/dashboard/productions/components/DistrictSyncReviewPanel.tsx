'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import type { DistrictSyncPendingProduction } from '@/lib/district-sync'

type Props = {
  isManager: boolean
  onChanged: () => void
}

export default function DistrictSyncReviewPanel({ isManager, onChanged }: Props) {
  const [pending, setPending] = useState<DistrictSyncPendingProduction[]>([])
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isManager) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/district-sync', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast((body as { error?: string }).error || 'Could not load district sync status', 'error')
        return
      }
      setPending((body as { pending?: DistrictSyncPendingProduction[] }).pending || [])
      setSessionStartedAt((body as { session?: { startedAt?: string | null } }).session?.startedAt ?? null)
    } finally {
      setLoading(false)
    }
  }, [isManager])

  useEffect(() => {
    void load()
  }, [load])

  const finalize = async () => {
    if (
      !confirm(
        'Compare Hub to your last district sync and flag productions that were not in that sync?\n\nNothing is deleted automatically. You will choose archive or delete for each flagged production.',
      )
    ) {
      return
    }
    setFinalizing(true)
    try {
      const res = await fetch('/api/admin/district-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast((body as { error?: string }).error || 'Finalize failed', 'error')
        return
      }
      const flagged = (body as { flagged?: number }).flagged ?? 0
      setPending((body as { pending?: DistrictSyncPendingProduction[] }).pending || [])
      setSessionStartedAt(null)
      toast(
        flagged > 0
          ? `${flagged} production(s) need review — removed from district site`
          : 'No productions missing from the last district sync',
        flagged > 0 ? 'success' : 'info',
      )
      onChanged()
    } finally {
      setFinalizing(false)
    }
  }

  const act = async (productionId: string, action: 'archive' | 'dismiss' | 'delete', label: string) => {
    const confirmMsg =
      action === 'delete'
        ? 'Permanently delete this production from Team Hub? Linked videos will be unlinked. This cannot be undone.'
        : action === 'archive'
          ? 'Mark this production as Abandoned in Team Hub?'
          : 'Keep this production in Team Hub and clear the removal flag?'
    if (!confirm(confirmMsg)) return

    setActingId(productionId)
    try {
      const res = await fetch(`/api/admin/district-sync/${productionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast((body as { error?: string }).error || `${label} failed`, 'error')
        return
      }
      setPending(prev => prev.filter(p => p.id !== productionId))
      toast(label, 'success')
      onChanged()
    } finally {
      setActingId(null)
    }
  }

  if (!isManager) return null

  return (
    <div
      style={{
        marginBottom: '16px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid rgba(232,160,32,0.45)',
        background: 'rgba(232,160,32,0.08)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 280px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            District sync safety
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Sync from the productions site only <strong>updates</strong> Hub — it never auto-deletes. After you finish
            syncing in the browser extension, click <strong>Review sync</strong> to flag productions that disappeared
            from the district site. You choose archive or delete for each one.
          </p>
          {sessionStartedAt && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Sync in progress since {new Date(sessionStartedAt).toLocaleString()}. Run extension sync, then Review
              sync.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={finalizing || loading}
          style={{
            fontSize: '13px',
            padding: '10px 16px',
            borderRadius: '8px',
            background: '#1e6cb5',
            color: '#fff',
            border: 'none',
            cursor: finalizing || loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {finalizing ? 'Reviewing…' : 'Review sync'}
        </button>
      </div>

      {pending.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#e8a020' }}>
            {pending.length} not on district site — choose an action
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pending.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--surface-1)',
                  border: '0.5px solid var(--border-subtle)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/dashboard/productions/${p.id}`}
                    style={{ fontSize: '14px', fontWeight: 600, color: 'var(--brand-primary)', textDecoration: 'none' }}
                  >
                    #{p.production_number} {p.title}
                  </Link>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {p.status || 'Unknown status'}
                    {p.organizer_name ? ` · ${p.organizer_name}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={actingId === p.id}
                    onClick={() => void act(p.id, 'dismiss', 'Kept in Hub')}
                    style={btnStyle('muted')}
                  >
                    Keep in Hub
                  </button>
                  <button
                    type="button"
                    disabled={actingId === p.id}
                    onClick={() => void act(p.id, 'archive', 'Archived')}
                    style={btnStyle('warn')}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    disabled={actingId === p.id}
                    onClick={() => void act(p.id, 'delete', 'Deleted')}
                    style={btnStyle('danger')}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function btnStyle(variant: 'muted' | 'warn' | 'danger'): CSSProperties {
  const base: CSSProperties = {
    fontSize: '12px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '0.5px solid var(--border-subtle)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
  }
  if (variant === 'danger') return { ...base, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }
  if (variant === 'warn') return { ...base, background: 'rgba(232,160,32,0.12)', color: '#e8a020' }
  return { ...base, background: 'transparent', color: 'var(--text-muted)' }
}
