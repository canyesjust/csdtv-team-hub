'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { confirmDialog } from '@/lib/confirm'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'

interface ReviewContact {
  id: string; name: string; email: string | null; organization: string | null
  lifecycle_state: string; source: string
}

interface PendingInteraction {
  id: string; contact_id: string; interaction_type: string
  occurred_at: string; summary: string | null; body_raw: string | null
  direction: string | null; source: string; review_state: string; created_at: string
  contact: ReviewContact | null
}

const TYPE_LABEL: Record<string, string> = {
  email: 'Email', call: 'Call', meeting: 'Meeting', text: 'Text', note: 'Note', mass_email: 'Mass email',
}

const relativeDate = (iso: string) => {
  const then = new Date(iso); const now = new Date()
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w > 1 ? 's' : ''} ago` }
  const m = Math.floor(days / 30); return `${m} month${m > 1 ? 's' : ''} ago`
}

export default function ContactsReviewPage() {
  const supabase = createClient()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const inputStyle: React.CSSProperties = { width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '8px 10px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  const [items, setItems] = useState<PendingInteraction[]>([])
  const [loading, setLoading] = useState(true)
  const [isManager, setIsManager] = useState<boolean | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Per-item editable overrides for newly staged contacts + summary.
  const [edits, setEdits] = useState<Record<string, { name: string; email: string; organization: string; summary: string }>>({})

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    // The review queue handles captured email content; restrict it to Managers.
    // The data layer enforces this too (RLS), so this is a UX guard, not the gate.
    const effective = await fetchEffectiveTeam()
    const manager = effective?.team?.role === 'Manager'
    setIsManager(manager)
    if (!manager) { setLoading(false); return }
    const { data } = await supabase
      .from('contact_interactions')
      .select('*, contact:contacts(id, name, email, organization, lifecycle_state, source)')
      .eq('review_state', 'pending')
      .order('occurred_at', { ascending: false })
    const rows = (data || []) as PendingInteraction[]
    setItems(rows)
    const seed: Record<string, { name: string; email: string; organization: string; summary: string }> = {}
    for (const r of rows) {
      seed[r.id] = {
        name: r.contact?.name || '',
        email: r.contact?.email || '',
        organization: r.contact?.organization || '',
        summary: r.summary || '',
      }
    }
    setEdits(seed)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const approve = async (it: PendingInteraction) => {
    setBusyId(it.id)
    const edit = edits[it.id]
    // Persist any edited summary alongside approval.
    await supabase.from('contact_interactions')
      .update({ review_state: 'approved', summary: (edit?.summary || '').trim() || null })
      .eq('id', it.id)
    // Promote a newly staged contact to active, applying any field edits.
    if (it.contact && it.contact.lifecycle_state === 'pending_review') {
      await supabase.from('contacts')
        .update({
          lifecycle_state: 'active',
          name: (edit?.name || '').trim() || it.contact.name,
          email: (edit?.email || '').trim() || null,
          organization: (edit?.organization || '').trim() || null,
        })
        .eq('id', it.contact.id)
    }
    setItems(prev => prev.filter(x => x.id !== it.id))
    setBusyId(null)
    toast('Approved', 'success')
  }

  const reject = async (it: PendingInteraction) => {
    if (!(await confirmDialog({ message: 'Reject and discard this captured interaction?', tone: 'danger' }))) return
    setBusyId(it.id)
    await supabase.from('contact_interactions').delete().eq('id', it.id)
    // If this was a freshly staged contact with nothing else attached, remove it too.
    if (it.contact && it.contact.lifecycle_state === 'pending_review') {
      const { count } = await supabase
        .from('contact_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', it.contact.id)
      if ((count || 0) === 0) {
        await supabase.from('contacts').delete().eq('id', it.contact.id)
      }
    }
    setItems(prev => prev.filter(x => x.id !== it.id))
    setBusyId(null)
    toast('Rejected', 'success')
  }

  const setEdit = (id: string, patch: Partial<{ name: string; email: string; organization: string; summary: string }>) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: muted }}>Loading...</div>

  if (isManager === false) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: text }}>Review queue</h1>
          <Link href="/dashboard/contacts" style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: `0.5px solid ${border}`, color: text, textDecoration: 'none', fontWeight: 500 }}>← Contacts</Link>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
          <p style={{ fontSize: '18px', margin: '0 0 6px' }}>Managers only</p>
          <p style={{ fontSize: '14px' }}>Captured contacts are reviewed by managers. Ask a manager to approve them.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: text }}>Review queue</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{items.length} captured interaction{items.length !== 1 ? 's' : ''} awaiting review</p>
        </div>
        <Link href="/dashboard/contacts" style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: `0.5px solid ${border}`, color: text, textDecoration: 'none', fontWeight: 500 }}>← Contacts</Link>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
          <p style={{ fontSize: '18px', margin: '0 0 6px' }}>Nothing to review</p>
          <p style={{ fontSize: '14px' }}>Captured emails awaiting approval will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(it => {
            const isNew = it.contact?.lifecycle_state === 'pending_review'
            const edit = edits[it.id] || { name: '', email: '', organization: '', summary: '' }
            const busy = busyId === it.id
            return (
              <div key={it.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(30,108,181,0.12)', color: 'var(--brand-primary)' }}>{TYPE_LABEL[it.interaction_type] || 'Email'}</span>
                  {isNew
                    ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>New contact</span>
                    : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: dark ? 'rgba(255,255,255,0.06)' : '#eef2f7', color: muted }}>Existing contact</span>}
                  <span style={{ fontSize: '12px', color: muted }}>{relativeDate(it.occurred_at)}</span>
                  <span style={{ fontSize: '11px', color: muted }}>· captured via BCC</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Name</label>
                    {isNew
                      ? <input value={edit.name} onChange={e => setEdit(it.id, { name: e.target.value })} style={inputStyle} />
                      : <p style={{ fontSize: '14px', color: text, margin: 0 }}>{it.contact?.name}</p>}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Email</label>
                    {isNew
                      ? <input value={edit.email} onChange={e => setEdit(it.id, { email: e.target.value })} style={inputStyle} />
                      : <p style={{ fontSize: '14px', color: text, margin: 0 }}>{it.contact?.email || '—'}</p>}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Organization</label>
                    {isNew
                      ? <input value={edit.organization} onChange={e => setEdit(it.id, { organization: e.target.value })} placeholder="Optional" style={inputStyle} />
                      : <p style={{ fontSize: '14px', color: text, margin: 0 }}>{it.contact?.organization || '—'}</p>}
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Summary</label>
                  <input value={edit.summary} onChange={e => setEdit(it.id, { summary: e.target.value })} placeholder="One-line summary" style={inputStyle} />
                </div>

                {it.body_raw && (
                  <details style={{ marginBottom: '12px' }}>
                    <summary style={{ fontSize: '13px', color: 'var(--brand-primary)', cursor: 'pointer' }}>View email body</summary>
                    <pre style={{ fontSize: '13px', color: text, margin: '8px 0 0', padding: '10px 12px', background: dark ? 'rgba(255,255,255,0.03)' : '#f1f5f9', borderRadius: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', maxHeight: '260px', overflow: 'auto' }}>{it.body_raw}</pre>
                  </details>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => reject(it)} disabled={busy} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '0.5px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>Reject</button>
                  <button onClick={() => approve(it)} disabled={busy} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving...' : 'Approve'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
