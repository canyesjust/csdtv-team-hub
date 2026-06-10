'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTheme } from '@/lib/theme'
import { confirmDialog } from '@/lib/confirm'
import AsyncButton from '../components/AsyncButton'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
import { canAddOrEditEquipment, canDeleteEquipment, canManageEquipmentKits } from '@/lib/equipment-access'
import {
  DEFAULT_EQUIPMENT_CONDITION,
  DEFAULT_EQUIPMENT_SITE,
  EQUIPMENT_CONDITION_OPTIONS,
  EQUIPMENT_SITE_OPTIONS,
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

type Category = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
}

type Equipment = {
  id: string
  asset_tag: string
  name: string
  category_id: string | null
  subcategory_id: string | null
  brand: string | null
  model: string | null
  serial_number: string | null
  status: string
  site: string
  condition: string
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
  is_power_cable?: boolean | null
  parent_equipment_id?: string | null
  power_input_connector?: string | null
  power_output_voltage?: string | null
  power_output_amperage?: string | null
  power_output_polarity?: string | null
  power_barrel_size?: string | null
  power_brand?: string | null
}

type Kit = {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  items?: { equipment_id: string; equipment: Equipment }[]
}

type Loan = {
  id: string
  equipment_id: string | null
  kit_id: string | null
  borrower_name: string
  borrower_info: string | null
  checked_out_by: string
  checked_out_at: string
  due_date: string | null
  checked_in_at: string | null
  notes: string | null
  equipment?: Equipment | null
  kit?: Kit | null
  checked_out_by_user?: { name: string } | null
}

type TeamMember = {
  id: string
  name: string
  role: string
}

export default function EquipmentPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const router = useRouter()
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const [tab, setTab] = useState<'items' | 'kits' | 'loans'>('items')
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [user, setUser] = useState<TeamMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSite, setFilterSite] = useState('')

  const [listMode, setListMode] = useState<'regular' | 'power'>('regular')
  const [powerSub, setPowerSub] = useState<'all' | 'paired' | 'orphan'>('all')
  const [powerSort, setPowerSort] = useState<'tag' | 'voltage' | 'parent'>('tag')
  const [showPowerForm, setShowPowerForm] = useState(false)
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

  // Kit form
  const [showKitForm, setShowKitForm] = useState(false)
  const [kitName, setKitName] = useState('')
  const [kitDesc, setKitDesc] = useState('')

  // Checkout modal
  const [checkoutItem, setCheckoutItem] = useState<Equipment | null>(null)
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerInfo, setBorrowerInfo] = useState('')
  const [dueDate, setDueDate] = useState('')

  // Add item form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ asset_tag: '', name: '', brand: '', model: '', serial_number: '', category_id: '', subcategory_id: '', site: DEFAULT_EQUIPMENT_SITE, condition: DEFAULT_EQUIPMENT_CONDITION, notes: '' })
  const [addSaving, setAddSaving] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const userData = await resolveEffectiveTeamRow<TeamMember>(supabase, '*')
    if (userData) setUser(userData)

    const [eqRes, catRes, kitRes, loanRes] = await Promise.all([
      supabase.from('equipment').select('*').order('asset_tag'),
      supabase.from('equipment_categories').select('*').order('sort_order'),
      supabase.from('equipment_kits').select('*, items:equipment_kit_items(equipment_id, equipment(*))').order('name'),
      supabase.from('equipment_loans').select('*, equipment(*), kit:equipment_kits(*), checked_out_by_user:team!equipment_loans_checked_out_by_fkey(name)').is('checked_in_at', null).order('checked_out_at', { ascending: false }),
    ])

    setEquipment(eqRes.data || [])
    setCategories(catRes.data || [])
    setKits(kitRes.data as any || [])
    setLoans(loanRes.data as any || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const saveNewItem = async () => {
    if (!addForm.asset_tag || !addForm.name || !user) return
    setAddSaving(true)
    const tag = addForm.asset_tag.padStart(4, '0')
    const { data, error } = await supabase.from('equipment').insert({
      asset_tag: tag,
      name: addForm.name,
      brand: addForm.brand || null,
      model: addForm.model || null,
      serial_number: addForm.serial_number || null,
      category_id: addForm.category_id || null,
      subcategory_id: addForm.subcategory_id || null,
      site: normalizeEquipmentSite(addForm.site),
      condition: normalizeEquipmentCondition(addForm.condition),
      status: 'available',
      notes: addForm.notes || null,
      photo_url: `/images/equipment/${tag}.png`,
    }).select('*').single()
    if (error) { toast('Error: ' + error.message); setAddSaving(false); return }
    if (data) {
      await supabase.from('equipment_activity').insert({ equipment_id: data.id, action: 'created', detail: `Added ${addForm.name} (${tag})`, user_id: user.id })
      setEquipment(prev => [...prev, data].sort((a, b) => a.asset_tag.localeCompare(b.asset_tag)))
    }
    setAddForm({ asset_tag: '', name: '', brand: '', model: '', serial_number: '', category_id: '', subcategory_id: '', site: DEFAULT_EQUIPMENT_SITE, condition: DEFAULT_EQUIPMENT_CONDITION, notes: '' })
    setShowAddForm(false)
    setAddSaving(false)
  }

  const topCategories = categories.filter(c => !c.parent_id)
  const getCategoryName = (id: string | null) => {
    if (!id) return ''
    return categories.find(c => c.id === id)?.name || ''
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'available': return { bg: dark ? '#16382a' : '#dcfce7', text: '#22c55e' }
      case 'checked_out': return { bg: dark ? '#3b2a15' : '#fef3c7', text: '#f59e0b' }
      case 'broken': return { bg: dark ? '#3b1515' : '#fee2e2', text: '#ef4444' }
      case 'maintenance': return { bg: dark ? '#1e2a4a' : '#dbeafe', text: '#3b82f6' }
      case 'retired': return { bg: dark ? '#1f1f2e' : '#f3f4f6', text: '#6b7280' }
      default: return { bg: dark ? '#1f1f2e' : '#f3f4f6', text: '#6b7280' }
    }
  }

  const canAddEquipment = canAddOrEditEquipment(user?.role)
  const canManageKits = canManageEquipmentKits(user?.role)
  const canDeleteRows = canDeleteEquipment(user?.role)

  const filtered = useMemo(() => {
    const rows = equipment.filter(e => {
      if (listMode === 'regular' && isPowerCableRow(e)) return false
      if (listMode === 'power' && !isPowerCableRow(e)) return false
      if (listMode === 'power') {
        if (powerSub === 'paired' && !e.parent_equipment_id) return false
        if (powerSub === 'orphan' && e.parent_equipment_id) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const spec = formatPowerSpecShort(e).toLowerCase()
        const matches =
          e.asset_tag.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          (e.brand || '').toLowerCase().includes(q) ||
          (e.model || '').toLowerCase().includes(q) ||
          (e.serial_number || '').toLowerCase().includes(q) ||
          (e.power_input_connector || '').toLowerCase().includes(q) ||
          (e.power_brand || '').toLowerCase().includes(q) ||
          spec.includes(q)
        if (!matches) return false
      }
      if (filterCategory && e.category_id !== filterCategory) return false
      if (filterStatus && e.status !== filterStatus) return false
      if (filterSite && e.site !== filterSite) return false
      return true
    })
    if (listMode !== 'power') return rows
    const sorted = [...rows]
    if (powerSort === 'tag') sorted.sort((a, b) => a.asset_tag.localeCompare(b.asset_tag))
    else if (powerSort === 'voltage') sorted.sort((a, b) => (a.power_output_voltage || '').localeCompare(b.power_output_voltage || ''))
    else {
      sorted.sort((a, b) => {
        const pa = a.parent_equipment_id ? equipment.find(x => x.id === a.parent_equipment_id)?.name || '' : ''
        const pb = b.parent_equipment_id ? equipment.find(x => x.id === b.parent_equipment_id)?.name || '' : ''
        return pa.localeCompare(pb)
      })
    }
    return sorted
  }, [equipment, listMode, powerSub, powerSort, search, filterCategory, filterStatus, filterSite])

  const regularEquipment = useMemo(() => equipment.filter(e => !isPowerCableRow(e)), [equipment])

  /** Equipment IDs that are accounted for by an open loan (single-item or kit membership). */
  const equipmentIdsCoveredByOpenLoans = useMemo(() => {
    const s = new Set<string>()
    for (const loan of loans) {
      if (loan.equipment_id) s.add(loan.equipment_id)
      if (loan.kit_id) {
        const kit = kits.find(k => k.id === loan.kit_id)
        for (const it of kit?.items || []) {
          if (it.equipment_id) s.add(it.equipment_id)
        }
      }
    }
    return s
  }, [loans, kits])

  /** Status says checked out but no open loan covers this row (data drift or legacy). */
  const orphanCheckedOut = useMemo(
    () =>
      regularEquipment.filter(
        e => e.status === 'checked_out' && !equipmentIdsCoveredByOpenLoans.has(e.id),
      ),
    [regularEquipment, equipmentIdsCoveredByOpenLoans],
  )

  const activeLoansTabCount = loans.length + orphanCheckedOut.length

  const stats = {
    total: listMode === 'regular' ? regularEquipment.length : equipment.filter(isPowerCableRow).length,
    available: regularEquipment.filter(e => e.status === 'available').length,
    checkedOut: regularEquipment.filter(e => e.status === 'checked_out').length,
    broken: regularEquipment.filter(e => e.status === 'broken').length,
  }

  const handleCheckout = useCallback(async () => {
    if (!checkoutItem || !borrowerName.trim() || !user) return
    const res = await fetch('/api/equipment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipmentId: checkoutItem.id,
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

    setCheckoutItem(null)
    setBorrowerName('')
    setBorrowerInfo('')
    setDueDate('')
    loadData()
  }, [checkoutItem, borrowerName, borrowerInfo, dueDate, user, supabase, loadData])

  const handleClearOrphanCheckoutStatus = useCallback(
    async (eq: Equipment) => {
      if (!user || !canDeleteRows) return
      if (
        !(await confirmDialog({
          message: `${eq.asset_tag} is marked checked out but has no open loan record. Mark it available? (Use only if the item was returned or the record was wrong.)`,
          confirmLabel: 'Mark available',
        }))
      )
        return
      const { error } = await supabase
        .from('equipment')
        .update({ status: 'available', updated_at: new Date().toISOString() })
        .eq('id', eq.id)
        .eq('status', 'checked_out')
      if (error) {
        toast('Error: ' + error.message, 'error')
        return
      }
      await supabase.from('equipment_activity').insert({
        equipment_id: eq.id,
        action: 'checked_in',
        detail: `Status corrected to available (no loan row; was checked_out)`,
        user_id: user.id,
      })
      toast('Item marked available')
      loadData()
    },
    [user, canDeleteRows, supabase, loadData],
  )

  const handleCreateKit = useCallback(async () => {
    if (!kitName.trim() || !user) return
    const { error } = await supabase.from('equipment_kits').insert({
      name: kitName.trim(),
      description: kitDesc.trim() || null,
      created_by: user.id,
    })
    if (error) { toast('Error: ' + error.message); return }
    setKitName('')
    setKitDesc('')
    setShowKitForm(false)
    loadData()
  }, [kitName, kitDesc, user, supabase, loadData])

  const handleDeleteKit = useCallback(async (kitId: string) => {
    if (!(await confirmDialog({ message: 'Delete this kit? Items won\'t be deleted, just ungrouped.', tone: 'danger' }))) return
    const { error } = await supabase.from('equipment_kits').delete().eq('id', kitId)
    if (error) { toast('Error: ' + error.message); return }
    loadData()
  }, [supabase, loadData])

  const savePowerCable = useCallback(async () => {
    if (!user) return
    const connector =
      powerForm.power_input_preset === 'Other' ? powerForm.power_input_other.trim() : powerForm.power_input_preset
    if (!powerForm.name.trim() || !connector) {
      toast('Name and input connector are required', 'error')
      return
    }
    if (!powerForm.category_id) {
      toast('Category is required for power cables', 'error')
      return
    }
    setPowerSaving(true)
    try {
      let tag: string
      try {
        tag = await getNextPowerCableAssetTag(supabase)
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'Could not allocate PWR tag', 'error')
        setPowerSaving(false)
        return
      }
      const { data, error } = await supabase
        .from('equipment')
        .insert({
          asset_tag: tag,
          name: powerForm.name.trim(),
          is_power_cable: true,
          parent_equipment_id: null,
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
          photo_url: `/images/equipment/${tag}.png`,
        })
        .select('*')
        .single()
      if (error) {
        toast(error.message.includes('column') ? 'Run the power-cable DB migration in Supabase (db/equipment_power_cables.sql), then retry.' : error.message, 'error')
        setPowerSaving(false)
        return
      }
      if (data) {
        await supabase.from('equipment_activity').insert({
          equipment_id: data.id,
          action: 'created',
          detail: `Added power cable ${tag}`,
          user_id: user.id,
        })
        setEquipment(prev => [...prev, data as Equipment].sort((a, b) => a.asset_tag.localeCompare(b.asset_tag)))
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
      setShowPowerForm(false)
      toast('Power cable created', 'success')
    } finally {
      setPowerSaving(false)
    }
  }, [powerForm, supabase, user])

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px',
    padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const, minHeight: '44px',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: 0 }}>Equipment</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>
            {listMode === 'power'
              ? `${equipment.filter(isPowerCableRow).length} power cables`
              : `${stats.total} items tracked`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/dashboard/equipment/scan')}
            style={{
              background: 'var(--surface-2)', border: `1px solid ${border}`, borderRadius: '10px',
              padding: '10px 16px', fontSize: '14px', color: '#5ba3e0', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            📷 Scan
          </button>
          {canAddEquipment && listMode === 'regular' && (
            <button
              onClick={() => { setShowPowerForm(false); setShowAddForm(!showAddForm) }}
              style={{
                background: '#1e6cb5', border: 'none', borderRadius: '10px',
                padding: '10px 16px', fontSize: '14px', color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              + Add item
            </button>
          )}
          {canAddEquipment && listMode === 'power' && (
            <button
              onClick={() => { setShowAddForm(false); setShowPowerForm(!showPowerForm) }}
              style={{
                background: '#1e6cb5', border: 'none', borderRadius: '10px',
                padding: '10px 16px', fontSize: '14px', color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              + Add power cable
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '13px', color: muted, fontWeight: 600 }}>View</span>
        <button
          type="button"
          onClick={() => { setListMode('regular'); setPowerSub('all'); setShowPowerForm(false) }}
          style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${border}`,
            background: listMode === 'regular' ? '#1e6cb5' : cardBg, color: listMode === 'regular' ? '#fff' : muted,
          }}
        >
          All equipment
        </button>
        <button
          type="button"
          onClick={() => { setListMode('power'); setShowAddForm(false) }}
          style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${border}`,
            background: listMode === 'power' ? '#1e6cb5' : cardBg, color: listMode === 'power' ? '#fff' : muted,
          }}
        >
          Power cables
        </button>
        {listMode === 'power' && (
          <>
            <span style={{ width: '1px', height: '22px', background: border, margin: '0 4px' }} />
            {(['all', 'paired', 'orphan'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setPowerSub(s)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${border}`,
                  background: powerSub === s ? 'rgba(30,108,181,0.25)' : 'transparent', color: text, textTransform: 'capitalize' as const,
                }}
              >
                {s}
              </button>
            ))}
            <select value={powerSort} onChange={e => setPowerSort(e.target.value as 'tag' | 'voltage' | 'parent')} style={{ ...inputStyle, maxWidth: '200px', marginLeft: '8px' }}>
              <option value="tag">Sort: Asset tag</option>
              <option value="voltage">Sort: Output voltage</option>
              <option value="parent">Sort: Parent device</option>
            </select>
          </>
        )}
      </div>

      {/* Add item form */}
      {showAddForm && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 16px' }}>Add new equipment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Asset tag *</label>
              <input value={addForm.asset_tag} onChange={e => setAddForm(f => ({ ...f, asset_tag: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="0000" inputMode="numeric"
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Name *</label>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Canon EOS R5"
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Brand</label>
              <input value={addForm.brand} onChange={e => setAddForm(f => ({ ...f, brand: e.target.value }))} placeholder="Canon"
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Model</label>
              <input value={addForm.model} onChange={e => setAddForm(f => ({ ...f, model: e.target.value }))} placeholder="EOS R5"
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Serial number</label>
              <input value={addForm.serial_number} onChange={e => setAddForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="Optional"
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Category</label>
              <select value={addForm.category_id} onChange={e => setAddForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}>
                <option value="">None</option>
                {topCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {addForm.category_id && categories.filter(c => c.parent_id === addForm.category_id).length > 0 && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Subcategory</label>
                <select value={addForm.subcategory_id} onChange={e => setAddForm(f => ({ ...f, subcategory_id: e.target.value }))}
                  style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}>
                  <option value="">None</option>
                  {categories.filter(c => c.parent_id === addForm.category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Site</label>
              <select value={addForm.site} onChange={e => setAddForm(f => ({ ...f, site: normalizeEquipmentSite(e.target.value) }))}
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}>
                {EQUIPMENT_SITE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Condition</label>
              <select value={addForm.condition} onChange={e => setAddForm(f => ({ ...f, condition: normalizeEquipmentCondition(e.target.value) }))}
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}>
                {EQUIPMENT_CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Notes</label>
            <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes"
              style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, minHeight: '60px', resize: 'vertical' as const }} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={saveNewItem} disabled={!addForm.asset_tag || !addForm.name || addSaving}
              style={{ padding: '10px 20px', borderRadius: '8px', background: addForm.asset_tag && addForm.name ? '#1e6cb5' : 'var(--surface-2)', color: addForm.asset_tag && addForm.name ? '#fff' : muted, border: 'none', cursor: addForm.asset_tag && addForm.name ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>
              {addSaving ? 'Saving...' : 'Save item'}
            </button>
            <button onClick={() => setShowAddForm(false)}
              style={{ padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showPowerForm && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 16px' }}>Add power cable (orphan — link from device later)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Name *</label>
              <input value={powerForm.name} onChange={e => setPowerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Atomos DC brick"
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Category *</label>
              <select value={powerForm.category_id} onChange={e => setPowerForm(f => ({ ...f, category_id: e.target.value }))} style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit' }}>
                <option value="">Select…</option>
                {topCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Input connector *</label>
              <select value={powerForm.power_input_preset} onChange={e => setPowerForm(f => ({ ...f, power_input_preset: e.target.value }))} style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit' }}>
                {POWER_INPUT_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {powerForm.power_input_preset === 'Other' && (
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Other connector</label>
                <input value={powerForm.power_input_other} onChange={e => setPowerForm(f => ({ ...f, power_input_other: e.target.value }))} placeholder="Describe connector"
                  style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            )}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Brand</label>
              <input value={powerForm.power_brand} onChange={e => setPowerForm(f => ({ ...f, power_brand: e.target.value }))} style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Output voltage</label>
              <input value={powerForm.power_output_voltage} onChange={e => setPowerForm(f => ({ ...f, power_output_voltage: e.target.value }))} placeholder="12V" style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Output amperage</label>
              <input value={powerForm.power_output_amperage} onChange={e => setPowerForm(f => ({ ...f, power_output_amperage: e.target.value }))} placeholder="5A" style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Polarity</label>
              <select value={powerForm.power_output_polarity} onChange={e => setPowerForm(f => ({ ...f, power_output_polarity: e.target.value as PowerPolarityDb }))} style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit' }}>
                {POWER_POLARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Barrel / output size</label>
              <input value={powerForm.power_barrel_size} onChange={e => setPowerForm(f => ({ ...f, power_barrel_size: e.target.value }))} placeholder="5.5x2.5mm" style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Site</label>
              <select value={powerForm.site} onChange={e => setPowerForm(f => ({ ...f, site: normalizeEquipmentSite(e.target.value) }))} style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit' }}>
                {EQUIPMENT_SITE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Condition</label>
              <select value={powerForm.condition} onChange={e => setPowerForm(f => ({ ...f, condition: normalizeEquipmentCondition(e.target.value) }))} style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit' }}>
                {EQUIPMENT_CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px' }}>Notes</label>
            <textarea value={powerForm.notes} onChange={e => setPowerForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional — cable length, etc." style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', minHeight: '56px', resize: 'vertical' as const }} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={savePowerCable} disabled={powerSaving} style={{ padding: '10px 20px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: powerSaving ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>
              {powerSaving ? 'Saving…' : 'Save power cable'}
            </button>
            <button type="button" onClick={() => setShowPowerForm(false)} style={{ padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total', value: stats.total, color: '#5ba3e0' },
          { label: 'Available', value: stats.available, color: '#22c55e' },
          { label: 'Checked Out', value: stats.checkedOut, color: '#f59e0b' },
          { label: 'Broken', value: stats.broken, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{
            background: cardBg, borderRadius: '14px', padding: '16px',
            border: `1px solid ${border}`,
          }}>
            <div style={{ fontSize: '13px', color: muted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `1px solid ${border}`, paddingBottom: '0' }}>
        {(['items', 'kits', 'loans'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #5ba3e0' : '2px solid transparent',
              padding: '10px 18px', fontSize: '14px', fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'capitalize' as const,
            }}
          >
            {t === 'items'
              ? `Items (${listMode === 'regular' ? equipment.filter(e => !isPowerCableRow(e)).length : equipment.filter(isPowerCableRow).length})`
              : t === 'kits' ? `Kits (${kits.length})` : `Active Loans (${activeLoansTabCount})`}
          </button>
        ))}
      </div>

      {/* Items Tab */}
      {tab === 'items' && (
        <div>
          {/* Search and Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search by tag, name, brand, model..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, maxWidth: '360px', flex: '1 1 200px' }}
            />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, maxWidth: '200px', flex: '0 1 200px' }}>
              <option value="">All Categories</option>
              {topCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, maxWidth: '160px', flex: '0 1 160px' }}>
              <option value="">All Statuses</option>
              <option value="available">Available</option>
              <option value="checked_out">Checked Out</option>
              <option value="broken">Broken</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
            <select value={filterSite} onChange={e => setFilterSite(e.target.value)} style={{ ...inputStyle, maxWidth: '160px', flex: '0 1 160px' }}>
              <option value="">All Sites</option>
              {EQUIPMENT_SITE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Results count */}
          {(search || filterCategory || filterStatus || filterSite || listMode === 'power') && (
            <p style={{ fontSize: '13px', color: muted, marginBottom: '12px' }}>
              Showing {filtered.length} of {listMode === 'power' ? equipment.filter(isPowerCableRow).length : equipment.filter(e => !isPowerCableRow(e)).length}{' '}
              {listMode === 'power' ? 'power cables' : 'items'}
              <button onClick={() => { setSearch(''); setFilterCategory(''); setFilterStatus(''); setFilterSite(''); setListMode('regular'); setPowerSub('all') }}
                style={{ background: 'none', border: 'none', color: '#5ba3e0', cursor: 'pointer', fontSize: '13px', marginLeft: '8px', fontFamily: 'inherit' }}>
                Clear filters
              </button>
            </p>
          )}

          {/* Equipment table */}
          {listMode === 'power' ? (
            <div className="csdtv-equipment-table" style={{ background: cardBg, borderRadius: '14px', border: `1px solid ${border}`, overflow: 'hidden' }}>
              <div className="csdtv-eq-header" style={{ display: 'grid', gridTemplateColumns: '88px 40px 100px 1fr minmax(100px, 1fr) 100px', padding: '12px 16px', borderBottom: `1px solid ${border}`, fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                <span>Tag</span><span></span><span>Brand</span><span>Name / input</span><span>Output</span><span>Parent</span>
              </div>
              {filtered.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center' as const, color: muted, fontSize: '14px' }}>
                  No power cables match. Add one with <strong style={{ color: text }}>+ Add power cable</strong> or from a device&apos;s Power tab.
                </div>
              )}
              {filtered.map((e, i) => {
                const parent = e.parent_equipment_id ? equipment.find(x => x.id === e.parent_equipment_id) : null
                return (
                  <div
                    key={e.id}
                    onClick={() => router.push(`/dashboard/equipment/${e.asset_tag}`)}
                    className="csdtv-eq-row"
                    style={{ display: 'grid', gridTemplateColumns: '88px 40px 100px 1fr minmax(100px, 1fr) 100px', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${border}` : 'none', cursor: 'pointer', alignItems: 'center', fontSize: '14px', color: text, transition: 'background 0.15s' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = dark ? '#111d33' : '#f0f4ff')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '13px', color: '#5ba3e0' }}>{e.asset_tag}</span>
                    <span>{e.photo_url ? <img src={e.photo_url} alt="" loading="lazy" decoding="async" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', display: 'block' }} /> : <span style={{ width: '36px', height: '36px', borderRadius: '6px', background: dark ? '#111d33' : '#f0f4ff', display: 'block' }} />}</span>
                    <span style={{ color: muted, fontSize: '13px' }}>{e.power_brand || e.brand || '—'}</span>
                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{e.name}{e.power_input_connector ? <span style={{ color: muted, fontWeight: 400 }}> · {e.power_input_connector}</span> : null}</span>
                    <span style={{ color: muted, fontSize: '12px' }}>{formatPowerSpecShort(e) || '—'}</span>
                    <span style={{ fontSize: '12px' }}>
                      {parent ? (
                        <span style={{ color: '#5ba3e0', fontWeight: 600 }} onClick={ev => { ev.stopPropagation(); router.push(`/dashboard/equipment/${parent.asset_tag}`) }}>{parent.asset_tag}</span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 700 }}>Orphan</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="csdtv-equipment-table" style={{ background: cardBg, borderRadius: '14px', border: `1px solid ${border}`, overflow: 'hidden' }}>
            <div className="csdtv-eq-header" style={{ display: 'grid', gridTemplateColumns: '80px 44px 1fr 140px 160px 110px 90px 60px', padding: '12px 16px', borderBottom: `1px solid ${border}`, fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
              <span>Tag</span><span></span><span>Name</span><span>Brand</span><span>Category</span><span>Status</span><span>Site</span><span></span>
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center' as const, color: muted, fontSize: '14px' }}>No equipment found</div>
            )}

            {filtered.map((e, i) => {
              const sc = statusColor(e.status)
              return (
                <div key={e.id} onClick={() => router.push(`/dashboard/equipment/${e.asset_tag}`)} className="csdtv-eq-row" style={{ display: 'grid', gridTemplateColumns: '80px 44px 1fr 140px 160px 110px 90px 60px', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${border}` : 'none', cursor: 'pointer', alignItems: 'center', fontSize: '14px', color: text, transition: 'background 0.15s' }} onMouseEnter={ev => (ev.currentTarget.style.background = dark ? '#111d33' : '#f0f4ff')} onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '13px', color: '#5ba3e0' }}>{e.asset_tag}</span>
                  <span>{e.photo_url ? <img src={e.photo_url} alt="" loading="lazy" decoding="async" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', display: 'block' }} /> : <span style={{ width: '36px', height: '36px', borderRadius: '6px', background: dark ? '#111d33' : '#f0f4ff', display: 'block' }} />}</span>
                  <span style={{ fontWeight: 500 }}>{e.name}</span>
                  <span style={{ color: muted, fontSize: '13px' }}>{e.brand || '—'}</span>
                  <span style={{ color: muted, fontSize: '13px' }}>{getCategoryName(e.category_id)}</span>
                  <span>
                    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: sc.bg, color: sc.text }}>{e.status.replace('_', ' ')}</span>
                  </span>
                  <span style={{ color: muted, fontSize: '12px' }}>{formatEquipmentSite(e.site)}</span>
                  <span>
                    {e.status === 'available' && (
                      <button onClick={ev => { ev.stopPropagation(); setCheckoutItem(e) }} style={{ background: '#1e6cb5', border: 'none', borderRadius: '8px', color: '#fff', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Loan</button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}

      {/* Kits Tab */}
      {tab === 'kits' && (
        <div>
          {canManageKits && (
            <div style={{ marginBottom: '16px' }}>
              {!showKitForm ? (
                <button onClick={() => setShowKitForm(true)} style={{ background: '#1e6cb5', border: 'none', borderRadius: '10px', color: '#fff', padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', minHeight: '44px' }}>+ New Kit</button>
              ) : (
                <div style={{ background: cardBg, borderRadius: '14px', padding: '20px', border: `1px solid ${border}` }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: text, marginBottom: '12px' }}>Create Kit</div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <input placeholder="Kit name (e.g. Interview Kit)" value={kitName} onChange={e => setKitName(e.target.value)} style={{ ...inputStyle, flex: '1 1 250px' }} />
                    <input placeholder="Description (optional)" value={kitDesc} onChange={e => setKitDesc(e.target.value)} style={{ ...inputStyle, flex: '1 1 250px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleCreateKit} disabled={!kitName.trim()} style={{ background: kitName.trim() ? '#1e6cb5' : '#333', border: 'none', borderRadius: '10px', color: '#fff', padding: '10px 20px', fontSize: '14px', cursor: kitName.trim() ? 'pointer' : 'default', fontWeight: 600, fontFamily: 'inherit', minHeight: '44px' }}>Create</button>
                    <button onClick={() => { setShowKitForm(false); setKitName(''); setKitDesc('') }} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: '10px', color: muted, padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {kits.length === 0 && (
            <div style={{ background: cardBg, borderRadius: '14px', padding: '40px', textAlign: 'center' as const, color: muted, border: `1px solid ${border}` }}>No kits created yet. Kits let you group items and check them out together.</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
            {kits.map(kit => {
              const kitItems = kit.items || []
              return (
                <div key={kit.id} style={{ background: cardBg, borderRadius: '14px', padding: '20px', border: `1px solid ${border}`, cursor: 'pointer' }} onClick={() => router.push(`/dashboard/equipment/kits/${kit.id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: text }}>{kit.name}</div>
                    {canDeleteRows && (
                      <button onClick={ev => { ev.stopPropagation(); handleDeleteKit(kit.id) }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>Delete</button>
                    )}
                  </div>
                  {kit.description && <div style={{ fontSize: '13px', color: muted, marginBottom: '8px' }}>{kit.description}</div>}
                  <div style={{ fontSize: '13px', color: muted }}>{kitItems.length} item{kitItems.length !== 1 ? 's' : ''}</div>
                  {kitItems.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {kitItems.slice(0, 5).map((ki: any) => (
                        <span key={ki.equipment_id} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', background: dark ? '#111d33' : '#f0f4ff', color: '#5ba3e0', fontWeight: 500 }}>{ki.equipment?.asset_tag} — {ki.equipment?.name}</span>
                      ))}
                      {kitItems.length > 5 && <span style={{ fontSize: '11px', color: muted }}>+{kitItems.length - 5} more</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active Loans Tab */}
      {tab === 'loans' && (
        <div>
          {loans.length === 0 && orphanCheckedOut.length === 0 && (
            <div style={{ background: cardBg, borderRadius: '14px', padding: '40px', textAlign: 'center' as const, color: muted, border: `1px solid ${border}` }}>No items currently checked out.</div>
          )}

          {orphanCheckedOut.length > 0 && (
            <div
              style={{
                marginBottom: '14px',
                padding: '12px 14px',
                borderRadius: '12px',
                border: `1px solid ${dark ? '#854d0e' : '#fde68a'}`,
                background: dark ? '#1c1917' : '#fffbeb',
                color: text,
                fontSize: '13px',
              }}
            >
              <strong style={{ color: '#d97706' }}>No loan record</strong>
              {' — '}
              {orphanCheckedOut.length === 1
                ? 'One item is marked checked out in inventory but has no matching open loan (often from an old import or a partial checkout). It appears below so you can fix or check it in.'
                : `${orphanCheckedOut.length} items are marked checked out without an open loan row. They appear below.`}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loans.map(loan => {
              const isOverdue = loan.due_date && new Date(loan.due_date) < new Date()
              return (
                <div key={loan.id} style={{ background: cardBg, borderRadius: '14px', padding: '16px 20px', border: `1px solid ${isOverdue ? '#ef4444' : border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      {loan.equipment && <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#5ba3e0', fontWeight: 600 }}>{loan.equipment.asset_tag}</span>}
                      <span style={{ fontSize: '15px', fontWeight: 500, color: text }}>{loan.equipment?.name || loan.kit?.name || 'Unknown'}</span>
                      {isOverdue && <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: dark ? '#3b1515' : '#fee2e2', color: '#ef4444', textTransform: 'uppercase' as const }}>Overdue</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: muted }}>
                      Loaned to <strong style={{ color: text }}>{loan.borrower_name}</strong>
                      {loan.borrower_info && ` (${loan.borrower_info})`}
                      {' · '}by {(loan.checked_out_by_user as any)?.name || 'Unknown'}
                      {' · '}{new Date(loan.checked_out_at).toLocaleDateString()}
                      {loan.due_date && <span> · Due {new Date(loan.due_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <AsyncButton
                    onClick={async () => {
                      if (!user) return
                      if (!(await confirmDialog({ message: `Check in "${loan.equipment?.name || loan.kit?.name}" from ${loan.borrower_name}?`, confirmLabel: 'Check in' }))) return
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
                      loadData()
                    }}
                    style={{ background: '#22c55e', border: 'none', borderRadius: '10px', color: '#fff', padding: '8px 18px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', minHeight: '40px', whiteSpace: 'nowrap' as const }}
                  >Check In</AsyncButton>
                </div>
              )
            })}
            {orphanCheckedOut.map(eq => (
              <div
                key={`orphan-${eq.id}`}
                style={{
                  background: cardBg,
                  borderRadius: '14px',
                  padding: '16px 20px',
                  border: `1px solid ${dark ? '#854d0e' : '#fde68a'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#5ba3e0', fontWeight: 600 }}>{eq.asset_tag}</span>
                    <span style={{ fontSize: '15px', fontWeight: 500, color: text }}>{eq.name}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '20px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: dark ? '#3b2a15' : '#fef3c7',
                        color: '#d97706',
                        textTransform: 'uppercase' as const,
                      }}
                    >
                      No loan row
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: muted }}>
                    Inventory status is checked out, but there is no open row in <strong style={{ color: text }}>equipment_loans</strong>. Open the item to review history, or mark it available if it was returned.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/equipment/${eq.asset_tag}`)}
                    style={{
                      background: 'none',
                      border: `1px solid ${border}`,
                      borderRadius: '10px',
                      color: text,
                      padding: '8px 18px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      minHeight: '40px',
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    Open item
                  </button>
                  {canDeleteRows && (
                    <button
                      type="button"
                      onClick={() => handleClearOrphanCheckoutStatus(eq)}
                      style={{
                        background: '#22c55e',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        padding: '8px 18px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        minHeight: '40px',
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      Mark available
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: dark ? '#111827' : '#fff', borderRadius: '16px', padding: '28px', maxWidth: '440px', width: '100%', border: `1px solid ${border}` }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: text, marginBottom: '4px' }}>Check Out Equipment</div>
            <div style={{ fontSize: '13px', color: muted, marginBottom: '20px' }}>{checkoutItem.asset_tag} — {checkoutItem.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '4px' }}>Student / Borrower Name *</label>
                <input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="Enter name" style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '4px' }}>Additional Info (class, teacher, phone)</label>
                <input value={borrowerInfo} onChange={e => setBorrowerInfo(e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: muted, display: 'block', marginBottom: '4px' }}>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={handleCheckout} disabled={!borrowerName.trim()} style={{ background: borrowerName.trim() ? '#1e6cb5' : '#333', border: 'none', borderRadius: '10px', color: '#fff', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: borrowerName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', flex: 1, minHeight: '44px' }}>Confirm Checkout</button>
              <button onClick={() => { setCheckoutItem(null); setBorrowerName(''); setBorrowerInfo(''); setDueDate('') }} style={{ background: 'none', border: `1px solid ${border}`, borderRadius: '10px', color: muted, padding: '12px 24px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .csdtv-eq-header { display: none !important; }
          .csdtv-eq-row { grid-template-columns: 1fr !important; gap: 4px !important; }
        }
      `}</style>
    </div>
  )
}