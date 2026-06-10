'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { confirmDialog } from '@/lib/confirm'
import { createClient } from '@/lib/supabase'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'
import {
  SIGNAGE_SLIDESHOW_URL,
  SIGNAGE_SUBMIT_URL,
  signageSubmissionPublicUrl,
} from '@/lib/signage-submissions'

type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface SignageSubmission {
  id: string
  submitter_name: string
  submitter_email: string
  department: string | null
  caption: string | null
  image_path: string
  start_date: string
  end_date: string
  status: SubmissionStatus
  reject_reason: string | null
  notes: string | null
  reviewed_at: string | null
  created_at: string
}

type Tab = SubmissionStatus

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function statusColor(status: SubmissionStatus): { bg: string; color: string } {
  if (status === 'approved') return { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
  if (status === 'rejected') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' }
  return { bg: 'rgba(232,160,32,0.12)', color: '#e8a020' }
}

export default function SignageSubmissionsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const [loading, setLoading] = useState(true)
  const [isManager, setIsManager] = useState(false)
  const [submissions, setSubmissions] = useState<SignageSubmission[]>([])
  const [tab, setTab] = useState<Tab>('pending')
  const [dateEdits, setDateEdits] = useState<Record<string, { start: string; end: string }>>({})
  const [rejectOpenId, setRejectOpenId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '14px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }
    const { data: user } = await supabase
      .from('team')
      .select('role')
      .eq('supabase_user_id', session.user.id)
      .single()

    const manager = user?.role === 'Manager'
    setIsManager(manager)
    if (!manager) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('signage_submissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast(error.message || 'Could not load submissions', 'error')
    } else {
      setSubmissions((data as SignageSubmission[]) ?? [])
      const edits: Record<string, { start: string; end: string }> = {}
      for (const row of data ?? []) {
        edits[row.id] = { start: row.start_date, end: row.end_date }
      }
      setDateEdits(edits)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    pending: submissions.filter(s => s.status === 'pending').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  }), [submissions])

  const filtered = useMemo(
    () => submissions.filter(s => s.status === tab),
    [submissions, tab],
  )

  const copyLink = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast(`${label} copied`, 'success')
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  const patchSubmission = async (
    id: string,
    body: Record<string, unknown>,
    successMsg: string,
  ) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/signage-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        toast(data.error || 'Action failed', 'error')
        return
      }
      toast(successMsg, 'success')
      setRejectOpenId(null)
      setRejectReason('')
      await load()
    } catch {
      toast('Request failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const deleteSubmission = async (id: string) => {
    if (!(await confirmDialog({ message: 'Delete this submission and remove its image file?', tone: 'danger' }))) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/signage-submissions/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        toast(data.error || 'Delete failed', 'error')
        return
      }
      toast('Submission deleted', 'success')
      await load()
    } catch {
      toast('Request failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <Loader />

  if (!isManager) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ color: muted, fontSize: '15px' }}>Managers only.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 0 32px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: '0 0 6px' }}>Signage submissions</h1>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 20px', lineHeight: 1.5 }}>
        Review district image submissions for the CSDtv office digital signage slideshow.
      </p>

      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Public links</h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: '13px', color: muted, minWidth: '100px' }}>Submit form</span>
            <code style={{ fontSize: '13px', color: text, flex: 1, wordBreak: 'break-all' as const }}>{SIGNAGE_SUBMIT_URL}</code>
            <button
              type="button"
              onClick={() => void copyLink(SIGNAGE_SUBMIT_URL, 'Submit form URL')}
              style={{ minHeight: '44px', padding: '0 14px', borderRadius: '10px', border: `0.5px solid ${border}`, background: inputBg, color: text, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}
            >
              Copy
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: '13px', color: muted, minWidth: '100px' }}>Slideshow</span>
            <code style={{ fontSize: '13px', color: text, flex: 1, wordBreak: 'break-all' as const }}>{SIGNAGE_SLIDESHOW_URL}</code>
            <button
              type="button"
              onClick={() => void copyLink(SIGNAGE_SLIDESHOW_URL, 'Slideshow URL')}
              style={{ minHeight: '44px', padding: '0 14px', borderRadius: '10px', border: `0.5px solid ${border}`, background: inputBg, color: text, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
        {(['pending', 'approved', 'rejected'] as Tab[]).map(t => {
          const active = tab === t
          const pill = statusColor(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                minHeight: '44px',
                padding: '0 16px',
                borderRadius: '10px',
                border: active ? `0.5px solid ${pill.color}` : `0.5px solid ${border}`,
                background: active ? pill.bg : cardBg,
                color: active ? pill.color : muted,
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                textTransform: 'capitalize' as const,
              }}
            >
              {t} ({counts[t]})
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: muted, fontSize: '15px' }}>No {tab} submissions.</p>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {filtered.map(row => {
            const publicUrl = signageSubmissionPublicUrl(row.image_path)
            const dates = dateEdits[row.id] ?? { start: row.start_date, end: row.end_date }
            const pill = statusColor(row.status)
            const busy = busyId === row.id

            return (
              <div
                key={row.id}
                style={{
                  background: cardBg,
                  border: `0.5px solid ${border}`,
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ maxWidth: '280px' }}>
                  <img
                    src={publicUrl}
                    alt={row.caption || 'Submission'}
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      objectFit: 'contain',
                      background: '#000',
                      borderRadius: '10px',
                      display: 'block',
                    }}
                  />
                </a>
                <div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: text }}>
                      {row.caption || 'Untitled'}
                    </span>
                    <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: pill.bg, color: pill.color, textTransform: 'capitalize' as const }}>
                      {row.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '14px', color: text, margin: '0 0 4px' }}>
                    {row.submitter_name} · <a href={`mailto:${row.submitter_email}`} style={{ color: '#5ba3e0' }}>{row.submitter_email}</a>
                  </p>
                  {row.department && (
                    <p style={{ fontSize: '14px', color: muted, margin: '0 0 4px' }}>{row.department}</p>
                  )}
                  <p style={{ fontSize: '14px', color: muted, margin: '0 0 4px' }}>
                    Run window: {row.start_date} → {row.end_date}
                  </p>
                  <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>
                    Submitted {formatDate(row.created_at)}
                  </p>
                  {row.notes && (
                    <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px', lineHeight: 1.45 }}>{row.notes}</p>
                  )}
                  {row.status === 'rejected' && row.reject_reason && (
                    <p style={{ fontSize: '13px', color: '#ef4444', margin: '0 0 12px' }}>Reason: {row.reject_reason}</p>
                  )}

                  {row.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '12px' }}>
                      <label style={{ display: 'grid', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: muted }}>Start</span>
                        <input
                          type="date"
                          value={dates.start}
                          onChange={e => setDateEdits(prev => ({
                            ...prev,
                            [row.id]: { ...dates, start: e.target.value },
                          }))}
                          style={{ ...inputStyle, width: 'auto' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: muted }}>End</span>
                        <input
                          type="date"
                          value={dates.end}
                          onChange={e => setDateEdits(prev => ({
                            ...prev,
                            [row.id]: { ...dates, end: e.target.value },
                          }))}
                          style={{ ...inputStyle, width: 'auto' }}
                        />
                      </label>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                    {row.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchSubmission(row.id, {
                            action: 'approve',
                            start_date: dates.start,
                            end_date: dates.end,
                          }, 'Approved')}
                          style={{
                            minHeight: '44px',
                            padding: '0 16px',
                            borderRadius: '10px',
                            border: 'none',
                            background: '#22c55e',
                            color: '#fff',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRejectOpenId(rejectOpenId === row.id ? null : row.id)
                            setRejectReason('')
                          }}
                          style={{
                            minHeight: '44px',
                            padding: '0 16px',
                            borderRadius: '10px',
                            border: `0.5px solid ${border}`,
                            background: 'transparent',
                            color: '#ef4444',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            cursor: busy ? 'wait' : 'pointer',
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteSubmission(row.id)}
                      style={{
                        minHeight: '44px',
                        padding: '0 16px',
                        borderRadius: '10px',
                        border: `0.5px solid ${border}`,
                        background: 'transparent',
                        color: muted,
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        cursor: busy ? 'wait' : 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  {rejectOpenId === row.id && (
                    <div style={{ marginTop: '12px', display: 'grid', gap: '8px', maxWidth: '420px' }}>
                      <input
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Optional reason for rejection"
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void patchSubmission(row.id, {
                          action: 'reject',
                          reject_reason: rejectReason,
                        }, 'Rejected')}
                        style={{
                          minHeight: '44px',
                          padding: '0 16px',
                          borderRadius: '10px',
                          border: 'none',
                          background: '#ef4444',
                          color: '#fff',
                          fontFamily: 'inherit',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: busy ? 'wait' : 'pointer',
                          justifySelf: 'start',
                        }}
                      >
                        Confirm reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
