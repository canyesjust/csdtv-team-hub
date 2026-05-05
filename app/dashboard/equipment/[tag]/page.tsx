'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'

type Equipment = {
  id: string; asset_tag: string; name: string; brand: string | null; model: string | null
  serial_number: string | null; category_id: string | null; subcategory_id: string | null
  status: string; site: string; condition: string; notes: string | null; photo_url: string | null
  created_at: string; updated_at: string
}
type Category = { id: string; name: string; parent_id: string | null }
type Loan = {
  id: string; borrower_name: string; borrower_info: string | null; checked_out_at: string
  checked_in_at: string | null; due_date: string | null; notes: string | null
  checked_out_by_user?: { name: string } | null
}
type Activity = { id: string; action: string; detail: string | null; created_at: string; user?: { name: string } | null }
type KitInfo = { id: string; name: string }

const STATUSES = ['available', 'checked_out', 'maintenance', 'retired']
const SITES = ['Office', 'Van', 'Trailer', 'Other']
const CONDITIONS = ['Good', 'Fair', 'Needs Repair', 'Damaged', 'Broken']
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  available: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
  checked_out: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
  maintenance: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa' },
  retired: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
}

export default function EquipmentDetailPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const router = useRouter()
  const params = useParams()
  const tag = params.tag as string
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const inputStyle = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: text, fontFamily: 'inherit' as const, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  const [item, setItem] = useState<Equipment | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [kits, setKits] = useState<KitInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [tab, setTab] = useState<'info' | 'loans' | 'activity'>('info')
  const [showCheckout, setShowCheckout] = useState(false)
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerInfo, setBorrowerInfo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [checkoutNote, setCheckoutNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', brand: '', model: '', serial_number: '', status: '', site: '', condition: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: userData } = await supabase.from('team').select('id').eq('supabase_user_id', session.user.id).single()
    if (userData) setUserId(userData.id)
    const { data: eqData } = await supabase.from('equipment').select('*').eq('asset_tag', tag).single()
    if (!eqData) { setLoading(false); return }
    setItem(eqData)
    setEditForm({ name: eqData.name, brand: eqData.brand || '', model: eqData.model || '', serial_number: eqData.serial_number || '', status: eqData.status, site: eqData.site, condition: eqData.condition, notes: eqData.notes || '' })
    const [catRes, loanRes, actRes, kitRes] = await Promise.all([
      supabase.from('equipment_categories').select('*'),
      supabase.from('equipment_loans').select('*, checked_out_by_user:team!equipment_loans_checked_out_by_fkey(name)').eq('equipment_id', eqData.id).order('checked_out_at', { ascending: false }),
      supabase.from('equipment_activity').select('*, user:team(name)').eq('equipment_id', eqData.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('equipment_kit_items').select('kit_id, kit:equipment_kits(id, name)').eq('equipment_id', eqData.id),
    ])
    setCategories(catRes.data || [])
    setLoans((loanRes.data as any) || [])
    setActivity((actRes.data as any) || [])
    setKits((kitRes.data || []).map((k: any) => k.kit).filter(Boolean))
    setLoading(false)
  }, [supabase, tag])

  useEffect(() => { loadData() }, [loadData])

  const getCatName = (id: string | null) => id ? categories.find(c => c.id === id)?.name || '' : ''

  const saveEdit = async () => {
    if (!item) return
    setSaving(true)
    await supabase.from('equipment').update({
      name: editForm.name, brand: editForm.brand || null, model: editForm.model || null,
      serial_number: editForm.serial_number || null, status: editForm.status, site: editForm.site,
      condition: editForm.condition, notes: editForm.notes || null, updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    if (editForm.status !== item.status) {
      await supabase.from('equipment_activity').insert({ equipment_id: item.id, action: 'status_changed', detail: `${item.status} to ${editForm.status}`, user_id: userId })
    }
    setItem(prev => prev ? { ...prev, name: editForm.name, brand: editForm.brand || null, model: editForm.model || null, serial_number: editForm.serial_number || null, status: editForm.status, site: editForm.site, condition: editForm.condition, notes: editForm.notes || null } : null)
    setEditing(false); setSaving(false); setSavedMsg('Saved!'); setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleCheckout = async () => {
    if (!item || !borrowerName.trim() || !userId) return
    const res = await fetch('/api/equipment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipmentId: item.id,
        borrowerName: borrowerName.trim(),
        borrowerInfo: borrowerInfo.trim() || null,
        dueDate: dueDate || null,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast(body.error || 'Checkout failed', 'error')
      return
    }
    setItem(prev => prev ? { ...prev, status: 'checked_out' } : null)
    setEditForm(prev => ({ ...prev, status: 'checked_out' }))
    setShowCheckout(false); setBorrowerName(''); setBorrowerInfo(''); setDueDate(''); setCheckoutNote('')
    loadData()
  }

  const handleCheckin = async (loan: Loan) => {
    if (!item || !userId) return
    const res = await fetch('/api/equipment/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loanId: loan.id }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast(body.error || 'Check-in failed', 'error')
      return
    }
    setItem(prev => prev ? { ...prev, status: 'available' } : null)
    setEditForm(prev => ({ ...prev, status: 'available' }))
    loadData()
  }

  const activeLoan = loans.find(l => !l.checked_in_at)
  const statusStyle = STATUS_COLORS[item?.status || ''] || STATUS_COLORS['available']

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>
  if (!item) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
      <p style={{ fontSize: '18px', color: text, fontWeight: 500 }}>Equipment not found</p>
      <p style={{ fontSize: '14px', color: muted, margin: '8px 0 20px' }}>No item with asset tag &quot;{tag}&quot;</p>
      <button onClick={() => router.push('/dashboard/equipment')} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Back to equipment</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => router.push('/dashboard/equipment')} style={{ background: 'none', border: 'none', color: '#5ba3e0', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>← Equipment</button>
        {savedMsg && <span style={{ fontSize: '13px', color: '#22c55e', marginLeft: 'auto' }}>{savedMsg}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: item.photo_url ? '200px 1fr' : '1fr', gap: '20px', marginBottom: '20px' }}>
        {item.photo_url && (
          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
            <img src={item.photo_url} alt={item.name} style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
            <div>
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px', fontFamily: 'monospace' }}>#{item.asset_tag}</p>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: text, margin: 0 }}>{item.name}</h1>
              {(item.brand || item.model) && <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>{[item.brand, item.model].filter(Boolean).join(' ')}</p>}
            </div>
            <span style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', background: statusStyle.bg, color: statusStyle.color, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{item.status.replace('_', ' ')}</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: muted, flexWrap: 'wrap' as const }}>
            {getCatName(item.category_id) && <span>{getCatName(item.category_id)}{getCatName(item.subcategory_id) ? ` / ${getCatName(item.subcategory_id)}` : ''}</span>}
            <span>{item.site}</span>
            <span>{item.condition}</span>
            {item.serial_number && <span>SN: {item.serial_number}</span>}
          </div>
          {kits.length > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
              {kits.map(k => (
                <span key={k.id} onClick={() => router.push(`/dashboard/equipment/kits/${k.id}`)} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', cursor: 'pointer' }}>Kit: {k.name}</span>
              ))}
            </div>
          )}
          {activeLoan && (
            <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)' }}>
              <p style={{ fontSize: '14px', color: '#f59e0b', fontWeight: 600, margin: '0 0 4px' }}>Checked out to {activeLoan.borrower_name}</p>
              <p style={{ fontSize: '12px', color: muted, margin: 0 }}>
                By {activeLoan.checked_out_by_user?.name || 'Unknown'} on {new Date(activeLoan.checked_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {activeLoan.due_date && ` | Due ${new Date(activeLoan.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </p>
              <button onClick={() => handleCheckin(activeLoan)} style={{ marginTop: '10px', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Check in</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {item.status === 'available' && (
              <button onClick={() => setShowCheckout(true)} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Check out</button>
            )}
            <button onClick={() => setEditing(!editing)} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '10px', background: cardBg, color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>
      </div>

      {showCheckout && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 14px' }}>Check out {item.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Borrower name *</p><input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="Who is taking this?" style={inputStyle} autoFocus /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Info</p><input value={borrowerInfo} onChange={e => setBorrowerInfo(e.target.value)} placeholder="Class, phone (optional)" style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Due date</p><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Note</p><input value={checkoutNote} onChange={e => setCheckoutNote(e.target.value)} placeholder="Optional" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCheckout} disabled={!borrowerName.trim()} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: borrowerName.trim() ? '#1e6cb5' : 'var(--surface-2)', color: borrowerName.trim() ? '#fff' : muted, border: 'none', cursor: borrowerName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>Confirm checkout</button>
            <button onClick={() => setShowCheckout(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 14px' }}>Edit item</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Name</p><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Brand</p><input value={editForm.brand} onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))} style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Model</p><input value={editForm.model} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Serial number</p><input value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Status</p><select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Site</p><select value={editForm.site} onChange={e => setEditForm(f => ({ ...f, site: e.target.value }))} style={inputStyle}>{SITES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Condition</p><select value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))} style={inputStyle}>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: '12px' }}><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Notes</p><textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Equipment notes..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} /></div>
          <button onClick={saveEdit} disabled={saving} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: '16px' }}>
        {(['info', 'loans', 'activity'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: '14px', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: tab === t ? '#5ba3e0' : muted, borderBottom: tab === t ? '2px solid #1e6cb5' : '2px solid transparent', fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize' as const }}>
            {t === 'loans' ? `Loan history (${loans.length})` : t === 'activity' ? `Activity (${activity.length})` : 'Details'}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          {item.notes && (<div style={{ marginBottom: '16px' }}><p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Notes</p><p style={{ fontSize: '14px', color: text, margin: 0, lineHeight: 1.6 }}>{item.notes}</p></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
            {([['Asset tag', `#${item.asset_tag}`], ['Name', item.name], ['Brand', item.brand], ['Model', item.model], ['Serial', item.serial_number], ['Category', getCatName(item.category_id)], ['Subcategory', getCatName(item.subcategory_id)], ['Site', item.site], ['Condition', item.condition], ['Status', item.status.replace('_', ' ')], ['Added', new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })]] as [string, string | null][]).map(([label, value]) => value ? (
              <div key={label}><p style={{ fontSize: '12px', color: muted, margin: '0 0 2px' }}>{label}</p><p style={{ color: text, margin: 0 }}>{value}</p></div>
            ) : null)}
          </div>
        </div>
      )}

      {tab === 'loans' && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
          {loans.length === 0 ? (
            <p style={{ padding: '30px', textAlign: 'center' as const, color: muted, fontSize: '14px', margin: 0 }}>No loan history</p>
          ) : loans.map((loan, i) => (
            <div key={loan.id} style={{ padding: '14px 20px', borderBottom: i < loans.length - 1 ? `1px solid ${border}` : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: loan.checked_in_at ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', color: text, fontWeight: 500, margin: 0 }}>{loan.borrower_name}{loan.borrower_info && <span style={{ color: muted, fontWeight: 400 }}> — {loan.borrower_info}</span>}</p>
                <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>
                  Out: {new Date(loan.checked_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {loan.checked_in_at && ` / In: ${new Date(loan.checked_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {!loan.checked_in_at && ' | Still out'}
                  {loan.due_date && ` | Due ${new Date(loan.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {loan.checked_out_by_user && ` | ${loan.checked_out_by_user.name}`}
                </p>
              </div>
              {!loan.checked_in_at && (
                <button onClick={() => handleCheckin(loan)} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Check in</button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'activity' && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
          {activity.length === 0 ? (
            <p style={{ padding: '30px', textAlign: 'center' as const, color: muted, fontSize: '14px', margin: 0 }}>No activity recorded</p>
          ) : activity.map((a, i) => {
            const diff = Date.now() - new Date(a.created_at).getTime()
            const mins = Math.floor(diff / 60000); const hrs = Math.floor(mins / 60); const days = Math.floor(hrs / 24)
            const ago = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : `${mins}m ago`
            return (
              <div key={a.id} style={{ padding: '12px 20px', borderBottom: i < activity.length - 1 ? `1px solid ${border}` : 'none', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5ba3e0', marginTop: '6px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ color: text, fontWeight: 500 }}>{a.user?.name || 'System'}</span>
                  <span style={{ color: muted }}> {a.action.replace('_', ' ')}</span>
                  {a.detail && <span style={{ color: muted }}> — {a.detail}</span>}
                </div>
                <span style={{ color: muted, fontSize: '12px', flexShrink: 0 }}>{ago}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}