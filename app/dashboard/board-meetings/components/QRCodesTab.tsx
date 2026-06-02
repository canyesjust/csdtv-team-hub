'use client'

import { useCallback, useEffect, useState } from 'react'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import {
  BUILTIN_QR_PRESET_KEYS,
  QR_TEMPLATE_VARS,
  type QrPresetRow,
} from '@/lib/board-meetings/qr-presets'

const emptyForm = {
  key: '',
  label: '',
  description: '',
  url_template: '',
  sort_order: 0,
}

export default function QRCodesTab() {
  const [presets, setPresets] = useState<QrPresetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
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
    const res = await fetch('/api/qr-presets')
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load QR presets', 'error')
      setLoading(false)
      return
    }
    setPresets(body.presets || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyForm, sort_order: presets.length + 1 })
    setModalOpen(true)
  }

  const openEdit = (p: QrPresetRow) => {
    setEditingId(p.id)
    setForm({
      key: p.key,
      label: p.label,
      description: p.description || '',
      url_template: p.url_template || '',
      sort_order: p.sort_order,
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.label.trim()) {
      toast('Label is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        label: form.label.trim(),
        description: form.description.trim() || null,
        url_template: form.url_template.trim() || null,
        sort_order: form.sort_order,
        ...(editingId && !BUILTIN_QR_PRESET_KEYS.has(form.key) ? { key: form.key.trim() } : {}),
        ...(!editingId
          ? { key: form.key.trim() }
          : {}),
      }
      const res = await fetch(
        editingId ? `/api/qr-presets/${editingId}` : '/api/qr-presets',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Save failed', 'error')
        return
      }
      toast(editingId ? 'Preset updated' : 'Preset added', 'success')
      setModalOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: QrPresetRow) => {
    if (BUILTIN_QR_PRESET_KEYS.has(p.key)) return
    if (!confirm(`Delete preset “${p.label}”?`)) return
    const res = await fetch(`/api/qr-presets/${p.id}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Delete failed', 'error')
      return
    }
    toast('Preset deleted', 'success')
    await load()
  }

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '14px', color: muted, maxWidth: '560px', lineHeight: 1.5 }}>
            QR presets appear on the control surface when you push a code to the overlay. Use{' '}
            <code style={{ fontSize: '12px' }}>{'{agenda_url}'}</code> in custom templates — each meeting
            supplies its own public agenda link on the Board Meeting tab.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          style={{
            fontSize: '14px',
            padding: '10px 16px',
            minHeight: '44px',
            borderRadius: '10px',
            background: 'var(--brand-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 600,
          }}
        >
          Add preset
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {presets.map(p => {
          const builtin = BUILTIN_QR_PRESET_KEYS.has(p.key)
          return (
            <div
              key={p.id}
              style={{
                padding: '14px 16px',
                background: cardBg,
                border: `0.5px solid ${border}`,
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: text }}>{p.label}</span>
                  <span style={{ fontSize: '11px', color: muted, fontFamily: 'monospace' }}>{p.key}</span>
                  {builtin ? (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--surface-2)',
                        color: muted,
                      }}
                    >
                      Built-in
                    </span>
                  ) : null}
                </div>
                {p.description ? (
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: muted }}>{p.description}</p>
                ) : null}
                {p.url_template ? (
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: '12px',
                      color: text,
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {p.url_template}
                  </p>
                ) : builtin && p.key === 'agenda' ? (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: muted }}>
                    Filled from each meeting&apos;s public agenda URL
                  </p>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  style={{
                    fontSize: '13px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `0.5px solid ${border}`,
                    background: 'transparent',
                    color: text,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
                {!builtin ? (
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    style={{
                      fontSize: '13px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `0.5px solid ${border}`,
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '14px 16px',
          background: cardBg,
          border: `0.5px solid ${border}`,
          borderRadius: '10px',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: text }}>Template variables</p>
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: muted, lineHeight: 1.6 }}>
          {QR_TEMPLATE_VARS.map(v => (
            <li key={v.key}>
              <code>{`{${v.key}}`}</code> — {v.label}
            </li>
          ))}
        </ul>
      </div>

      {modalOpen ? (
        <div
          role="presentation"
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
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
              background: cardBg,
              border: `0.5px solid ${border}`,
              borderRadius: '12px',
              padding: '20px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: text }}>
              {editingId ? 'Edit QR preset' : 'Add QR preset'}
            </h3>
            {!editingId || !BUILTIN_QR_PRESET_KEYS.has(form.key) ? (
              <label style={{ display: 'block', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Key</span>
                <input
                  style={inputStyle}
                  value={form.key}
                  disabled={!!editingId && BUILTIN_QR_PRESET_KEYS.has(form.key)}
                  onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                  placeholder="my_custom_link"
                />
              </label>
            ) : null}
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Label</span>
              <input
                style={inputStyle}
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </label>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>
                Description (optional)
              </span>
              <input
                style={inputStyle}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </label>
            {(!editingId || !BUILTIN_QR_PRESET_KEYS.has(form.key) || form.key === 'agenda') &&
            (!BUILTIN_QR_PRESET_KEYS.has(form.key) || form.key !== 'document_current_item') &&
            form.key !== 'youtube_live' ? (
              <label style={{ display: 'block', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>
                  URL template (optional for built-in agenda)
                </span>
                <input
                  style={inputStyle}
                  value={form.url_template}
                  disabled={
                    !!editingId &&
                    (form.key === 'document_current_item' || form.key === 'youtube_live' || form.key === 'agenda')
                  }
                  onChange={e => setForm(f => ({ ...f, url_template: e.target.value }))}
                  placeholder="https://example.com/page/{production_number}"
                />
              </label>
            ) : null}
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Sort order</span>
              <input
                type="number"
                style={inputStyle}
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  fontSize: '14px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: `0.5px solid ${border}`,
                  background: 'transparent',
                  color: text,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{
                  fontSize: '14px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--brand-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
