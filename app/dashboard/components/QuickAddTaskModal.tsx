'use client'

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'

const PRIORITIES = ['low', 'normal', 'high', 'day of'] as const

export interface QuickAddTaskModalProps {
  open: boolean
  onClose: () => void
  currentUser: { id: string; name: string }
  teamMembers: { id: string; name: string }[]
  onCreated?: () => void
}

export function QuickAddTaskModal({
  open,
  onClose,
  currentUser,
  teamMembers,
  onCreated,
}: QuickAddTaskModalProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(currentUser.id)
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<string>('normal')
  const [submitting, setSubmitting] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const surface2 = 'var(--surface-2)'
  const inputBg = dark ? surface2 : 'var(--surface-2)'

  const inputStyle: CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '15px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '40px',
  }

  const resetForm = useCallback(() => {
    setTitle('')
    setAssignee(currentUser.id)
    setDueDate('')
    setPriority('normal')
  }, [currentUser.id])

  useEffect(() => {
    if (open) {
      setAssignee(currentUser.id)
    }
  }, [open, currentUser.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    const { error } = await supabase.from('tasks').insert({
      title: trimmed,
      assigned_to: assignee,
      due_date: dueDate || null,
      priority,
      status: 'pending',
      created_by: currentUser.id,
    })
    setSubmitting(false)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('Task created', 'success')
    onCreated?.()
    resetForm()
    onClose()
  }

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-task-title"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--surface-1)',
          borderRadius: '16px',
          border: `1px solid ${border}`,
          padding: '24px',
        }}
      >
        <h2 id="quick-task-title" style={{ fontSize: '18px', fontWeight: 700, color: text, margin: '0 0 16px' }}>
          New task
        </h2>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>
              Title
            </span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              style={inputStyle}
              autoFocus
              required
            />
          </label>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>
              Assignee
            </span>
            <select value={assignee} onChange={e => setAssignee(e.target.value)} style={inputStyle}>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>
              Due date
            </span>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'block', marginBottom: '20px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>
              Priority
            </span>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
              {PRIORITIES.map(p => (
                <option key={p} value={p}>
                  {p === 'day of' ? 'Day of' : p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                resetForm()
                onClose()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: muted,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '8px 12px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              style={{
                background: 'var(--brand-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: !title.trim() || submitting ? 'not-allowed' : 'pointer',
                opacity: !title.trim() || submitting ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {submitting ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
