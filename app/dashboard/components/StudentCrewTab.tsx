'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'

interface ProductionCrew {
  id: string
  production_id: string
  display_title: string | null
  call_time: string | null
  event_start_time: string | null
  end_time: string | null
  meeting_location: string | null
  what_youll_do: string | null
  food: string | null
  what_to_wear: string | null
  transportation_note: string | null
  requirements: string[] | null
  internal_note: string | null
  hide_names_on_public: boolean | null
}

interface CrewRole {
  id: string
  name: string
  description: string | null
}

interface CrewRoleSlot {
  id: string
  production_crew_id: string
  role_id: string
  capacity: number
  call_time: string | null
  end_time: string | null
  notes: string | null
  sort_order: number
}

interface CrewSignup {
  id: string
  crew_role_slot_id: string
  student_id: string
  signed_up_by: string | null
  signed_up_at: string
  students?: { name: string; student_number: string; grade: number | null } | null
}

interface Props {
  productionId: string
  productionNumber: number
  productionTitle: string
  isManager: boolean
}

const FOOD_OPTIONS = [
  'No food provided',
  'Pizza will be provided',
  'Snacks will be provided',
  'Bring your own dinner',
  'Bring a snack and water',
  'Dinner break — eat before arriving',
]

const TRANSPORT_OPTIONS = [
  'Get a ride from a parent',
  'Carpool with another crew member',
  'Drive yourself (parking instructions in notes)',
  'Walk from school',
  'Bus from school',
]

const WEAR_DEFAULT = 'CSDtv black polo and dark pants. Closed-toe shoes. No logos or graphics.'

export default function StudentCrewTab({ productionId, productionNumber, productionTitle, isManager }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [hasStudentCrew, setHasStudentCrew] = useState(false)
  const [crew, setCrew] = useState<ProductionCrew | null>(null)
  const [allRoles, setAllRoles] = useState<CrewRole[]>([])
  const [slots, setSlots] = useState<CrewRoleSlot[]>([])
  const [signups, setSignups] = useState<CrewSignup[]>([])
  const [loading, setLoading] = useState(true)

  // Form state for the setup card
  const [form, setForm] = useState({
    display_title: '',
    call_time: '',
    event_start_time: '',
    end_time: '',
    meeting_location: '',
    what_youll_do: '',
    food: 'No food provided',
    what_to_wear: WEAR_DEFAULT,
    transportation_note: '',
    requirements: [] as string[],
    internal_note: '',
    hide_names_on_public: false,
  })
  const [newReq, setNewReq] = useState('')
  const [savingForm, setSavingForm] = useState(false)
  const [formSaved, setFormSaved] = useState(false)

  // Slot editing
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [slotForm, setSlotForm] = useState({ role_id: '', capacity: '1', call_time: '', end_time: '', notes: '' })

  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#8899bb' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '40px',
  }

  const loadAll = useCallback(async () => {
    const [prodRes, rolesRes] = await Promise.all([
      supabase.from('productions').select('has_student_crew').eq('id', productionId).single(),
      supabase.from('crew_roles').select('*').order('name'),
    ])
    setAllRoles(rolesRes.data || [])
    const enabled = !!prodRes.data?.has_student_crew
    setHasStudentCrew(enabled)

    if (enabled) {
      const { data: crewRow } = await supabase.from('production_crew').select('*').eq('production_id', productionId).maybeSingle()
      if (crewRow) {
        setCrew(crewRow)
        setForm({
          display_title: crewRow.display_title || '',
          call_time: crewRow.call_time || '',
          event_start_time: crewRow.event_start_time || '',
          end_time: crewRow.end_time || '',
          meeting_location: crewRow.meeting_location || '',
          what_youll_do: crewRow.what_youll_do || '',
          food: crewRow.food || 'No food provided',
          what_to_wear: crewRow.what_to_wear || WEAR_DEFAULT,
          transportation_note: crewRow.transportation_note || '',
          requirements: Array.isArray(crewRow.requirements) ? crewRow.requirements : [],
          internal_note: crewRow.internal_note || '',
          hide_names_on_public: !!crewRow.hide_names_on_public,
        })

        const { data: slotsData } = await supabase.from('crew_role_slots').select('*').eq('production_crew_id', crewRow.id).order('sort_order')
        setSlots(slotsData || [])

        if (slotsData && slotsData.length > 0) {
          const slotIds = slotsData.map(s => s.id)
          const { data: signupData } = await supabase
            .from('crew_signups')
            .select('*, students(name, student_number, grade)')
            .in('crew_role_slot_id', slotIds)
            .order('signed_up_at')
          setSignups(signupData || [])
        }
      }
    }
    setLoading(false)
  }, [supabase, productionId])

  useEffect(() => { loadAll() }, [loadAll])

  const enableCrew = async () => {
    if (!isManager) return
    setLoading(true)
    // Update production
    await supabase.from('productions').update({ has_student_crew: true }).eq('id', productionId)
    // Create production_crew row if missing
    const { data: existing } = await supabase.from('production_crew').select('id').eq('production_id', productionId).maybeSingle()
    if (!existing) {
      await supabase.from('production_crew').insert({
        production_id: productionId,
        display_title: productionTitle,
        what_to_wear: WEAR_DEFAULT,
      })
    }
    setHasStudentCrew(true)
    toast('Student crew enabled', 'success')
    loadAll()
  }

  const disableCrew = async () => {
    if (!isManager) return
    if (!confirm('Disable student crew for this production? Existing sign-ups will remain in the database for reports but the public sign-up page will be hidden.')) return
    await supabase.from('productions').update({ has_student_crew: false }).eq('id', productionId)
    setHasStudentCrew(false)
    toast('Student crew disabled', 'success')
  }

  const saveForm = async () => {
    if (!crew) return
    setSavingForm(true)
    const payload = {
      display_title: form.display_title.trim() || null,
      call_time: form.call_time || null,
      event_start_time: form.event_start_time || null,
      end_time: form.end_time || null,
      meeting_location: form.meeting_location.trim() || null,
      what_youll_do: form.what_youll_do.trim() || null,
      food: form.food || null,
      what_to_wear: form.what_to_wear.trim() || null,
      transportation_note: form.transportation_note.trim() || null,
      requirements: form.requirements,
      internal_note: form.internal_note.trim() || null,
      hide_names_on_public: form.hide_names_on_public,
    }
    const { error } = await supabase.from('production_crew').update(payload).eq('id', crew.id)
    setSavingForm(false)
    if (error) { toast('Failed to save: ' + error.message, 'error'); return }
    setCrew(prev => prev ? { ...prev, ...payload } : prev)
    setFormSaved(true)
    setTimeout(() => setFormSaved(false), 2000)
  }

  const addRequirement = () => {
    if (!newReq.trim()) return
    setForm(f => ({ ...f, requirements: [...f.requirements, newReq.trim()] }))
    setNewReq('')
  }

  const removeRequirement = (idx: number) => {
    setForm(f => ({ ...f, requirements: f.requirements.filter((_, i) => i !== idx) }))
  }

  const addSlot = async () => {
    if (!crew) return
    if (!slotForm.role_id) { toast('Pick a role', 'error'); return }
    const cap = parseInt(slotForm.capacity) || 1
    if (cap < 1) { toast('Capacity must be at least 1', 'error'); return }
    const sortOrder = slots.length > 0 ? Math.max(...slots.map(s => s.sort_order)) + 1 : 0
    const { data, error } = await supabase.from('crew_role_slots').insert({
      production_crew_id: crew.id,
      role_id: slotForm.role_id,
      capacity: cap,
      call_time: slotForm.call_time || null,
      end_time: slotForm.end_time || null,
      notes: slotForm.notes.trim() || null,
      sort_order: sortOrder,
    }).select().single()
    if (error) { toast('Failed to add: ' + error.message, 'error'); return }
    if (data) setSlots(prev => [...prev, data])
    setShowAddSlot(false)
    setSlotForm({ role_id: '', capacity: '1', call_time: '', end_time: '', notes: '' })
    toast('Role added', 'success')
  }

  const startEditSlot = (s: CrewRoleSlot) => {
    setEditingSlotId(s.id)
    setShowAddSlot(false)
    setSlotForm({
      role_id: s.role_id,
      capacity: String(s.capacity),
      call_time: s.call_time || '',
      end_time: s.end_time || '',
      notes: s.notes || '',
    })
  }

  const saveSlot = async () => {
    if (!editingSlotId) return
    const cap = parseInt(slotForm.capacity) || 1
    if (cap < 1) { toast('Capacity must be at least 1', 'error'); return }
    const payload = {
      role_id: slotForm.role_id,
      capacity: cap,
      call_time: slotForm.call_time || null,
      end_time: slotForm.end_time || null,
      notes: slotForm.notes.trim() || null,
    }
    const { error } = await supabase.from('crew_role_slots').update(payload).eq('id', editingSlotId)
    if (error) { toast('Failed: ' + error.message, 'error'); return }
    setSlots(prev => prev.map(s => s.id === editingSlotId ? { ...s, ...payload } : s))
    setEditingSlotId(null)
    setSlotForm({ role_id: '', capacity: '1', call_time: '', end_time: '', notes: '' })
    toast('Role updated', 'success')
  }

  const deleteSlot = async (id: string, roleName: string) => {
    const slotSignups = signups.filter(su => su.crew_role_slot_id === id)
    if (slotSignups.length > 0) {
      if (!confirm(`This role has ${slotSignups.length} sign-up${slotSignups.length === 1 ? '' : 's'}. Deleting will cancel them. Continue?`)) return
    } else {
      if (!confirm(`Remove "${roleName}" role?`)) return
    }
    const { error } = await supabase.from('crew_role_slots').delete().eq('id', id)
    if (error) { toast('Failed: ' + error.message, 'error'); return }
    setSlots(prev => prev.filter(s => s.id !== id))
    setSignups(prev => prev.filter(su => su.crew_role_slot_id !== id))
    toast('Role removed', 'success')
  }

  const cancelSignup = async (signupId: string, studentName: string) => {
    if (!confirm(`Remove ${studentName} from this slot? They can still sign up again unless you adjust their tier.`)) return
    const { error } = await supabase.from('crew_signups').delete().eq('id', signupId)
    if (error) { toast('Failed: ' + error.message, 'error'); return }
    setSignups(prev => prev.filter(s => s.id !== signupId))
    toast(`${studentName} removed`, 'success')
  }

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/crew/${productionNumber}` : `/crew/${productionNumber}`

  const copyUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(publicUrl)
      toast('Link copied', 'success')
    }
  }

  if (loading) return <div style={{ padding: '40px 20px', textAlign: 'center' as const, color: muted }}>Loading...</div>

  if (!hasStudentCrew) {
    return (
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '32px 20px', textAlign: 'center' as const }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 6px' }}>🎬 Student crew not yet enabled</p>
        <p style={{ fontSize: '13px', color: muted, margin: '0 0 16px' }}>Turn this on to manage student sign-ups for this production. You&apos;ll get a public URL students can use to claim crew positions.</p>
        {isManager ? (
          <button onClick={enableCrew} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Enable student crew</button>
        ) : (
          <p style={{ fontSize: '13px', color: muted, margin: 0 }}>(Manager-only)</p>
        )}
      </div>
    )
  }

  // Crew enabled — main UI
  const totalCapacity = slots.reduce((sum, s) => sum + s.capacity, 0)
  const totalSignups = signups.length
  const signupsBySlot = slots.map(slot => ({
    slot,
    role: allRoles.find(r => r.id === slot.role_id),
    filled: signups.filter(su => su.crew_role_slot_id === slot.id),
  }))

  return (
    <div>
      {/* Header bar with public URL */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 4px' }}>Public sign-up URL</p>
          <p style={{ fontSize: '13px', color: '#5ba3e0', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' as const }}>{publicUrl}</p>
        </div>
        <button onClick={copyUrl} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(30,108,181,0.1)', color: '#5ba3e0', border: '0.5px solid rgba(30,108,181,0.25)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>📋 Copy</button>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, textDecoration: 'none' }}>↗ Preview</a>
        {isManager && (
          <button onClick={disableCrew} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Disable</button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' as const }}>
        <div style={{ flex: 1, minWidth: '140px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px' }}>
          <p style={{ fontSize: '11px', color: muted, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Roles needed</p>
          <p style={{ fontSize: '20px', fontWeight: 600, color: text, margin: '2px 0 0' }}>{slots.length}</p>
        </div>
        <div style={{ flex: 1, minWidth: '140px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px' }}>
          <p style={{ fontSize: '11px', color: muted, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Total capacity</p>
          <p style={{ fontSize: '20px', fontWeight: 600, color: text, margin: '2px 0 0' }}>{totalCapacity}</p>
        </div>
        <div style={{ flex: 1, minWidth: '140px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px' }}>
          <p style={{ fontSize: '11px', color: muted, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Signed up</p>
          <p style={{ fontSize: '20px', fontWeight: 600, color: totalSignups >= totalCapacity && totalCapacity > 0 ? '#22c55e' : text, margin: '2px 0 0' }}>{totalSignups}{totalCapacity > 0 && <span style={{ fontSize: '13px', color: muted, fontWeight: 400 }}> / {totalCapacity}</span>}</p>
        </div>
      </div>

      {/* Setup card */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: text, margin: 0 }}>Event details (shown to students)</h3>
          {formSaved && <span style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: '6px' }}>✓ Saved</span>}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Display title</label>
          <input value={form.display_title} onChange={e => setForm(f => ({ ...f, display_title: e.target.value }))} placeholder={productionTitle} style={inputStyle} disabled={!isManager} />
          <p style={{ fontSize: '11px', color: muted, margin: '3px 0 0' }}>What students see at the top of the public page. Defaults to the production title.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Crew call time</label>
            <input type="time" value={form.call_time} onChange={e => setForm(f => ({ ...f, call_time: e.target.value }))} style={inputStyle} disabled={!isManager} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Event start</label>
            <input type="time" value={form.event_start_time} onChange={e => setForm(f => ({ ...f, event_start_time: e.target.value }))} style={inputStyle} disabled={!isManager} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Wrap / end</label>
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} disabled={!isManager} />
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Meeting location</label>
          <input value={form.meeting_location} onChange={e => setForm(f => ({ ...f, meeting_location: e.target.value }))} placeholder="e.g. Meet at the front entrance / loading dock by the pool" style={inputStyle} disabled={!isManager} />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>What you&apos;ll be doing</label>
          <textarea value={form.what_youll_do} onChange={e => setForm(f => ({ ...f, what_youll_do: e.target.value }))} placeholder="Brief description of the gig — &quot;You'll be running cameras for the basketball game...&quot;" style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' as const, lineHeight: 1.5 }} disabled={!isManager} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Food</label>
            <select value={form.food} onChange={e => setForm(f => ({ ...f, food: e.target.value }))} style={inputStyle} disabled={!isManager}>
              {FOOD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Transportation</label>
            <select value={form.transportation_note} onChange={e => setForm(f => ({ ...f, transportation_note: e.target.value }))} style={inputStyle} disabled={!isManager}>
              <option value="">Select...</option>
              {TRANSPORT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>What to wear</label>
          <textarea value={form.what_to_wear} onChange={e => setForm(f => ({ ...f, what_to_wear: e.target.value }))} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' as const, lineHeight: 1.5 }} disabled={!isManager} />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Requirements / things to bring</label>
          {form.requirements.length === 0 ? (
            <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', fontStyle: 'italic' as const }}>None added yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', marginBottom: '8px' }}>
              {form.requirements.map((req, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: inputBg, borderRadius: '6px', border: `0.5px solid ${border}` }}>
                  <span style={{ flex: 1, fontSize: '13px', color: text }}>• {req}</span>
                  {isManager && <button onClick={() => removeRequirement(i)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>}
                </div>
              ))}
            </div>
          )}
          {isManager && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <input value={newReq} onChange={e => setNewReq(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRequirement() } }} placeholder="Add a requirement (e.g. Bring a water bottle)" style={{ ...inputStyle, flex: 1, fontSize: '13px' }} />
              <button onClick={addRequirement} disabled={!newReq.trim()} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', background: newReq.trim() ? '#1e6cb5' : (dark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'), color: newReq.trim() ? '#fff' : muted, border: 'none', cursor: newReq.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}>Add</button>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isManager ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={form.hide_names_on_public} onChange={e => setForm(f => ({ ...f, hide_names_on_public: e.target.checked }))} disabled={!isManager} style={{ width: '14px', height: '14px' }} />
            <span style={{ fontSize: '12px', color: text }}>Hide other students&apos; names on the public sign-up page (privacy mode)</span>
          </label>
        </div>

        {isManager && (
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Internal note (manager-only — never shown publicly)</label>
            <textarea value={form.internal_note} onChange={e => setForm(f => ({ ...f, internal_note: e.target.value }))} placeholder="Notes for your reference..." style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' as const, lineHeight: 1.5, background: dark ? 'rgba(245,158,11,0.04)' : 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.2)' }} />
          </div>
        )}

        {isManager && (
          <button onClick={saveForm} disabled={savingForm} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: savingForm ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
            {savingForm ? 'Saving...' : 'Save event details'}
          </button>
        )}
      </div>

      {/* Roles needed card */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: text, margin: 0 }}>Roles needed</h3>
          {isManager && !showAddSlot && !editingSlotId && (
            <button onClick={() => { setShowAddSlot(true); setSlotForm({ role_id: '', capacity: '1', call_time: '', end_time: '', notes: '' }) }} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>+ Add role</button>
          )}
        </div>

        {(showAddSlot || editingSlotId) && (
          <div style={{ background: dark ? 'rgba(91,163,224,0.06)' : 'rgba(91,163,224,0.04)', border: '0.5px solid rgba(91,163,224,0.25)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: text, margin: '0 0 8px' }}>{editingSlotId ? 'Edit role' : 'Add role'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Role</label>
                <select value={slotForm.role_id} onChange={e => setSlotForm(f => ({ ...f, role_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select a role...</option>
                  {allRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>How many?</label>
                <input type="number" min={1} value={slotForm.capacity} onChange={e => setSlotForm(f => ({ ...f, capacity: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Call time (override, optional)</label>
                <input type="time" value={slotForm.call_time} onChange={e => setSlotForm(f => ({ ...f, call_time: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>End time (override, optional)</label>
                <input type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Notes for this role (optional)</label>
              <input value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Switcher ends earlier than the rest of the crew" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={editingSlotId ? saveSlot : addSlot} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{editingSlotId ? 'Save' : 'Add role'}</button>
              <button onClick={() => { setShowAddSlot(false); setEditingSlotId(null) }} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        )}

        {slots.length === 0 ? (
          <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '20px 0', margin: 0 }}>No roles added yet. Click &quot;+ Add role&quot; to start configuring crew positions.</p>
        ) : (
          <div style={{ border: `0.5px solid ${border}`, borderRadius: '8px', overflow: 'hidden' }}>
            {signupsBySlot.map(({ slot, role, filled }, i) => (
              <div key={slot.id} style={{ borderBottom: i < slots.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8f9fc' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: 0 }}>
                      {role?.name || 'Unknown role'} <span style={{ fontSize: '12px', color: muted, fontWeight: 400 }}>× {slot.capacity}</span>
                    </p>
                    <p style={{ fontSize: '11px', color: muted, margin: '2px 0 0' }}>
                      {filled.length} of {slot.capacity} filled
                      {slot.call_time && ` · Call ${slot.call_time}`}
                      {slot.end_time && ` · Wrap ${slot.end_time}`}
                      {slot.notes && ` · ${slot.notes}`}
                    </p>
                  </div>
                  {isManager && (
                    <span>
                      <button onClick={() => startEditSlot(slot)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', background: 'transparent', color: '#5ba3e0', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', marginRight: '4px' }}>Edit</button>
                      <button onClick={() => deleteSlot(slot.id, role?.name || 'this role')} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                    </span>
                  )}
                </div>
                {/* Sign-ups under this slot */}
                {filled.length > 0 && (
                  <div style={{ padding: '8px 14px' }}>
                    {filled.map(su => (
                      <div key={su.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '13px' }}>
                        <span style={{ fontSize: '12px' }} title={(su.signed_up_by || '').toLowerCase() === 'self' ? 'Student signed themselves up' : 'Parent/staff signed up on their behalf'}>
                          {(su.signed_up_by || '').toLowerCase() === 'self' ? '🎓' : '👪'}
                        </span>
                        <span style={{ flex: 1, color: text }}>{su.students?.name || 'Unknown student'}{su.students?.grade && <span style={{ color: muted, fontSize: '12px' }}> · Grade {su.students.grade}</span>}</span>
                        <span style={{ fontSize: '11px', color: muted }}>{new Date(su.signed_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        {isManager && (
                          <button onClick={() => cancelSignup(su.id, su.students?.name || 'this student')} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {filled.length < slot.capacity && (
                  <div style={{ padding: '4px 14px 10px', fontSize: '12px', color: muted, fontStyle: 'italic' as const }}>
                    {slot.capacity - filled.length} open slot{slot.capacity - filled.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: '11px', color: muted, textAlign: 'center' as const, margin: '0 0 8px' }}>
        🎓 = student signed themselves up · 👪 = parent signed up on their behalf
      </p>
    </div>
  )
}
