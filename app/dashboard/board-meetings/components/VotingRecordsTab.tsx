'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Loader from '../../components/Loader'

type BoardMember = { id: string; display_name: string; primary_title: string | null }
type VoteRecord = {
  motion_id: string
  motion_text: string
  result: string | null
  vote: string
  voted_at: string | null
  production_number: number | null
  meeting_title: string | null
  meeting_date: string | null
  archive_url: string | null
}

export default function VotingRecordsPage() {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [personId, setPersonId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [records, setRecords] = useState<VoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'

  useEffect(() => {
    fetch('/api/lower-third-people?category=board_member')
      .then(r => r.json())
      .then(body => {
        setMembers(body.people || body || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const loadRecords = useCallback(async () => {
    if (!personId) return
    setLoadingRecords(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/voting-records/by-member/${personId}?${params}`)
    const body = await res.json()
    if (res.ok) setRecords(body.records || [])
    setLoadingRecords(false)
  }, [personId, from, to])

  const exportCsv = () => {
    const header = ['Meeting', 'Date', 'Motion', 'Result', 'Vote']
    const rows = records.map(r => [
      r.meeting_title || '',
      r.meeting_date ? new Date(r.meeting_date).toLocaleDateString() : '',
      r.motion_text.replace(/"/g, '""'),
      r.result || '',
      r.vote,
    ])
    const csv = [header, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voting-records.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Loader />

  return (
    <div>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 20px' }}>
        Cross-meeting vote history by board member.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: muted }}>
          Board member
          <select
            value={personId}
            onChange={e => setPersonId(e.target.value)}
            style={{ padding: '10px', minWidth: '200px', borderRadius: '8px', border: `0.5px solid ${border}` }}
          >
            <option value="">Select…</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: muted }}>
          From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${border}` }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: muted }}>
          To
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `0.5px solid ${border}` }} />
        </label>
        <button
          type="button"
          onClick={loadRecords}
          disabled={!personId || loadingRecords}
          style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#1e6cb5', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {loadingRecords ? 'Loading…' : 'Load'}
        </button>
        {records.length > 0 && (
          <button type="button" onClick={exportCsv} style={{ padding: '10px 16px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'var(--surface-1)', cursor: 'pointer', fontFamily: 'inherit', color: text }}>
            Export CSV
          </button>
        )}
      </div>

      {records.length === 0 && personId && !loadingRecords ? (
        <p style={{ color: muted }}>No votes found for this member in the selected range.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${border}`, textAlign: 'left', color: muted }}>
                <th style={{ padding: '10px 8px' }}>Meeting</th>
                <th style={{ padding: '10px 8px' }}>Date</th>
                <th style={{ padding: '10px 8px' }}>Motion</th>
                <th style={{ padding: '10px 8px' }}>Result</th>
                <th style={{ padding: '10px 8px' }}>Vote</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={`${r.motion_id}-${r.vote}`} style={{ borderBottom: `0.5px solid ${border}` }}>
                  <td style={{ padding: '10px 8px', color: text }}>
                    {r.archive_url ? <Link href={r.archive_url}>{r.meeting_title}</Link> : r.meeting_title}
                  </td>
                  <td style={{ padding: '10px 8px', color: muted }}>
                    {r.meeting_date ? new Date(r.meeting_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', color: text, maxWidth: '360px' }}>{r.motion_text}</td>
                  <td style={{ padding: '10px 8px', color: text, textTransform: 'capitalize' }}>{r.result || '—'}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600, textTransform: 'uppercase', color: text }}>{r.vote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
