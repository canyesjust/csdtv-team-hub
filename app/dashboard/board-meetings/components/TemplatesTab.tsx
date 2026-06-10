'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'

type TemplateRow = {
  id: string
  name: string
  description: string | null
  is_default: boolean
  loop_behavior: string
  item_count: number
  created_at: string
}

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '44px',
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/playlist-templates')
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load templates', 'error')
      setLoading(false)
      return
    }
    setTemplates(body.templates || [])
    setLoading(false)
  }, [])

  useEffect(() => { setLoading(true); load() }, [load])

  const createTemplate = async () => {
    if (!name.trim()) return
    setSaving(true)
    const res = await fetch('/api/playlist-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    })
    const body = await res.json()
    setSaving(false)
    if (!res.ok) {
      toast(body.error || 'Create failed', 'error')
      return
    }
    toast('Template created', 'success')
    setModalOpen(false)
    setName('')
    setDescription('')
    window.location.href = `/dashboard/board-meetings/templates/${body.template.id}`
  }

  const duplicate = async (id: string) => {
    const res = await fetch(`/api/playlist-templates/${id}/duplicate`, { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Duplicate failed', 'error')
      return
    }
    toast('Duplicated', 'success')
    await load()
  }

  const setDefault = async (id: string) => {
    const res = await fetch(`/api/playlist-templates/${id}/set-default`, { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed', 'error')
      return
    }
    toast('Default template updated', 'success')
    await load()
  }

  const remove = async (t: TemplateRow) => {
    if (!(await confirmDialog({ message: `Delete template "${t.name}"?`, tone: 'danger' }))) return
    const res = await fetch(`/api/playlist-templates/${t.id}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Delete failed', 'error')
      return
    }
    toast('Deleted', 'success')
    await load()
  }

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <p style={{ margin: 0, fontSize: '14px', color: muted }}>Reusable pre-roll playlists. Apply to any meeting from the production Board Meeting tab.</p>
        <button type="button" onClick={() => setModalOpen(true)} style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>New template</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {templates.map(t => (
          <div key={t.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px' }}>
            <div>
              <Link href={`/dashboard/board-meetings/templates/${t.id}`} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--brand-primary)', textDecoration: 'none' }}>{t.name}</Link>
              {t.is_default && <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(30,108,181,0.15)', color: 'var(--brand-primary)' }}>Default</span>}
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>{t.item_count} items · {t.loop_behavior === 'loop_all' ? 'Loops' : 'Play once'}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Link href={`/dashboard/board-meetings/templates/${t.id}`} style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: `0.5px solid ${border}`, color: text, textDecoration: 'none' }}>Edit</Link>
              <button type="button" onClick={() => duplicate(t.id)} style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Duplicate</button>
              {!t.is_default && (
                <button type="button" onClick={() => setDefault(t.id)} style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Set default</button>
              )}
              <button type="button" onClick={() => remove(t)} style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && <p style={{ color: muted, fontSize: '14px' }}>No templates yet.</p>}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }} onClick={() => !saving && setModalOpen(false)}>
          <div style={{ background: cardBg, borderRadius: '12px', padding: '20px', maxWidth: '420px', width: '100%', border: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', color: text }}>New playlist template</h3>
            <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }} />
            <input placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" disabled={saving} onClick={() => setModalOpen(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="button" disabled={saving || !name.trim()} onClick={createTemplate} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#1e6cb5', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
