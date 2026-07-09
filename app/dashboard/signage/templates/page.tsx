'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { SignageDeleteButton, SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

type Template = {
  id: string
  name: string
  description: string | null
  category: string
  kind: string
  thumbnail_url: string | null
  auto_rebrand: boolean
  singleton: boolean
  requires_url: boolean
  all_sites: boolean
  active: boolean
  sort_order: number
  site_ids: string[]
}

// Kinds available to author in Phase 1 (the live/dynamic blocks that render today).
const KINDS: { value: string; label: string; singleton: boolean; requires_url: boolean }[] = [
  { value: 'broadcast_board', label: "What's coming up on air (broadcasts)", singleton: true, requires_url: false },
  { value: 'national_day', label: 'National Day of the day', singleton: true, requires_url: false },
  { value: 'calendar', label: 'Calendar (ICS/iCal link)', singleton: false, requires_url: true },
  { value: 'website', label: 'Website preview', singleton: false, requires_url: true },
]

const EMPTY: Omit<Template, 'id'> = {
  name: '', description: '', category: 'Live', kind: 'broadcast_board', thumbnail_url: null,
  auto_rebrand: true, singleton: true, requires_url: false, all_sites: true, active: true, sort_order: 100, site_ids: [],
}

export default function SignageTemplatesPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const { sites } = useSignage()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Omit<Template, 'id'>>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/signage/templates?admin=1')
    const data = await res.json().catch(() => ({}))
    setTemplates(data.templates || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const reset = () => { setForm(EMPTY); setEditId(null); setShowForm(false) }

  const startEdit = (t: Template) => {
    setEditId(t.id)
    setForm({ ...t })
    setShowForm(true)
  }

  const onKindChange = (kind: string) => {
    const k = KINDS.find(x => x.value === kind)
    setForm(f => ({ ...f, kind, singleton: k?.singleton ?? false, requires_url: k?.requires_url ?? false }))
  }

  const toggleSite = (id: string) => {
    setForm(f => ({ ...f, site_ids: f.site_ids.includes(id) ? f.site_ids.filter(x => x !== id) : [...f.site_ids, id] }))
  }

  const save = async () => {
    if (!form.name.trim()) { toast('Name is required', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/signage/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, ...form } : form),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    toast('Saved', 'success')
    reset()
    await load()
  }

  const siteName = (id: string) => sites.find(x => x.id === id)?.name ?? '—'
  const availability = (t: Template) => t.all_sites ? 'All locations' : t.site_ids.length ? `${t.site_ids.length} location${t.site_ids.length === 1 ? '' : 's'}` : 'Not assigned'

  return (
    <SignagePageShell title="Templates" subtitle="Shared content library for every location">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12.5, color: s.muted, maxWidth: 620, lineHeight: 1.5 }}>
          Build templates once and share them with the locations that should have them. Assigned templates appear under &ldquo;Templates&rdquo; on each location&rsquo;s Content page, auto-branded to that location.
        </div>
        <button type="button" onClick={() => { reset(); setShowForm(v => !v) }} style={s.btnPrimary}>{showForm ? 'Cancel' : '+ New template'}</button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>{editId ? 'Edit template' : 'New template'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            <div>
              <p style={s.lbl}>Name</p>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Category</p>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Type</p>
              <select value={form.kind} onChange={e => onKindChange(e.target.value)} style={s.input}>
                {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div style={{ width: 100 }}>
              <p style={s.lbl}>Sort</p>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} style={s.input} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <p style={s.lbl}>Description</p>
            <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...s.input, height: 'auto', padding: '8px 10px' }} />
          </div>

          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.all_sites} onChange={e => setForm(f => ({ ...f, all_sites: e.target.checked }))} /> Available to all locations
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.auto_rebrand} onChange={e => setForm(f => ({ ...f, auto_rebrand: e.target.checked }))} /> Auto-rebrand per location
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Active
            </label>
          </div>

          {!form.all_sites && (
            <div style={{ marginTop: 12 }}>
              <p style={s.lbl}>Share with locations</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {sites.map(si => (
                  <label key={si.id} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${s.border}`, borderRadius: 999, padding: '4px 11px', cursor: 'pointer', color: s.text }}>
                    <input type="checkbox" checked={form.site_ids.includes(si.id)} onChange={() => toggleSite(si.id)} /> {si.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={reset} style={s.btn}>Cancel</button>
            {editId && (
              <SignageDeleteButton
                confirmMessage={`Delete template "${form.name}"? Locations already using it keep their content.`}
                onConfirm={async () => { const res = await fetch(`/api/signage/templates?id=${editId}`, { method: 'DELETE' }); if (res.ok) { toast('Deleted', 'success'); reset(); await load() } else { toast('Delete failed', 'error') } }}
              />
            )}
            <button type="button" onClick={() => void save()} disabled={saving} style={s.btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      ) : !templates.length ? (
        <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No templates yet.</div>
      ) : (
        <table style={s.tbl}>
          <thead><tr><th style={s.th}>Name</th><th style={s.th}>Type</th><th style={s.th}>Shared with</th><th style={s.th}>Active</th></tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td style={s.td}>
                  <button type="button" onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', color: s.text, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0, textAlign: 'left' }}>{t.name}</button>
                  {t.description && <div style={{ fontSize: 11.5, color: s.muted, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>}
                </td>
                <td style={s.tdMuted}>{KINDS.find(k => k.value === t.kind)?.label.split(' (')[0] ?? t.kind}</td>
                <td style={s.tdMuted}>{availability(t)}{!t.all_sites && t.site_ids.length > 0 && t.site_ids.length <= 2 ? ` · ${t.site_ids.map(siteName).join(', ')}` : ''}</td>
                <td style={s.tdMuted}>{t.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SignagePageShell>
  )
}
