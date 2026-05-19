'use client'

import { useEffect, useState } from 'react'

type ArchivePayload = {
  meeting: {
    title: string
    date: string | null
    type: string | null
    location: string | null
    broadcast_status: string
    youtube_url: string | null
    production_number: number
    cancelled?: boolean
  }
  agenda: {
    item_number: string
    section_title: string
    title: string
    type: string
    started_at_human: string | null
    started_at_offset_seconds: number | null
    presenters: { name: string; title: string | null }[]
    documents: { title: string; source_url: string | null }[]
  }[]
  summary: {
    total_duration_seconds: number
    action_items_count: number
    presenters_count: number
    recess_count: number
  }
  not_board_meeting?: boolean
}

function youtubeJumpUrl(youtubeUrl: string | null, offsetSeconds: number | null) {
  if (!youtubeUrl || offsetSeconds == null) return null
  const sep = youtubeUrl.includes('?') ? '&' : '?'
  return `${youtubeUrl}${sep}t=${offsetSeconds}`
}

export default function BoardArchiveView({ productionNumber }: { productionNumber: number }) {
  const [data, setData] = useState<ArchivePayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/board/meeting/${productionNumber}/archive`)
      .then(async res => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Not found')
        setData(body)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [productionNumber])

  if (error) {
    return <div style={page}><p style={{ color: '#64748b', textAlign: 'center', marginTop: '30vh' }}>{error}</p></div>
  }
  if (!data) {
    return <div style={page}><p style={{ color: '#64748b', textAlign: 'center', marginTop: '30vh' }}>Loading…</p></div>
  }

  const m = data.meeting
  const notArchived = m.broadcast_status !== 'archived' && m.broadcast_status !== 'cancelled'
  const durationMin = Math.round(data.summary.total_duration_seconds / 60)

  return (
    <div style={page}>
      {m.cancelled && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: '12px 20px', textAlign: 'center', fontWeight: 600 }}>
          This meeting was cancelled
        </div>
      )}
      {notArchived && !m.cancelled && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: '12px 20px', textAlign: 'center' }}>
          This meeting has not concluded yet.
          {m.broadcast_status === 'live' && (
            <span> Watch the <a href={`/board/5/live`} style={{ color: '#1e6cb5' }}>live second screen</a>.</span>
          )}
        </div>
      )}

      <header style={{ padding: '32px 20px 24px', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: 700, color: '#0f172a' }}>{m.title}</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: '15px' }}>
          {m.type} · {m.date ? new Date(m.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
        </p>
        {m.location && <p style={{ margin: '4px 0 0', color: '#64748b' }}>{m.location}</p>}
        {m.youtube_url && (
          <a href={m.youtube_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '12px', color: '#1e6cb5', fontWeight: 600 }}>
            Watch on YouTube →
          </a>
        )}
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '28px' }}>
          <SummaryCard label="Duration" value={durationMin > 0 ? `~${durationMin} min` : '—'} />
          <SummaryCard label="Action items" value={String(data.summary.action_items_count)} />
          <SummaryCard label="Presenters" value={String(data.summary.presenters_count)} />
        </div>

        <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#0f172a' }}>Agenda timeline</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.agenda.map((it, i) => {
            const yt = youtubeJumpUrl(m.youtube_url, it.started_at_offset_seconds)
            return (
              <div key={i} style={{ display: 'flex', gap: '16px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '14px', color: '#64748b', minWidth: '64px', paddingTop: '2px' }}>
                  {it.started_at_human || '—'}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#94a3b8' }}>{it.section_title} · {it.item_number}</p>
                  <p style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 600, color: '#0f172a' }}>{it.title}</p>
                  {it.presenters[0] && (
                    <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#475569' }}>{it.presenters[0].name}</p>
                  )}
                  {it.documents.map((d, j) => d.source_url && (
                    <a key={j} href={d.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#1e6cb5', marginRight: '12px' }}>
                      {d.title}
                    </a>
                  ))}
                  {yt && (
                    <a href={yt} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '8px', fontSize: '13px', fontWeight: 600, color: '#1e6cb5' }}>
                      Jump to this point on YouTube
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
      <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>{value}</p>
    </div>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
  fontFamily: 'system-ui, sans-serif',
}
