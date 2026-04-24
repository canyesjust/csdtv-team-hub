'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'

interface Contact {
  id: string; name: string; title: string | null; organization: string | null
  email: string | null; phone: string | null; website: string | null
  notes: string | null; tags: string[]; follow_up_status: string
  starred: boolean; card_image_url: string | null; created_at: string
}

const TAG_OPTIONS = ['vendor', 'speaker', 'partner', 'follow up', 'equipment', 'education', 'media', 'other']
const FOLLOW_UP = ['none', 'need to contact', 'contacted', 'done']

export default function ContactsPage() {
  const supabase = createClient()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#e8edf5' : '#1a1f36'
  const muted = dark ? '#6b7a94' : '#64748b'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : '#f8fafc'
  const inputBg = dark ? '#1a2540' : '#f1f5f9'
  const inputStyle: React.CSSProperties = { width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '15px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', title: '', organization: '', email: '', phone: '', website: '', notes: '', tags: [] as string[], follow_up_status: 'none' })
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: user } = await supabase.from('team').select('id').eq('supabase_user_id', session.user.id).single()
    if (user) setCurrentUser(user)
    const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
    setContacts(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleScan = async (file: File) => {
    setScanning(true)
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { toast('Session expired. Please refresh.', 'error'); setScanning(false); return }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/scan-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ image: base64, media_type: file.type || 'image/jpeg' }),
      })
      const result = await res.json()
      if (result.success && result.contact) {
        setForm({ name: result.contact.name || '', title: result.contact.title || '', organization: result.contact.organization || '', email: result.contact.email || '', phone: result.contact.phone || '', website: result.contact.website || '', notes: '', tags: [], follow_up_status: 'none' })
        setShowAdd(true)
        setEditingId(null)
      } else {
        toast(result.error || 'Failed to scan card.', 'error')
      }
    } catch { toast('Scan failed. Please try again.', 'error') }
    setScanning(false)
  }

  const saveContact = async () => {
    if (!form.name || !currentUser) return
    setSaving(true)
    if (editingId) {
      await supabase.from('contacts').update({ name: form.name, title: form.title || null, organization: form.organization || null, email: form.email || null, phone: form.phone || null, website: form.website || null, notes: form.notes || null, tags: form.tags, follow_up_status: form.follow_up_status }).eq('id', editingId)
    } else {
      await supabase.from('contacts').insert({ name: form.name, title: form.title || null, organization: form.organization || null, email: form.email || null, phone: form.phone || null, website: form.website || null, notes: form.notes || null, tags: form.tags, follow_up_status: form.follow_up_status, created_by: currentUser.id })
    }
    setForm({ name: '', title: '', organization: '', email: '', phone: '', website: '', notes: '', tags: [], follow_up_status: 'none' })
    setShowAdd(false); setEditingId(null); setSaving(false)
    loadData()
  }

  const toggleStar = async (c: Contact) => {
    await supabase.from('contacts').update({ starred: !c.starred }).eq('id', c.id)
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, starred: !x.starred } : x))
  }

  const deleteContact = async (id: string) => {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    setExpandedId(null)
  }

  const editContact = (c: Contact) => {
    setForm({ name: c.name, title: c.title || '', organization: c.organization || '', email: c.email || '', phone: c.phone || '', website: c.website || '', notes: c.notes || '', tags: c.tags || [], follow_up_status: c.follow_up_status || 'none' })
    setEditingId(c.id); setShowAdd(true)
  }

  const toggleTag = (tag: string) => setForm(prev => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag] }))

  const filtered = contacts.filter(c => {
    if (search) { const s = search.toLowerCase(); if (!c.name.toLowerCase().includes(s) && !(c.organization || '').toLowerCase().includes(s) && !(c.email || '').toLowerCase().includes(s)) return false }
    if (filterTag && !(c.tags || []).includes(filterTag)) return false
    if (filterStatus && c.follow_up_status !== filterStatus) return false
    return true
  })
  const sorted = [...filtered.filter(c => c.starred), ...filtered.filter(c => !c.starred)]

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: muted }}>Loading...</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: text }}>Contacts</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', cursor: scanning ? 'wait' : 'pointer', fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', opacity: scanning ? 0.7 : 1 }}>
            {scanning ? 'Scanning...' : '📷 Scan card'}
            <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) handleScan(e.target.files[0]); e.target.value = '' }} style={{ display: 'none' }} disabled={scanning} />
          </label>
          <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', title: '', organization: '', email: '', phone: '', website: '', notes: '', tags: [], follow_up_status: 'none' }) }} style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>+ Quick add</button>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: 0 }}>{editingId ? 'Edit contact' : 'New contact'}</h2>
            <button onClick={() => { setShowAdd(false); setEditingId(null) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', padding: '4px 8px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <div><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" style={inputStyle} /></div>
            <div><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Title</label><input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Job title" style={inputStyle} /></div>
            <div><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Organization</label><input value={form.organization} onChange={e => setForm(p => ({ ...p, organization: e.target.value }))} placeholder="Company" style={inputStyle} /></div>
            <div><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Email</label><input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" type="email" style={inputStyle} /></div>
            <div><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" type="tel" style={inputStyle} /></div>
            <div><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Website</label><input value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} placeholder="website.com" style={inputStyle} /></div>
          </div>
          <div style={{ marginBottom: '10px' }}><label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Notes</label><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Where you met, what you discussed..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '6px' }}>Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {TAG_OPTIONS.map(tag => (<button key={tag} onClick={() => toggleTag(tag)} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '20px', border: `0.5px solid ${form.tags.includes(tag) ? '#1e6cb5' : border}`, background: form.tags.includes(tag) ? 'rgba(30,108,181,0.15)' : 'transparent', color: form.tags.includes(tag) ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit' }}>{tag}</button>))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={form.follow_up_status} onChange={e => setForm(p => ({ ...p, follow_up_status: e.target.value }))} style={{ ...inputStyle, width: 'auto', maxWidth: '200px' }}>
              {FOLLOW_UP.map(s => <option key={s} value={s}>{s === 'none' ? 'No follow-up needed' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setShowAdd(false); setEditingId(null) }} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={saveContact} disabled={!form.name || saving} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: form.name ? '#1e6cb5' : (dark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'), color: form.name ? '#fff' : muted, border: 'none', cursor: form.name ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Save contact'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, org, email..." style={{ ...inputStyle, flex: '1 1 200px', minWidth: '160px' }} />
        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 1 140px' }}><option value="">All tags</option>{TAG_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 1 160px' }}><option value="">All status</option>{FOLLOW_UP.filter(s => s !== 'none').map(s => <option key={s} value={s}>{s}</option>)}</select>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
          <p style={{ fontSize: '18px', margin: '0 0 6px' }}>No contacts yet</p>
          <p style={{ fontSize: '14px' }}>Scan a business card or add one manually</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sorted.map(c => {
            const isExpanded = expandedId === c.id
            const statusColors: Record<string, string> = { 'need to contact': '#f59e0b', 'contacted': '#60b8f0', 'done': '#22c55e' }
            const sc = statusColors[c.follow_up_status] || ''
            return (
              <div key={c.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                <div onClick={() => setExpandedId(isExpanded ? null : c.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                  <button onClick={e => { e.stopPropagation(); toggleStar(c) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: 0, lineHeight: 1, minWidth: '24px' }}>{c.starred ? '⭐' : '☆'}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: text }}>{c.name}</span>
                      {c.organization && <span style={{ fontSize: '13px', color: muted }}>· {c.organization}</span>}
                    </div>
                    {c.title && <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0' }}>{c.title}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {(c.tags || []).slice(0, 2).map(t => (<span key={t} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(30,108,181,0.1)', color: '#5ba3e0' }}>{t}</span>))}
                    {sc && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: `${sc}20`, color: sc }}>{c.follow_up_status}</span>}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: `0.5px solid ${border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px 0' }}>
                      {c.email && <div><span style={{ fontSize: '11px', color: muted }}>Email</span><br /><a href={`mailto:${c.email}`} style={{ fontSize: '14px', color: '#5ba3e0', textDecoration: 'none' }}>{c.email}</a></div>}
                      {c.phone && <div><span style={{ fontSize: '11px', color: muted }}>Phone</span><br /><a href={`tel:${c.phone}`} style={{ fontSize: '14px', color: '#5ba3e0', textDecoration: 'none' }}>{c.phone}</a></div>}
                      {c.website && <div><span style={{ fontSize: '11px', color: muted }}>Website</span><br /><a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#5ba3e0', textDecoration: 'none' }}>{c.website}</a></div>}
                    </div>
                    {c.notes && <p style={{ fontSize: '14px', color: text, margin: '0 0 10px', padding: '8px 12px', background: dark ? 'rgba(255,255,255,0.03)' : '#f1f5f9', borderRadius: '8px' }}>{c.notes}</p>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => editContact(c)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                      <button onClick={() => deleteContact(c.id)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: '0.5px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                      <span style={{ fontSize: '12px', color: muted, flex: 1, textAlign: 'right', alignSelf: 'center' }}>Added {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}