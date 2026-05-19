'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import type { AttendanceStatus } from '@/lib/board-meetings/motion-types'

type AttendanceRecord = {
  person_id: string
  name: string
  status: AttendanceStatus
  arrived_at: string | null
  left_at: string | null
  notes: string | null
}

type AttendanceData = {
  records: AttendanceRecord[]
  quorum: { threshold: number; present_count: number; quorum_met: boolean }
}

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'remote', label: 'Remote' },
  { value: 'left_early', label: 'Left early' },
  { value: 'arrived_late', label: 'Arrived late' },
]

type ChipProps = {
  attendance: Pick<AttendanceData, 'quorum'>
  quorumNeeded: number
  canEdit: boolean
  onMark: () => void
}

type FullProps = {
  productionId: string
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  onQuorumChange?: (q: AttendanceData['quorum']) => void
}

export default function AttendancePanel(props: ChipProps | FullProps) {
  if ('onMark' in props) {
    const { attendance, quorumNeeded, canEdit, onMark } = props
    const met = attendance.quorum.quorum_met
    return (
      <button
        type="button"
        className="cs-touchbtn"
        onClick={onMark}
        disabled={!canEdit}
        style={{ fontSize: 11, padding: '4px 10px', minHeight: 32 }}
      >
        {attendance.quorum.present_count}/{quorumNeeded} quorum{met ? ' ✓' : ''}
      </button>
    )
  }

  return <AttendancePanelFull {...props} />
}

function AttendancePanelFull({
  productionId,
  disabled,
  open: openProp,
  onOpenChange,
  hideTrigger,
  onQuorumChange,
}: FullProps) {
  const [openInternal, setOpenInternal] = useState(false)
  const open = openProp ?? openInternal
  const setOpen = (v: boolean) => {
    setOpenInternal(v)
    onOpenChange?.(v)
  }

  useEffect(() => {
    if (openProp) setOpenInternal(true)
  }, [openProp])
  const [data, setData] = useState<AttendanceData | null>(null)
  const [draft, setDraft] = useState<AttendanceRecord[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/attendance`)
    const body = await res.json()
    if (res.ok) {
      setData(body)
      onQuorumChange?.(body.quorum)
    }
  }, [productionId, onQuorumChange])

  useEffect(() => { load() }, [load])

  const openModal = () => {
    if (data) setDraft(data.records.map(r => ({ ...r })))
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: draft.map(r => ({
            person_id: r.person_id,
            status: r.status,
            arrived_at: r.arrived_at,
            left_at: r.left_at,
            notes: r.notes,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Failed to save attendance', 'error')
        return
      }
      setData(body)
      onQuorumChange?.(body.quorum)
      setOpen(false)
      toast('Attendance saved', 'success')
    } finally {
      setSaving(false)
    }
  }

  const q = data?.quorum
  const text = 'var(--text-primary)'
  const border = 'var(--border-subtle)'

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          disabled={disabled}
          onClick={openModal}
          style={{
            fontSize: '13px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: `0.5px solid ${border}`,
            background: 'var(--surface-1)',
            color: text,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Mark attendance
        </button>
      )}
      {q && !hideTrigger && (
        <span style={{ fontSize: '13px', color: q.quorum_met ? '#166534' : '#b45309', marginLeft: '8px' }}>
          {q.present_count} present · quorum {q.quorum_met ? 'met' : 'not met'} ({q.threshold} needed)
        </span>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px', color: text }}>Meeting attendance</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {draft.map((r, i) => (
              <li key={r.person_id} style={{ padding: '10px 0', borderBottom: `0.5px solid ${border}` }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600, color: text }}>{r.name}</p>
                <select
                  value={r.status}
                  onChange={e => {
                    const next = [...draft]
                    next[i] = { ...r, status: e.target.value as AttendanceStatus }
                    setDraft(next)
                  }}
                  style={{ width: '100%', padding: '10px', fontSize: '14px', borderRadius: '8px', border: `0.5px solid ${border}` }}
                >
                  {STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <ModalActions border={border} text={text} saving={saving} onCancel={() => setOpen(false)} onSave={save} />
        </Modal>
      )}
    </>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-1)',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          border: '0.5px solid var(--border-subtle)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function ModalActions({
  border,
  text,
  saving,
  onCancel,
  onSave,
}: {
  border: string
  text: string
  saving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
      <button type="button" onClick={onCancel} style={secondaryBtn(border, text)}>Cancel</button>
      <button type="button" disabled={saving} onClick={onSave} style={primaryBtn()}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}

function primaryBtn(): React.CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#1e6cb5',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

function secondaryBtn(border: string, text: string): React.CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: '8px',
    border: `0.5px solid ${border}`,
    background: 'transparent',
    color: text,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
