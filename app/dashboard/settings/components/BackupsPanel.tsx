'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import Loader from '../../components/Loader'

export interface BackupRunRow {
  id: string
  created_at: string
  completed_at: string | null
  file_name: string
  size_bytes: number | null
  status: string
  error_message: string | null
  row_counts: Record<string, number> | null
}

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BackupsPanel({
  text,
  muted,
  border,
  cardBg,
}: {
  text: string
  muted: string
  border: string
  cardBg: string
}) {
  const [backups, setBackups] = useState<BackupRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/backups', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Could not load backups', 'error')
        return
      }
      setBackups(data.backups || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const runNow = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', force: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Backup failed', 'error')
        return
      }
      if (data.skipped) {
        toast(`Backup skipped: ${data.reason}`, 'info')
      } else {
        toast(`Backup created: ${data.fileName}`, 'success')
      }
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup failed', 'error')
    } finally {
      setRunning(false)
    }
  }

  const download = async (id: string) => {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/admin/backups/${id}/download`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Download failed', 'error')
        return
      }
      window.location.href = data.url
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Download failed', 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  const btnStyle: React.CSSProperties = {
    fontSize: '13px',
    padding: '8px 14px',
    borderRadius: '8px',
    border: `1px solid ${border}`,
    background: cardBg,
    color: text,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        Every Sunday, Team Hub saves a compressed archive of core data to secure storage. Up to four weekly files are kept.
        Download and store a copy somewhere safe (Google Drive, etc.) if you want an off-platform archive.
        Files are <code style={{ fontSize: '12px' }}>.json.gz</code> (gunzip, then open the JSON).
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button type="button" onClick={runNow} disabled={running} style={{ ...btnStyle, background: 'var(--brand-primary)', color: '#fff', border: 'none', opacity: running ? 0.7 : 1 }}>
          {running ? 'Running backup…' : 'Run backup now'}
        </button>
        <button type="button" onClick={load} disabled={loading} style={btnStyle}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
          <Loader size={32} />
        </div>
      ) : backups.length === 0 ? (
        <p style={{ fontSize: '14px', color: muted, margin: 0 }}>No backups yet. The first scheduled run is Sunday morning.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {backups.map(b => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: `0.5px solid ${border}`,
                background: cardBg,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: text }}>{b.file_name}</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: muted }}>
                  {formatWhen(b.completed_at || b.created_at)} · {formatBytes(b.size_bytes)} ·{' '}
                  <span style={{ color: b.status === 'completed' ? '#22c55e' : b.status === 'failed' ? '#ef4444' : muted }}>
                    {b.status}
                  </span>
                </p>
                {b.status === 'failed' && b.error_message && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#ef4444' }}>{b.error_message}</p>
                )}
              </div>
              {b.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => download(b.id)}
                  disabled={downloadingId === b.id}
                  style={{ ...btnStyle, flexShrink: 0 }}
                >
                  {downloadingId === b.id ? 'Preparing…' : 'Download'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
