'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { formatMonthDay } from '@/lib/format-date'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'
import FilePickButton from '@/components/FilePickButton'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { canAddOrEditEquipment, canDeleteEquipment, canManageEquipmentKits } from '@/lib/equipment-access'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
import {
  DEFAULT_EQUIPMENT_CONDITION,
  DEFAULT_EQUIPMENT_SITE,
  EQUIPMENT_CONDITION_OPTIONS,
  EQUIPMENT_SITE_OPTIONS,
  formatEquipmentCondition,
  formatEquipmentSite,
  normalizeEquipmentCondition,
  normalizeEquipmentSite,
} from '@/lib/equipment-fields'
import {
  formatPowerSpecShort,
  getNextPowerCableAssetTag,
  isPowerCableRow,
  POWER_INPUT_PRESETS,
  POWER_POLARITY_OPTIONS,
  type PowerPolarityDb,
} from '@/lib/equipment-power'

type Equipment = {
  id: string; asset_tag: string; name: string; brand: string | null; model: string | null
  serial_number: string | null; category_id: string | null; subcategory_id: string | null
  status: string; site: string; condition: string; notes: string | null; photo_url: string | null
  created_at: string; updated_at: string
  is_power_cable?: boolean | null
  parent_equipment_id?: string | null
  power_input_connector?: string | null
  power_output_voltage?: string | null
  power_output_amperage?: string | null
  power_output_polarity?: string | null
  power_barrel_size?: string | null
  power_brand?: string | null
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
  const [userRole, setUserRole] = useState<string | null>(null)
  const [linkedPowerCables, setLinkedPowerCables] = useState<Equipment[]>([])
  const [parentDevice, setParentDevice] = useState<Equipment | null>(null)
  const [tab, setTab] = useState<'info' | 'power' | 'loans' | 'activity'>('info')
  const [showPowerAdd, setShowPowerAdd] = useState(false)
  const [powerSaving, setPowerSaving] = useState(false)
  const [powerForm, setPowerForm] = useState({
    name: '',
    power_input_preset: 'IEC C13',
    power_input_other: '',
    category_id: '',
    power_brand: '',
    power_output_voltage: '',
    power_output_amperage: '',
    power_output_polarity: 'na' as PowerPolarityDb,
    power_barrel_size: '',
    notes: '',
    condition: DEFAULT_EQUIPMENT_CONDITION,
    site: DEFAULT_EQUIPMENT_SITE,
  })
  const [showCheckout, setShowCheckout] = useState(false)
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerInfo, setBorrowerInfo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [checkoutNote, setCheckoutNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', brand: '', model: '', serial_number: '', status: '', site: '', condition: '', notes: '' })
  // Duplicate: copy this item into a brand-new entry under a tag the user enters.
  const [dupOpen, setDupOpen] = useState(false)
  const [dupTag, setDupTag] = useState('')
  const [dupSaving, setDupSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const userData = await resolveEffectiveTeamRow<{ id: string; role: string }>(supabase, 'id, role')
    if (userData) {
      setUserId(userData.id)
      setUserRole(userData.role ?? null)
    }
    const { data: eqData } = await supabase.from('equipment').select('*').eq('asset_tag', tag).single()
    if (!eqData) { setLoading(false); return }
    setItem(eqData)
    setEditForm({ name: eqData.name, brand: eqData.brand || '', model: eqData.model || '', serial_number: eqData.serial_number || '', status: eqData.status, site: normalizeEquipmentSite(eqData.site), condition: normalizeEquipmentCondition(eqData.condition), notes: eqData.notes || '' })
    const isPc = isPowerCableRow(eqData as Equipment)
    let powerKids: Equipment[] = []
    let parent: Equipment | null = null
    if (!isPc) {
      const { data: kids } = await supabase.from('equipment').select('*').eq('parent_equipment_id', eqData.id).eq('is_power_cable', true)
      powerKids = (kids || []) as Equipment[]
    } else if (eqData.parent_equipment_id) {
      const { data: p } = await supabase.from('equipment').select('*').eq('id', eqData.parent_equipment_id).single()
      parent = (p || null) as Equipment | null
    }
    setLinkedPowerCables(powerKids)
    setParentDevice(parent)
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
  const topCategories = categories.filter(c => !c.parent_id)
  const canEdit = canAddOrEditEquipment(userRole)
  const canDelete = canDeleteEquipment(userRole)
  const canLoan = canManageEquipmentKits(userRole)
  const itemIsPower = item ? isPowerCableRow(item) : false

  const uploadPhoto = async (file: File) => {
    if (!item) return
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.set('photo', file)
      fd.set('equipment_id', item.id)
      const res = await fetch('/api/equipment/upload-photo', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error || 'Upload failed', 'error'); return }
      const { error } = await supabase
        .from('equipment')
        .update({ photo_url: data.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      if (error) { toast(error.message, 'error'); return }
      if (userId) {
        await supabase.from('equipment_activity').insert({ equipment_id: item.id, action: 'updated', detail: 'Photo updated', user_id: userId })
      }
      toast('Photo updated', 'success')
      loadData()
    } catch {
      toast('Upload failed', 'error')
    } finally {
      setPhotoUploading(false)
    }
  }

  const unlinkPowerCable = async (cableId: string) => {
    if (!canEdit) return
    const { error } = await supabase
      .from('equipment')
      .update({ parent_equipment_id: null, updated_at: new Date().toISOString() })
      .eq('id', cableId)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('Power cable unlinked', 'success')
    loadData()
  }

  const savePowerFromDevice = async () => {
    if (!item || itemIsPower) return
    const connector =
      powerForm.power_input_preset === 'Other' ? powerForm.power_input_other.trim() : powerForm.power_input_preset
    if (!powerForm.name.trim() || !connector || !powerForm.category_id) {
      toast('Name, connector, and category are required', 'error')
      return
    }
    setPowerSaving(true)
    try {
      let nextTag: string
      try {
        nextTag = await getNextPowerCableAssetTag(supabase)
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'Could not allocate PWR tag', 'error')
        setPowerSaving(false)
        return
      }
      const { data, error } = await supabase
        .from('equipment')
        .insert({
          asset_tag: nextTag,
          name: powerForm.name.trim(),
          is_power_cable: true,
          parent_equipment_id: item.id,
          category_id: powerForm.category_id,
          power_input_connector: connector,
          power_brand: powerForm.power_brand.trim() || null,
          power_output_voltage: powerForm.power_output_voltage.trim() || null,
          power_output_amperage: powerForm.power_output_amperage.trim() || null,
          power_output_polarity: powerForm.power_output_polarity,
          power_barrel_size: powerForm.power_barrel_size.trim() || null,
          brand: powerForm.power_brand.trim() || null,
          model: null,
          site: normalizeEquipmentSite(powerForm.site),
          condition: normalizeEquipmentCondition(powerForm.condition),
          status: 'available',
          notes: powerForm.notes.trim() || null,
          photo_url: `/images/equipment/${nextTag}.png`,
        })
        .select('*')
        .single()
      if (error) {
        toast(error.message.includes('column') ? 'Run db/equipment_power_cables.sql in Supabase, then retry.' : error.message, 'error')
        setPowerSaving(false)
        return
      }
      if (data && userId) {
        await supabase.from('equipment_activity').insert({
          equipment_id: data.id,
          action: 'created',
          detail: `Power cable ${nextTag} linked to ${item.asset_tag}`,
          user_id: userId,
        })
      }
      setPowerForm({
        name: '',
        power_input_preset: 'IEC C13',
        power_input_other: '',
        category_id: '',
        power_brand: '',
        power_output_voltage: '',
        power_output_amperage: '',
        power_output_polarity: 'na',
        power_barrel_size: '',
        notes: '',
        condition: DEFAULT_EQUIPMENT_CONDITION,
        site: DEFAULT_EQUIPMENT_SITE,
      })
      setShowPowerAdd(false)
      toast('Power cable added', 'success')
      loadData()
    } finally {
      setPowerSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!item) return
    setSaving(true)
    await supabase.from('equipment').update({
      name: editForm.name, brand: editForm.brand || null, model: editForm.model || null,
      serial_number: editForm.serial_number || null, status: editForm.status, site: normalizeEquipmentSite(editForm.site),
      condition: normalizeEquipmentCondition(editForm.condition), notes: editForm.notes || null, updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    if (editForm.status !== item.status) {
      await supabase.from('equipment_activity').insert({ equipment_id: item.id, action: 'status_changed', detail: `${item.status} to ${editForm.status}`, user_id: userId })
    }
    setItem(prev => prev ? { ...prev, name: editForm.name, brand: editForm.brand || null, model: editForm.model || null, serial_number: editForm.serial_number || null, status: editForm.status, site: editForm.site, condition: editForm.condition, notes: editForm.notes || null } : null)
    setEditing(false); setSaving(false); setSavedMsg('Saved!'); setTimeout(() => setSavedMsg(''), 2000)
  }

  // Copy this item to a new entry. Everything carries over except the asset tag
  // (the user enters a new one) and the serial number (unique to each unit).
  const duplicateItem = async () => {
    if (!item || !dupTag) return
    const tag = dupTag.padStart(4, '0')
    setDupSaving(true)
    const { data, error } = await supabase
      .from('equipment')
      .insert({
        asset_tag: tag,
        name: item.name,
        brand: item.brand,
        model: item.model,
        serial_number: null,
        category_id: item.category_id,
        subcategory_id: item.subcategory_id,
        status: 'available',
        site: item.site,
        condition: item.condition,
        notes: item.notes,
        photo_url: item.photo_url ?? null,
      })
      .select()
      .single()
    if (error) {
      toast(/duplicate|unique/i.test(error.message) ? `Asset tag ${tag} already exists` : error.message, 'error')
      setDupSaving(false)
      return
    }
    if (data) {
      await supabase.from('equipment_activity').insert({ equipment_id: data.id, action: 'created', detail: `Duplicated from ${item.asset_tag} — ${item.name} (${tag})`, user_id: userId })
      toast(`Created ${tag}`, 'success')
      router.push(`/dashboard/equipment/${tag}`)
    }
    setDupSaving(false)
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

  const handleDelete = async () => {
    if (!item || !canDelete || deleting) return
    // Don't delete something that's still physically out. Make them check it in first.
    if (loans.some(l => !l.checked_in_at)) {
      toast('Check this item in before deleting it.', 'error')
      return
    }
    const ok = await confirmDialog({
      title: 'Delete equipment',
      message: `Delete ${item.asset_tag} — ${item.name}? This permanently removes the record along with its loan and activity history. This can't be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    const { error } = await supabase.from('equipment').delete().eq('id', item.id)
    if (error) {
      toast(error.message || 'Delete failed', 'error')
      setDeleting(false)
      return
    }
    toast('Equipment deleted', 'success')
    router.push('/dashboard/equipment')
  }

  const activeLoan = loans.find(l => !l.checked_in_at)
  const statusStyle = STATUS_COLORS[item?.status || ''] || STATUS_COLORS['available']

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>
  if (!item) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
      <p style={{ fontSize: '18px', color: text, fontWeight: 500 }}>Equipment not found</p>
      <p style={{ fontSize: '14px', color: muted, margin: '8px 0 20px' }}>No item with asset tag &quot;{tag}&quot;</p>
      <button onClick={() => router.push('/dashboard/equipment')} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Back to equipment</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => router.push('/dashboard/equipment')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>← Equipment</button>
        {savedMsg && <span style={{ fontSize: '13px', color: '#22c55e', marginLeft: 'auto' }}>{savedMsg}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: (item.photo_url || canEdit) ? '200px 1fr' : '1fr', gap: '20px', marginBottom: '20px' }}>
        {(item.photo_url || canEdit) && (
          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
            {item.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo_url} alt={item.name} style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: '100%', height: '150px', borderRadius: '10px', background: inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontSize: '13px' }}>No photo</div>
            )}
            {canEdit && (
              <div style={{ width: '100%', textAlign: 'center' }}>
                <FilePickButton
                  accept="image/png,image/jpeg,image/webp"
                  label={item.photo_url ? 'Replace photo' : 'Upload photo'}
                  changeLabel={photoUploading ? 'Uploading…' : (item.photo_url ? 'Replace photo' : 'Upload photo')}
                  onChange={f => { if (f) void uploadPhoto(f) }}
                />
                {photoUploading && <div style={{ fontSize: '12px', color: muted, marginTop: '6px' }}>Uploading…</div>}
              </div>
            )}
          </div>
        )}
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
            <div>
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px', fontFamily: 'monospace' }}>
                #{item.asset_tag}
                {itemIsPower && <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(96,165,250,0.2)', color: '#60a5fa', fontWeight: 700 }}>POWER</span>}
              </p>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: text, margin: 0 }}>{item.name}</h1>
              {(item.brand || item.model) && <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>{[item.brand, item.model].filter(Boolean).join(' ')}</p>}
            </div>
            <span style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', background: statusStyle.bg, color: statusStyle.color, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{item.status.replace('_', ' ')}</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: muted, flexWrap: 'wrap' as const }}>
            {getCatName(item.category_id) && <span>{getCatName(item.category_id)}{getCatName(item.subcategory_id) ? ` / ${getCatName(item.subcategory_id)}` : ''}</span>}
            <span>{formatEquipmentSite(item.site)}</span>
            <span>{formatEquipmentCondition(item.condition)}</span>
            {item.serial_number && <span>SN: {item.serial_number}</span>}
          </div>
          {kits.length > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
              {kits.map(k => (
                <span key={k.id} onClick={() => router.push(`/dashboard/equipment/kits/${k.id}`)} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', cursor: 'pointer' }}>Kit: {k.name}</span>
              ))}
            </div>
          )}
          {activeLoan && !itemIsPower && (
            <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)' }}>
              <p style={{ fontSize: '14px', color: '#f59e0b', fontWeight: 600, margin: '0 0 4px' }}>Checked out to {activeLoan.borrower_name}</p>
              <p style={{ fontSize: '12px', color: muted, margin: 0 }}>
                By {activeLoan.checked_out_by_user?.name || 'Unknown'} on {new Date(activeLoan.checked_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {activeLoan.due_date && ` | Due ${formatMonthDay(activeLoan.due_date)}`}
              </p>
              {canLoan && (
              <button onClick={() => handleCheckin(activeLoan)} style={{ marginTop: '10px', fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Check in</button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {canLoan && item.status === 'available' && !itemIsPower && (
              <button onClick={() => setShowCheckout(true)} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Check out</button>
            )}
            {canEdit && (
            <button onClick={() => setEditing(!editing)} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '10px', background: cardBg, color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
            )}
            {canEdit && !editing && (
            <button onClick={() => { setDupTag(''); setDupOpen(true) }} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '10px', background: cardBg, color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
              Duplicate
            </button>
            )}
            {canDelete && !editing && (
            <button onClick={handleDelete} disabled={deleting} style={{ marginLeft: 'auto', fontSize: '14px', padding: '9px 18px', borderRadius: '10px', background: 'transparent', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.5)', cursor: deleting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: deleting ? 0.6 : 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            )}
          </div>

          {dupOpen && (
            <div onClick={() => !dupSaving && setDupOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}>
              <div onClick={ev => ev.stopPropagation()} style={{ background: cardBg, borderRadius: '14px', padding: '22px', width: 'min(420px, 100%)', border: `1px solid ${border}` }}>
                <div style={{ fontSize: '17px', fontWeight: 600, color: text, marginBottom: '4px' }}>Duplicate item</div>
                <div style={{ fontSize: '13px', color: muted, lineHeight: 1.5, marginBottom: '16px' }}>
                  Creates a new entry copying everything from <b style={{ color: text }}>{item.asset_tag} — {item.name}</b> except the asset tag and serial number. Enter the new tag:
                </div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>New asset tag</label>
                <input
                  value={dupTag}
                  autoFocus
                  onChange={e => setDupTag(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={e => { if (e.key === 'Enter' && dupTag && !dupSaving) void duplicateItem() }}
                  placeholder="0000"
                  inputMode="numeric"
                  style={{ width: '120px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${border}`, background: 'var(--surface-1)', color: text, fontSize: '15px', fontFamily: 'monospace' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                  <button onClick={() => setDupOpen(false)} disabled={dupSaving} style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>Cancel</button>
                  <button onClick={() => void duplicateItem()} disabled={!dupTag || dupSaving} style={{ padding: '10px 20px', borderRadius: '8px', background: dupTag && !dupSaving ? 'var(--brand-primary)' : 'var(--surface-2)', color: dupTag && !dupSaving ? '#fff' : muted, border: 'none', cursor: dupTag && !dupSaving ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>{dupSaving ? 'Creating…' : 'Create copy'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCheckout && !itemIsPower && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 14px' }}>Check out {item.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Borrower name *</p><input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="Who is taking this?" style={inputStyle} autoFocus /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Info</p><input value={borrowerInfo} onChange={e => setBorrowerInfo(e.target.value)} placeholder="Class, phone (optional)" style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Due date</p><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} /></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Note</p><input value={checkoutNote} onChange={e => setCheckoutNote(e.target.value)} placeholder="Optional" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCheckout} disabled={!borrowerName.trim()} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: borrowerName.trim() ? 'var(--brand-primary)' : 'var(--surface-2)', color: borrowerName.trim() ? '#fff' : muted, border: 'none', cursor: borrowerName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>Confirm checkout</button>
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
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Site</p><select value={editForm.site} onChange={e => setEditForm(f => ({ ...f, site: normalizeEquipmentSite(e.target.value) }))} style={inputStyle}>{EQUIPMENT_SITE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            <div><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Condition</p><select value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: normalizeEquipmentCondition(e.target.value) }))} style={inputStyle}>{EQUIPMENT_CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: '12px' }}><p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Notes</p><textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Equipment notes..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} /></div>
          <button onClick={saveEdit} disabled={saving} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: '16px', flexWrap: 'wrap' as const }}>
        {(['info', 'power', 'loans', 'activity'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: '14px', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: tab === t ? 'var(--brand-primary)' : muted, borderBottom: tab === t ? '2px solid var(--brand-primary)' : '2px solid transparent', fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize' as const }}>
            {t === 'power'
              ? `Power${!itemIsPower ? ` (${linkedPowerCables.length})` : ''}`
              : t === 'loans' ? `Loan history (${loans.length})` : t === 'activity' ? `Activity (${activity.length})` : 'Details'}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          {item.notes && (<div style={{ marginBottom: '16px' }}><p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Notes</p><p style={{ fontSize: '14px', color: text, margin: 0, lineHeight: 1.6 }}>{item.notes}</p></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
            {(
              [
                ['Asset tag', `#${item.asset_tag}`],
                ['Name', item.name],
                ['Brand', item.brand],
                ['Model', item.model],
                ['Serial', item.serial_number],
                ['Category', getCatName(item.category_id)],
                ['Subcategory', getCatName(item.subcategory_id)],
                ['Site', formatEquipmentSite(item.site)],
                ['Condition', formatEquipmentCondition(item.condition)],
                ['Status', item.status.replace('_', ' ')],
                ['Added', new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
                ...(itemIsPower
                  ? ([
                      ['Input connector', item.power_input_connector || null],
                      ['Output voltage', item.power_output_voltage || null],
                      ['Output amperage', item.power_output_amperage || null],
                      ['Polarity', item.power_output_polarity || null],
                      ['Barrel / size', item.power_barrel_size || null],
                      ['Power brand', item.power_brand || null],
                      ['Output (short)', formatPowerSpecShort(item) || null],
                    ] as [string, string | null][])
                  : []),
              ] as [string, string | null][]
            ).map(([label, value]) => value ? (
              <div key={label}><p style={{ fontSize: '12px', color: muted, margin: '0 0 2px' }}>{label}</p><p style={{ color: text, margin: 0 }}>{value}</p></div>
            ) : null)}
          </div>
        </div>
      )}

      {tab === 'power' && !itemIsPower && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Power cables for this device</h3>
          {linkedPowerCables.length === 0 && <p style={{ color: muted, fontSize: '14px', margin: '0 0 12px' }}>No power cables linked. Add one to track bricks and cords for this unit.</p>}
          {linkedPowerCables.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${border}` }}>
              {c.photo_url ? <img src={c.photo_url} alt="" width={60} height={60} style={{ objectFit: 'cover', borderRadius: '8px', border: `1px solid ${border}` }} /> : <div style={{ width: 60, height: 60, borderRadius: '8px', background: inputBg }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <button type="button" onClick={() => router.push(`/dashboard/equipment/${c.asset_tag}`)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace', fontSize: '14px' }}>{c.asset_tag}</button>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>{[c.power_brand || c.brand, formatPowerSpecShort(c)].filter(Boolean).join(' · ') || c.name}</p>
              </div>
              {canEdit && (
                <button type="button" onClick={() => unlinkPowerCable(c.id)} style={{ fontSize: '13px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${border}`, background: 'transparent', color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Unlink</button>
              )}
            </div>
          ))}
          {canEdit && (
            <div style={{ marginTop: '16px' }}>
              {!showPowerAdd ? (
                <button type="button" onClick={() => setShowPowerAdd(true)} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Add power cable</button>
              ) : (
                <div style={{ marginTop: '12px', padding: '16px', borderRadius: '12px', border: `1px solid ${border}`, background: inputBg }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 12px' }}>New power cable linked to this device</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '12px', color: muted }}>Name *</label><input value={powerForm.name} onChange={e => setPowerForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: '12px', color: muted }}>Category *</label><select value={powerForm.category_id} onChange={e => setPowerForm(f => ({ ...f, category_id: e.target.value }))} style={inputStyle}><option value="">Select…</option>{topCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label style={{ fontSize: '12px', color: muted }}>Input *</label><select value={powerForm.power_input_preset} onChange={e => setPowerForm(f => ({ ...f, power_input_preset: e.target.value }))} style={inputStyle}>{POWER_INPUT_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                    {powerForm.power_input_preset === 'Other' && (
                      <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '12px', color: muted }}>Other connector</label><input value={powerForm.power_input_other} onChange={e => setPowerForm(f => ({ ...f, power_input_other: e.target.value }))} style={inputStyle} /></div>
                    )}
                    <div><label style={{ fontSize: '12px', color: muted }}>Brand</label><input value={powerForm.power_brand} onChange={e => setPowerForm(f => ({ ...f, power_brand: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: '12px', color: muted }}>Voltage</label><input value={powerForm.power_output_voltage} onChange={e => setPowerForm(f => ({ ...f, power_output_voltage: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: '12px', color: muted }}>Amperage</label><input value={powerForm.power_output_amperage} onChange={e => setPowerForm(f => ({ ...f, power_output_amperage: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: '12px', color: muted }}>Polarity</label><select value={powerForm.power_output_polarity} onChange={e => setPowerForm(f => ({ ...f, power_output_polarity: e.target.value as PowerPolarityDb }))} style={inputStyle}>{POWER_POLARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                    <div><label style={{ fontSize: '12px', color: muted }}>Barrel size</label><input value={powerForm.power_barrel_size} onChange={e => setPowerForm(f => ({ ...f, power_barrel_size: e.target.value }))} style={inputStyle} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button type="button" disabled={powerSaving} onClick={savePowerFromDevice} style={{ fontSize: '14px', padding: '8px 16px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: powerSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}>{powerSaving ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setShowPowerAdd(false)} style={{ fontSize: '14px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'power' && itemIsPower && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 12px' }}>What this powers</h3>
          {parentDevice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' as const }}>
              {parentDevice.photo_url && <img src={parentDevice.photo_url} alt="" width={72} height={72} style={{ objectFit: 'cover', borderRadius: '10px', border: `1px solid ${border}` }} />}
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: muted }}>Device</p>
                <button type="button" onClick={() => router.push(`/dashboard/equipment/${parentDevice.asset_tag}`)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer', fontSize: '16px', fontFamily: 'inherit' }}>{parentDevice.asset_tag} — {parentDevice.name}</button>
              </div>
              {canEdit && (
                <button type="button" onClick={() => unlinkPowerCable(item.id)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: `1px solid ${border}`, background: 'transparent', color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Unlink from device</button>
              )}
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#fbbf24', fontWeight: 700 }}>Orphan — not linked to a device</p>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: muted }}>Link this cable from the device&apos;s <strong style={{ color: text }}>Power</strong> tab (add existing orphan — coming soon), or leave it unlinked until paired.</p>
            </div>
          )}
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
                  {loan.due_date && ` | Due ${formatMonthDay(loan.due_date)}`}
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
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--brand-primary)', marginTop: '6px', flexShrink: 0 }} />
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