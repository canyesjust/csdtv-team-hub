'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { confirmDialog } from '@/lib/confirm'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'

interface Contact {
  id: string; name: string; title: string | null; organization: string | null
  email: string | null; phone: string | null; website: string | null
  notes: string | null; tags: string[]; follow_up_status: string
  starred: boolean; card_image_url: string | null; created_at: string
  // Phase 1 additions (read-only fields are maintained by the DB):
  last_contacted_at: string | null; next_follow_up_date: string | null
  lifecycle_state?: string; source?: string
}

interface Interaction {
  id: string; contact_id: string; interaction_type: string
  occurred_at: string; summary: string | null; direction: string | null
  source: string; review_state: string; created_at: string
}

const TAG_OPTIONS = ['vendor', 'speaker', 'partner', 'follow up', 'equipment', 'education', 'media', 'other']
const FOLLOW_UP = ['none', 'need to contact', 'contacted', 'done']
// Types offered when logging a manual interaction (mass_email is Phase 2 only).
const LOG_TYPES = ['note', 'email', 'call', 'meeting', 'text']
const TYPE_META: Record<string, { label: string; icon: string }> = {
  note: { label: 'Note', icon: '📝' }, email: { label: 'Email', icon: '✉️' },
  call: { label: 'Call', icon: '📞' }, meeting: { label: 'Meeting', icon: '🤝' },
  text: { label: 'Text', icon: '💬' }, mass_email: { label: 'Mass email', icon: '📢' },
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalDatetimeInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// Relative "last contacted" label from an ISO timestamp.
const relativeDate = (iso: string) => {
  const then = new Date(iso); const now = new Date()
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w > 1 ? 's' : ''} ago` }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m > 1 ? 's' : ''} ago` }
  const y = Math.floor(days / 365); return `${y} year${y > 1 ? 's' : ''} ago`
}

// Due/overdue label from a yyyy-mm-dd follow-up date.
const followUpLabel = (dateStr: string) => {
  const due = new Date(dateStr + 'T00:00:00')
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - due.getTime()) / 86400000)
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} overdue`
  if (days === 0) return 'Due today'
  return `Due in ${-days} day${-days > 1 ? 's' : ''}`
}
const fmtDate = (dateStr: string) => new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function ContactsPage() {
  const supabase = createClient()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const inputStyle: React.CSSProperties = { width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '15px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortBy, setSortBy] = useState<'added' | 'last_new' | 'last_old'>('added')
  const [showAdd, setShowAdd] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', title: '', organization: '', email: '', phone: '', website: '', notes: '', tags: [] as string[], follow_up_status: 'none', next_follow_up_date: '' })
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [isManager, setIsManager] = useState(false)

  // Interaction state
  const [interactionsByContact, setInteractionsByContact] = useState<Record<string, Interaction[]>>({})
  const [logOpenFor, setLogOpenFor] = useState<string | null>(null)
  const [logForm, setLogForm] = useState({ type: 'note', occurred_at: '', summary: '' })
  const [savingInteraction, setSavingInteraction] = useState(false)
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null)
  const [intEditForm, setIntEditForm] = useState({ type: 'note', occurred_at: '', summary: '' })

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const user = await resolveEffectiveTeamRow<{ id: string; role: string }>(supabase, 'id, role')
    if (user) { setCurrentUser({ id: user.id }); setIsManager(user.role === 'Manager') }
    // Only show active contacts here; Phase 2 BCC captures stage as 'pending_review'
    // and live in the review queue until approved.
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('lifecycle_state', 'active')
      .order('created_at', { ascending: false })
    setContacts(data || [])
    const { count } = await supabase
      .from('contact_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('review_state', 'pending')
    setPendingReviewCount(count || 0)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  // Re-fetch a single contact row so the trigger-maintained last_contacted_at reflects.
  const refreshContactRow = async (id: string) => {
    const { data } = await supabase.from('contacts').select('*').eq('id', id).single()
    if (data) setContacts(prev => prev.map(c => c.id === id ? (data as Contact) : c))
  }

  // Phase 1 only ever reads approved, manually-logged interactions.
  const loadInteractions = async (contactId: string) => {
    const { data } = await supabase
      .from('contact_interactions')
      .select('*')
      .eq('contact_id', contactId)
      .eq('review_state', 'approved')
      .eq('source', 'manual')
      .order('occurred_at', { ascending: false })
    setInteractionsByContact(prev => ({ ...prev, [contactId]: data || [] }))
  }

  const toggleExpand = (id: string) => {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    setLogOpenFor(null); setEditingInteractionId(null)
    if (next && interactionsByContact[next] === undefined) loadInteractions(next)
  }

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
        setForm({ name: result.contact.name || '', title: result.contact.title || '', organization: result.contact.organization || '', email: result.contact.email || '', phone: result.contact.phone || '', website: result.contact.website || '', notes: '', tags: [], follow_up_status: 'none', next_follow_up_date: '' })
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
      await supabase.from('contacts').update({ name: form.name, title: form.title || null, organization: form.organization || null, email: form.email || null, phone: form.phone || null, website: form.website || null, notes: form.notes || null, tags: form.tags, follow_up_status: form.follow_up_status, next_follow_up_date: form.next_follow_up_date || null }).eq('id', editingId)
    } else {
      await supabase.from('contacts').insert({ name: form.name, title: form.title || null, organization: form.organization || null, email: form.email || null, phone: form.phone || null, website: form.website || null, notes: form.notes || null, tags: form.tags, follow_up_status: form.follow_up_status, next_follow_up_date: form.next_follow_up_date || null, created_by: currentUser.id })
    }
    setForm({ name: '', title: '', organization: '', email: '', phone: '', website: '', notes: '', tags: [], follow_up_status: 'none', next_follow_up_date: '' })
    setShowAdd(false); setEditingId(null); setSaving(false)
    loadData()
  }

  const toggleStar = async (c: Contact) => {
    await supabase.from('contacts').update({ starred: !c.starred }).eq('id', c.id)
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, starred: !x.starred } : x))
  }

  const deleteContact = async (id: string) => {
    if (!(await confirmDialog({ message: 'Delete this contact?', tone: 'danger' }))) return
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    setExpandedId(null)
  }

  const editContact = (c: Contact) => {
    setForm({ name: c.name, title: c.title || '', organization: c.organization || '', email: c.email || '', phone: c.phone || '', website: c.website || '', notes: c.notes || '', tags: c.tags || [], follow_up_status: c.follow_up_status || 'none', next_follow_up_date: c.next_follow_up_date || '' })
    setEditingId(c.id); setShowAdd(true)
  }

  const toggleTag = (tag: string) => setForm(prev => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag] }))

  // Open the inline "log interaction" form for a contact.
  const openLogForm = (contactId: string) => {
    setLogOpenFor(contactId)
    setEditingInteractionId(null)
    setLogForm({ type: 'note', occurred_at: toLocalDatetimeInput(new Date()), summary: '' })
  }

  const saveInteraction = async (contactId: string) => {
    if (!currentUser) { toast('Could not identify current user.', 'error'); return }
    setSavingInteraction(true)
    await supabase.from('contact_interactions').insert({
      contact_id: contactId,
      interaction_type: logForm.type,
      occurred_at: new Date(logForm.occurred_at || Date.now()).toISOString(),
      summary: logForm.summary || null,
      source: 'manual',
      review_state: 'approved',
      logged_by: currentUser.id,
      visibility: 'team',
    })
    setSavingInteraction(false); setLogOpenFor(null)
    await loadInteractions(contactId)
    await refreshContactRow(contactId)
  }

  const startEditInteraction = (it: Interaction) => {
    setEditingInteractionId(it.id)
    setLogOpenFor(null)
    setIntEditForm({ type: it.interaction_type, occurred_at: toLocalDatetimeInput(new Date(it.occurred_at)), summary: it.summary || '' })
  }

  const saveEditInteraction = async (contactId: string, id: string) => {
    setSavingInteraction(true)
    await supabase.from('contact_interactions').update({
      interaction_type: intEditForm.type,
      occurred_at: new Date(intEditForm.occurred_at || Date.now()).toISOString(),
      summary: intEditForm.summary || null,
    }).eq('id', id)
    setSavingInteraction(false); setEditingInteractionId(null)
    await loadInteractions(contactId)
    await refreshContactRow(contactId)
  }

  const deleteInteraction = async (contactId: string, id: string) => {
    if (!(await confirmDialog({ message: 'Delete this interaction?', tone: 'danger' }))) return
    await supabase.from('contact_interactions').delete().eq('id', id)
    await loadInteractions(contactId)
    await refreshContactRow(contactId)
  }

  const clearFollowUp = async (contactId: string) => {
    await supabase.from('contacts').update({ next_follow_up_date: null }).eq('id', contactId)
    await refreshContactRow(contactId)
  }

  const filtered = contacts.filter(c => {
    if (search) { const s = search.toLowerCase(); if (!c.name.toLowerCase().includes(s) && !(c.organization || '').toLowerCase().includes(s) && !(c.email || '').toLowerCase().includes(s)) return false }
    if (filterTag && !(c.tags || []).includes(filterTag)) return false
    if (filterStatus && c.follow_up_status !== filterStatus) return false
    return true
  })

  const sortFn = (a: Contact, b: Contact) => {
    if (sortBy === 'added') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    const av = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : null
    const bv = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : null
    if (sortBy === 'last_new') {
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return bv - av
    }
    // last_old: oldest contact first, nulls first (surfaces stale relationships)
    if (av === null && bv === null) return 0
    if (av === null) return -1
    if (bv === null) return 1
    return av - bv
  }
  const ordered = [...filtered].sort(sortFn)
  const sorted = [...ordered.filter(c => c.starred), ...ordered.filter(c => !c.starred)]

  const today = todayStr()
  const dueContacts = contacts
    .filter(c => c.next_follow_up_date && c.next_follow_up_date <= today)
    .sort((a, b) => (a.next_follow_up_date! < b.next_follow_up_date! ? -1 : a.next_follow_up_date! > b.next_follow_up_date! ? 1 : 0))

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: muted }}>Loading...</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: text }}>Contacts</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isManager && pendingReviewCount > 0 && (
            <Link href="/dashboard/contacts/review" style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: '0.5px solid rgba(245,158,11,0.4)', color: text, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
              Review queue
              <span style={{ fontSize: '12px', padding: '1px 8px', borderRadius: '10px', background: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}>{pendingReviewCount}</span>
            </Link>
          )}
          <label style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', cursor: scanning ? 'wait' : 'pointer', fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', opacity: scanning ? 0.7 : 1 }}>
            {scanning ? 'Scanning...' : '📷 Scan card'}
            <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) handleScan(e.target.files[0]); e.target.value = '' }} style={{ display: 'none' }} disabled={scanning} />
          </label>
          <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', title: '', organization: '', email: '', phone: '', website: '', notes: '', tags: [], follow_up_status: 'none', next_follow_up_date: '' }) }} style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>+ Quick add</button>
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Follow-up status</label>
              <select value={form.follow_up_status} onChange={e => setForm(p => ({ ...p, follow_up_status: e.target.value }))} style={{ ...inputStyle, width: 'auto', maxWidth: '200px' }}>
                {FOLLOW_UP.map(s => <option key={s} value={s}>{s === 'none' ? 'No follow-up needed' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Next follow-up</label>
              <input type="date" value={form.next_follow_up_date} onChange={e => setForm(p => ({ ...p, next_follow_up_date: e.target.value }))} style={{ ...inputStyle, width: 'auto', maxWidth: '180px' }} />
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setShowAdd(false); setEditingId(null) }} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={saveContact} disabled={!form.name || saving} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: form.name ? '#1e6cb5' : 'var(--surface-2)', color: form.name ? '#fff' : muted, border: 'none', cursor: form.name ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Save contact'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, org, email..." style={{ ...inputStyle, flex: '1 1 200px', minWidth: '160px' }} />
        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 1 130px' }}><option value="">All tags</option>{TAG_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 1 150px' }}><option value="">All status</option>{FOLLOW_UP.filter(s => s !== 'none').map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'added' | 'last_new' | 'last_old')} style={{ ...inputStyle, width: 'auto', flex: '0 1 170px' }}>
          <option value="added">Recently added</option>
          <option value="last_new">Last contacted</option>
          <option value="last_old">Oldest contact</option>
        </select>
      </div>

      {dueContacts.length > 0 && (
        <div style={{ background: cardBg, border: '0.5px solid rgba(245,158,11,0.35)', borderRadius: '14px', padding: '14px 16px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '15px' }}>🔔</span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: text }}>Follow-ups due</span>
            <span style={{ fontSize: '12px', padding: '1px 8px', borderRadius: '10px', background: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}>{dueContacts.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {dueContacts.map(c => (
              <div key={c.id} onClick={() => { if (expandedId !== c.id) toggleExpand(c.id) }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.03)' : '#f8fafc' }}>
                <span style={{ fontSize: '14px' }}>{c.starred ? '⭐' : '☆'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: text }}>{c.name}</span>
                  {c.organization && <span style={{ fontSize: '12px', color: muted }}> · {c.organization}</span>}
                </div>
                <span style={{ fontSize: '12px', color: muted }}>{fmtDate(c.next_follow_up_date!)}</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(245,158,11,0.18)', color: '#f59e0b', whiteSpace: 'nowrap' }}>{followUpLabel(c.next_follow_up_date!)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            const list = interactionsByContact[c.id]
            return (
              <div key={c.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                <div onClick={() => toggleExpand(c.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                  <button onClick={e => { e.stopPropagation(); toggleStar(c) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: 0, lineHeight: 1, minWidth: '24px' }}>{c.starred ? '⭐' : '☆'}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: text }}>{c.name}</span>
                      {c.organization && <span style={{ fontSize: '13px', color: muted }}>· {c.organization}</span>}
                    </div>
                    {c.title && <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0' }}>{c.title}</p>}
                    <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{c.last_contacted_at ? `Last contact: ${relativeDate(c.last_contacted_at)}` : 'No contact logged'}</p>
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

                    {c.next_follow_up_date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '0 0 10px', padding: '8px 12px', borderRadius: '8px', background: c.next_follow_up_date <= today ? 'rgba(245,158,11,0.12)' : (dark ? 'rgba(255,255,255,0.03)' : '#f1f5f9') }}>
                        <span style={{ fontSize: '13px', color: text }}>Next follow-up: <strong>{fmtDate(c.next_follow_up_date)}</strong></span>
                        <span style={{ fontSize: '12px', color: c.next_follow_up_date <= today ? '#f59e0b' : muted }}>{followUpLabel(c.next_follow_up_date)}</span>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => clearFollowUp(c.id)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
                        <button onClick={() => clearFollowUp(c.id)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                      </div>
                    )}

                    {/* ─── Interactions ─── */}
                    <div style={{ borderTop: `0.5px solid ${border}`, paddingTop: '12px', marginTop: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: text }}>Interactions</span>
                        {logOpenFor !== c.id && (
                          <button onClick={() => openLogForm(c.id)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>+ Log interaction</button>
                        )}
                      </div>

                      {logOpenFor === c.id && (
                        <div style={{ background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            <div>
                              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Type</label>
                              <select value={logForm.type} onChange={e => setLogForm(p => ({ ...p, type: e.target.value }))} style={{ ...inputStyle, width: 'auto' }}>
                                {LOG_TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Date</label>
                              <input type="datetime-local" value={logForm.occurred_at} onChange={e => setLogForm(p => ({ ...p, occurred_at: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
                            </div>
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Summary</label>
                            <input value={logForm.summary} onChange={e => setLogForm(p => ({ ...p, summary: e.target.value }))} placeholder="e.g. Discussed parade quote" style={inputStyle} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setLogOpenFor(null)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={() => saveInteraction(c.id)} disabled={savingInteraction} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: savingInteraction ? 0.7 : 1 }}>{savingInteraction ? 'Saving...' : 'Save'}</button>
                          </div>
                        </div>
                      )}

                      {list === undefined ? (
                        <p style={{ fontSize: '13px', color: muted, margin: 0 }}>Loading interactions...</p>
                      ) : list.length === 0 ? (
                        <p style={{ fontSize: '13px', color: muted, margin: 0 }}>No interactions logged yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {list.map(it => (
                            <div key={it.id} style={{ background: dark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: '8px', padding: '8px 10px' }}>
                              {editingInteractionId === it.id ? (
                                <div>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <select value={intEditForm.type} onChange={e => setIntEditForm(p => ({ ...p, type: e.target.value }))} style={{ ...inputStyle, width: 'auto' }}>
                                      {LOG_TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                                    </select>
                                    <input type="datetime-local" value={intEditForm.occurred_at} onChange={e => setIntEditForm(p => ({ ...p, occurred_at: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
                                  </div>
                                  <input value={intEditForm.summary} onChange={e => setIntEditForm(p => ({ ...p, summary: e.target.value }))} placeholder="Summary" style={{ ...inputStyle, marginBottom: '8px' }} />
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setEditingInteractionId(null)} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                    <button onClick={() => saveEditInteraction(c.id, it.id)} disabled={savingInteraction} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: savingInteraction ? 0.7 : 1 }}>{savingInteraction ? 'Saving...' : 'Save'}</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', lineHeight: '18px' }}>{(TYPE_META[it.interaction_type] || TYPE_META.note).icon}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '12px', fontWeight: 600, color: text }}>{(TYPE_META[it.interaction_type] || TYPE_META.note).label}</span>
                                      <span style={{ fontSize: '11px', color: muted }}>{new Date(it.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                    {it.summary && <p style={{ fontSize: '13px', color: text, margin: '2px 0 0' }}>{it.summary}</p>}
                                  </div>
                                  <button onClick={() => startEditInteraction(it)} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                  <button onClick={() => deleteInteraction(c.id, it.id)} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: '0.5px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
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
