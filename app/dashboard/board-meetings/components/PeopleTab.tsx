'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { confirmDialog } from '@/lib/confirm'
import FilePickButton from '@/components/FilePickButton'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import type { LowerThirdPerson } from '@/lib/board-meetings/types'

const CATEGORIES = [
  { value: 'board_member', label: 'Board member' },
  { value: 'staff', label: 'Staff' },
  { value: 'presenter', label: 'Presenter' },
  { value: 'other', label: 'Other' },
]

const emptyForm = {
  display_name: '',
  primary_title: '',
  affiliation: '',
  category: 'presenter',
  officer_position: '',
  is_active: true,
  photo_path: '',
}

export default function PeopleTab() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [people, setPeople] = useState<LowerThirdPerson[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importing, setImporting] = useState(false)

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

  const photoUrl = (path: string | null) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return base ? `${base}/storage/v1/object/public/lower-third-photos/${path}` : null
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    const q = new URLSearchParams()
    if (categoryFilter !== 'all') q.set('category', categoryFilter)
    if (debouncedSearch.trim()) q.set('search', debouncedSearch.trim())
    const res = await fetch(`/api/lower-third-people?${q}`)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load people', 'error')
      setInitialLoading(false)
      setRefreshing(false)
      return
    }
    setPeople(body.people || [])
    setInitialLoading(false)
    setRefreshing(false)
  }, [categoryFilter, debouncedSearch])

  useEffect(() => {
    setRefreshing(true)
    load()
  }, [load])

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (p: LowerThirdPerson) => {
    setEditingId(p.id)
    setForm({
      display_name: p.display_name,
      primary_title: p.primary_title || '',
      affiliation: p.affiliation || '',
      category: p.category,
      officer_position: p.officer_position || '',
      is_active: p.is_active,
      photo_path: p.photo_path || '',
    })
    setModalOpen(true)
  }

  const uploadPhoto = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('photo', file)
    const res = await fetch('/api/lower-third-people/upload-photo', { method: 'POST', body: fd })
    const body = await res.json()
    setUploading(false)
    if (!res.ok) {
      toast(body.error || 'Upload failed', 'error')
      return
    }
    setForm(f => ({ ...f, photo_path: body.path }))
    toast('Photo uploaded', 'success')
  }

  const save = async () => {
    if (!form.display_name.trim()) {
      toast('Display name is required', 'error')
      return
    }
    setSaving(true)
    const payload = {
      display_name: form.display_name.trim(),
      primary_title: form.primary_title.trim() || null,
      affiliation: form.affiliation.trim() || null,
      category: form.category,
      officer_position: form.officer_position.trim() || null,
      is_active: form.is_active,
      photo_path: form.photo_path || null,
    }
    const res = editingId
      ? await fetch(`/api/lower-third-people/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/lower-third-people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await res.json()
    setSaving(false)
    if (!res.ok) {
      toast(body.error || 'Save failed', 'error')
      return
    }
    toast(editingId ? 'Person updated' : 'Person added', 'success')
    setModalOpen(false)
    load()
  }

  const runImport = async () => {
    if (!importCsv.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/lower-third-people/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsv }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Import failed', 'error')
        return
      }
      const parts = [
        body.created ? `${body.created} added` : null,
        body.matched_existing ? `${body.matched_existing} matched existing` : null,
        body.updated ? `${body.updated} updated` : null,
        body.skipped ? `${body.skipped} skipped` : null,
      ].filter(Boolean)
      toast(parts.length ? parts.join(', ') : 'Import complete', 'success')
      if (body.errors?.length) {
        console.warn('People import warnings:', body.errors)
      }
      setImportOpen(false)
      setImportCsv('')
      load()
    } finally {
      setImporting(false)
    }
  }

  const remove = async (id: string) => {
    if (!(await confirmDialog({ message: 'Delete this person?', tone: 'danger' }))) return
    const res = await fetch(`/api/lower-third-people/${id}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Delete failed', 'error')
      return
    }
    toast('Deleted', 'success')
    load()
  }

  if (initialLoading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search people..."
          style={{ ...inputStyle, flex: '1 1 200px', maxWidth: '320px' }}
          aria-busy={refreshing}
        />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 0 auto' }}>
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'transparent', color: text, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={openAdd}
          style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}
        >
          Add person
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {people.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => openEdit(p)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              background: cardBg,
              border: `0.5px solid ${border}`,
              borderRadius: '10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              minHeight: '44px',
              width: '100%',
            }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: inputBg, overflow: 'hidden', flexShrink: 0 }}>
              {photoUrl(p.photo_path) ? (
                <img src={photoUrl(p.photo_path)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, color: muted }}>
                  {p.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: text, fontSize: '15px' }}>{p.display_name}</div>
              <div style={{ fontSize: '13px', color: muted }}>{p.primary_title || '—'}{p.affiliation ? ` · ${p.affiliation}` : ''}</div>
            </div>
            <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.06)' : '#eef2f7', color: muted, textTransform: 'capitalize' }}>
              {p.category.replace('_', ' ')}
            </span>
          </button>
        ))}
      </div>

      {importOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setImportOpen(false) }}
        >
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 8px', color: text }}>Import people from CSV</h2>
            <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px', lineHeight: 1.45 }}>
              Paste CSV with a header row. Columns: Display Name, Title, Affiliation, Category, Officer Position (board members only).
              Category values: board_member, staff, presenter, other.
            </p>
            <textarea
              value={importCsv}
              onChange={e => setImportCsv(e.target.value)}
              placeholder={'Display Name,Title,Affiliation,Category,Officer Position\nJane Doe,Principal,...'}
              rows={12}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '200px', fontFamily: 'ui-monospace, monospace', fontSize: '13px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button type="button" onClick={runImport} disabled={importing || !importCsv.trim()} style={{ flex: 1, minHeight: '44px', padding: '10px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                {importing ? 'Importing…' : 'Import'}
              </button>
              <button type="button" onClick={() => { setImportOpen(false); setImportCsv('') }} style={{ minHeight: '44px', padding: '10px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 16px', color: text }}>{editingId ? 'Edit person' : 'Add person'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Display name" style={inputStyle} />
              <input value={form.primary_title} onChange={e => setForm({ ...form, primary_title: e.target.value })} placeholder="Primary title" style={inputStyle} />
              <input value={form.affiliation} onChange={e => setForm({ ...form, affiliation: e.target.value })} placeholder="Affiliation" style={inputStyle} />
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {form.category === 'board_member' && (
                <input value={form.officer_position} onChange={e => setForm({ ...form, officer_position: e.target.value })} placeholder="Officer position (optional)" style={inputStyle} />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: muted, minHeight: '44px' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                Active
              </label>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '6px' }}>Photo</label>
                <FilePickButton
                  accept="image/jpeg,image/png,image/webp"
                  label="Choose photo"
                  changeLabel="Change photo"
                  variant="secondary"
                  disabled={uploading}
                  onChange={file => {
                    if (file) uploadPhoto(file)
                  }}
                />
                {uploading && <p style={{ fontSize: '12px', color: muted, margin: '6px 0 0' }}>Uploading…</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button type="button" onClick={save} disabled={saving} style={{ flex: 1, minHeight: '44px', padding: '10px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {editingId && (
                <button type="button" onClick={() => remove(editingId)} style={{ minHeight: '44px', padding: '10px 16px', borderRadius: '8px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete
                </button>
              )}
              <button type="button" onClick={() => setModalOpen(false)} style={{ minHeight: '44px', padding: '10px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
