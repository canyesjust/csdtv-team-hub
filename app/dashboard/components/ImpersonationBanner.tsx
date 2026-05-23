'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'

type ImpersonationBannerProps = {
  subjectName: string
  subjectRole: string
  actorName: string
}

export default function ImpersonationBanner({
  subjectName,
  subjectRole,
  actorName,
}: ImpersonationBannerProps) {
  const [stopping, setStopping] = useState(false)

  const exitViewAs = async () => {
    setStopping(true)
    try {
      const res = await fetch('/api/impersonate/stop', { method: 'POST' })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast(json.error || 'Could not exit view-as mode', 'error')
        return
      }
      toast('Exited view-as mode', 'success')
      window.location.href = '/dashboard'
    } catch {
      toast('Could not exit view-as mode', 'error')
    } finally {
      setStopping(false)
    }
  }

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '10px 16px',
        background: 'rgba(232, 160, 32, 0.14)',
        borderBottom: '0.5px solid rgba(232, 160, 32, 0.35)',
        color: 'var(--text-primary)',
        fontSize: '14px',
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: 0, flex: 1, minWidth: '200px' }}>
        <strong style={{ fontWeight: 600 }}>Viewing as {subjectName}</strong>
        <span style={{ color: 'var(--text-muted)' }}> ({subjectRole})</span>
        <span style={{ color: 'var(--text-muted)' }}> — signed in as {actorName}. Data and navigation match their account.</span>
      </p>
      <button
        type="button"
        onClick={() => void exitViewAs()}
        disabled={stopping}
        style={{
          fontSize: '13px',
          fontWeight: 600,
          padding: '8px 14px',
          borderRadius: '8px',
          border: '0.5px solid rgba(232, 160, 32, 0.5)',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          cursor: stopping ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          minHeight: '40px',
          flexShrink: 0,
        }}
      >
        {stopping ? 'Exiting…' : 'Exit view-as'}
      </button>
    </div>
  )
}
