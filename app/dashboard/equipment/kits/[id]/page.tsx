'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'

type Equipment = {
  id: string; asset_tag: string; name: string; brand: string | null; model: string | null
  status: string; site: string; condition: string; category_id: string | null
}
type Kit = { id: string; name: string; description: string | null; created_by: string | null; created_at: string }
type KitItem = { id: string; kit_id: string; equipment_id: string; equipment: Equipment }
type TeamMember = { id: string; name: string; role: string }

export default function KitDetailPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const router = useRouter()
  const params = useParams()
  const kitId = params.id as string
  const supabase = createClient()

  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#8899bb' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const [kit, setKit] = useState<Kit | null>(null)
  const [items, setItems] = useState<KitItem[]>([])
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([])
  const [user, setUser] = useState<TeamMember | null>(null)
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerInfo, setBorrowerInfo] = useState('')
  const [dueDate, setDueDate] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: userData } = await supabase.from('team').select('id, name, role').eq('supabase_user_id', session.user.id).single()
    if (userData) setUser(userData)

    const { data: kitData } = await supabase.from('equipment_kits').select('*').eq('id', kitId).single()
    if (kitData) setKit(kitData)

    const { data: itemData } = await supabase
      .from('equipment_kit_items')
      .select('*, equipment(*)')
      .eq('kit_id', kitId)
    if (itemData) setItems(itemData as any)

    const { data: eqData } = await supabase.from('equipment').select('id, asset_tag, name, brand, model, status, site, condition, category_id').order('asset_tag')
    if (eqData) setAllEquipment(eqData)

    setLoading(false)
  }, [supabase, kitId])

  useEffect(() => { loadData() }, [loadData])

  const isManager = user?.role === 'Manager'
  const existingIds = items.map(i => i.equipment_id)
  const availableToAdd = allEquipment.filter(e => {
    if (existingIds.includes(e.id)) return false
    if (!addSearch) return true
    const q = addSearch.toLowerCase()
    return e.asset_tag.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || (e.brand || '').toLowerCase().includes(q)
  })

  const allAvailable = items.every(i => i.equipment?.status === 'available')

  async function handleAddItem(equipmentId: string) {
    if (!user) return
    const { error } = await supabase.from('equipment_kit_items').insert({ kit_id: kitId, equipment_id: equipmentId })
    if (error) { toast(error.message, 'error'); return }
    const eq = allEquipment.find(e => e.id === equipmentId)
    await supabase.from('equipment_activity').insert({
      equipment_id: equipmentId, action: 'added_to_kit',
      detail: `Added to kit: ${kit?.name}`, user_id: user.id,
    })
    loadData()
  }

  async function handleRemoveItem(itemId: string, equipmentId: string) {
    if (!user) return
    if (!confirm('Remove this item from the kit?')) return
    await supabase.from('equipment_kit_items').delete().eq('id', itemId)
    await supabase.from('equipment_activity').insert({
      equipment_id: equipmentId, action: 'removed_from_kit',
      detail: `Removed from kit: ${kit?.name}`, user_id: user.id,
    })
    loadData()
  }

  async function handleKitCheckout() {
    if (!kit || !user || !borrowerName.trim()) return
    // Create a loan for the kit
    await supabase.from('equipment_loans').insert({
      kit_id: kit.id, borrower_name: borrowerName.trim(),
      borrower_info: borrowerInfo.trim() || null, checked_out_by: user.id, due_date: dueDate || null,
    })
    // Mark all items as checked out
    for (const ki of items) {
      await supabase.from('equipment').update({ status: 'checked_out' }).eq('id', ki.equipment_id)
      await supabase.from('equipment_activity').insert({
        equipment_id: ki.equipment_id, action: 'checked_out',
        detail: `Checked out as part of kit "${kit.name}" to ${borrowerName.trim()}`, user_id: user.id,
      })
    }
    setShowCheckout(false); setBorrowerName(''); setBorrowerInfo(''); setDueDate('')
    loadData()
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'available': return { bg: dark ? '#16382a' : '#dcfce7', text: '#22c55e' }
      case 'checked_out': return { bg: dark ? '#3b2a15' : '#fef3c7', text: '#f59e0b' }
      case 'broken': return { bg: dark ? '#3b1515' : '#fee2e2', text: '#ef4444' }
      default: return { bg: dark ? '#1f1f2e' : '#f3f4f6', text: '#6b7280' }
    }
  }

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px',
    padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const, minHeight: '44px',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>
    )
  }

  if (!kit) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', color: muted }}>
        Kit not found.
        <button onClick={() => router.push('/dashboard/equipment')} style={{ background: 'none', border: 'none', color: '#5ba3e0', cursor: 'pointer', marginLeft: '8px', fontFamily: 'inherit' }}>Back</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>
      <button onClick={() => router.push('/dashboard/equipment')}
        style={{ background: 'none', border: 'none', color: '#5ba3e0', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', marginBottom: '16px', padding: 0 }}>
        ← Equipment
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 4px' }}>{kit.name}</h1>
          {kit.description && <p style={{ fontSize: '14px', color: muted, margin: 0 }}>{kit.description}</p>}
          <p style={{ fontSize: '13px', color: muted, margin: '4px 0 0' }}>{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {items.length > 0 && allAvailable && (
            <button onClick={() => setShowCheckout(true)} style={{
              background: '#1e6cb5', border: 'none', borderRadius: '10px', color: '#fff',
              padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', minHeight: '44px',
            }}>Check Out Kit</button>
          )}
          {isManager && (
            <button onClick={() => setShowAdd(!showAdd)} style={{
              background: 'none', border: `1px solid ${border}`, borderRadius: '10px', color: muted,
              padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px',
            }}>{showAdd ? 'Done Adding' : '+ Add Items'}</button>
          )}
        </div>
      </div>

      {/* Add items panel */}
      {showAdd && (
        <div style={{ background: cardBg, borderRadius: '14px', padding: '20px', border: `1px solid ${border}`, marginBottom: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: text, marginBottom: '12px' }}>Add Items to Kit</div>
          <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search by tag, name, or brand..." style={{ ...inputStyle, marginBottom: '12px' }} />
          <div style={{ maxHeight: '300px', overflowY: 'auto' as const }}>
            {availableToAdd.slice(0, 20).map(eq => {
              const sc = statusColor(eq.status)
              return (
                <div key={eq.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#5ba3e0', fontWeight: 600 }}>{eq.asset_tag}</span>
                    <span style={{ fontSize: '14px', color: text }}>{eq.name}</span>
                    {eq.brand && <span style={{ fontSize: '12px', color: muted }}>{eq.brand}</span>}
                    <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: sc.bg, color: sc.text }}>{eq.status.replace('_', ' ')}</span>
                  </div>
                  <button onClick={() => handleAddItem(eq.id)} style={{
                    background: '#1e6cb5', border: 'none', borderRadius: '8px', color: '#fff',
                    padding: '4px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
                  }}>Add</button>
                </div>
              )
            })}
            {availableToAdd.length > 20 && (
              <div style={{ padding: '8px', fontSize: '12px', color: muted, textAlign: 'center' as const }}>Showing first 20 — narrow your search</div>
            )}
          </div>
        </div>
      )}

      {/* Kit items */}
      <div style={{ background: cardBg, borderRadius: '14px', border: `1px solid ${border}`, overflow: 'hidden' }}>
        {items.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center' as const, color: muted, fontSize: '14px' }}>
            No items in this kit yet. {isManager ? 'Click "+ Add Items" to get started.' : ''}
          </div>
        )}
        {items.map((ki, i) => {
          const eq = ki.equipment
          if (!eq) return null
          const sc = statusColor(eq.status)
          return (
            <div key={ki.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: i < items.length - 1 ? `1px solid ${border}` : 'none', cursor: 'pointer' }} onClick={() => router.push(`/dashboard/equipment/${eq.asset_tag}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#5ba3e0', fontWeight: 600, minWidth: '44px' }}>{eq.asset_tag}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: text }}>{eq.name}</div>
                  <div style={{ fontSize: '12px', color: muted }}>{[eq.brand, eq.model].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: sc.bg, color: sc.text }}>{eq.status.replace('_', ' ')}</span>
                {isManager && (
                  <button onClick={ev => { ev.stopPropagation(); handleRemoveItem(ki.id, ki.equipment_id) }} style={{
                    background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                  }}>Remove</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Kit Checkout Modal */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: dark ? '#111827' : '#fff', borderRadius: '16px', padding: '28px', maxWidth: '440px', width: '100%', border: `1px solid ${border}` }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: text, marginBottom: '4px' }}>Check Out Kit</div>
            <div style={{ fontSize: '13px', color: muted, marginBottom: '6px' }}>{kit.name} — {items.length} items</div>
            <div style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>
              {items.map(ki => ki.equipment?.asset_tag).join(', ')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '4px' }}>Student / Borrower Name *</label>
                <input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="Enter name" style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '4px' }}>Additional Info</label>
                <input value={borrowerInfo} onChange={e => setBorrowerInfo(e.target.value)} placeholder="Class, teacher, phone (optional)" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '4px' }}>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={handleKitCheckout} disabled={!borrowerName.trim()} style={{
                background: borrowerName.trim() ? '#1e6cb5' : '#333', border: 'none', borderRadius: '10px',
                color: '#fff', padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                cursor: borrowerName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', flex: 1, minHeight: '44px',
              }}>Check Out All {items.length} Items</button>
              <button onClick={() => { setShowCheckout(false); setBorrowerName(''); setBorrowerInfo(''); setDueDate('') }} style={{
                background: 'none', border: `1px solid ${border}`, borderRadius: '10px', color: muted,
                padding: '12px 24px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}