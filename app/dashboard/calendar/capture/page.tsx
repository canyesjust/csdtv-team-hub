'use client'

import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { formatWeekday, toDateInputValue } from '@/lib/format-date'
import AsyncButton from '../../components/AsyncButton'

type TeamMember = {
  id: string
  name: string
}

type CapturePlan = {
  id: string
  title: string
  plan_date: string
  notes: string | null
  responsible_team_id: string | null
}

type PlanForm = {
  id: string | null
  title: string
  plan_date: string
  responsible_team_id: string
  notes: string
}

const EMPTY_FORM: PlanForm = {
  id: null,
  title: '',
  plan_date: toDateInputValue(new Date()),
  responsible_team_id: '',
  notes: '',
}

export default function CaptureCalendarPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'
  const accent = '#1e6cb5'

  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<CapturePlan[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const inputStyle = {
    width: '100%', height: '40px', borderRadius: '10px',
    border: `0.5px solid ${border}`, background: inputBg, color: text,
    padding: '0 12px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: planRows }, { data: teamRows }] = await Promise.all([
      supabase.from('calendar_capture_plans')
        .select('id, title, plan_date, notes, responsible_team_id')
        .order('plan_date', { ascending: true }),
      supabase.from('team').select('id, name').order('name'),
    ])
    setPlans(planRows || [])
    setTeam(teamRows || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  function teamName(id: string | null): string {
    if (!id) return 'Unassigned'
    return team.find(t => t.id === id)?.name || 'Unassigned'
  }

  function openNewForm() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEditForm(p: CapturePlan) {
    setForm({
      id: p.id,
      title: p.title,
      plan_date: p.plan_date,
      responsible_team_id: p.responsible_team_id || '',
      notes: p.notes || '',
    })
    setShowForm(true)
  }

  async function savePlan() {
    if (!form.title.trim()) {
      toast('Title is required', 'error')
      return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      plan_date: form.plan_date,
      responsible_team_id: form.responsible_team_id || null,
      notes: form.notes.trim() || null,
    }
    const { error } = form.id
      ? await supabase.from('calendar_capture_plans').update(payload).eq('id', form.id)
      : await supabase.from('calendar_capture_plans').insert(payload)
    setSaving(false)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast(form.id ? 'Plan updated' : 'Plan created', 'success')
    setShowForm(false)
    await loadData()
  }

  async function deletePlan(p: CapturePlan) {
    if (!(await confirmDialog({ message: `Delete "${p.title}"? This can't be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return
    const { error } = await supabase.from('calendar_capture_plans').delete().eq('id', p.id)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('Plan deleted', 'success')
    setPlans(prev => prev.filter(x => x.id !== p.id))
  }

  const todayStr = toDateInputValue(new Date())
  const upcoming = plans.filter(p => p.plan_date >= todayStr)
  const past = plans.filter(p => p.plan_date < todayStr).sort((a, b) => b.plan_date.localeCompare(a.plan_date))

  function PlanCard({ p }: { p: CapturePlan }) {
    return (
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
        <div style={{ minWidth: '90px', flexShrink: 0 }}>
          <p style={{ fontSize: '13.5px', fontWeight: 600, color: accent, margin: 0 }}>{formatWeekday(p.plan_date)}</p>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ fontSize: '15.5px', fontWeight: 600, color: text, margin: '0 0 4px' }}>{p.title}</p>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 6px' }}>{teamName(p.responsible_team_id)}</p>
          {p.notes && <p style={{ fontSize: '13.5px', color: muted, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>{p.notes}</p>}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => openEditForm(p)} style={{
            fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent',
            color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px',
          }}>Edit</button>
          <button onClick={() => deletePlan(p)} style={{
            fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent',
            color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.3)', cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px',
          }}>Delete</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Capture planning</h1>
          <p style={{ fontSize: '15px', color: muted, margin: 0, lineHeight: 1.5, maxWidth: '640px' }}>
            Freeform notes for what to capture and when. Not tied to Productions or Tasks.
          </p>
        </div>
        <button onClick={openNewForm} style={{
          fontSize: '14px', padding: '0 20px', borderRadius: '10px', background: accent, color: '#fff',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px', flexShrink: 0,
        }}>+ New plan</button>
      </div>

      {showForm && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '18px', marginBottom: '20px' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 14px' }}>{form.id ? 'Edit plan' : 'New plan'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>Title</label>
              <input value={form.title} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>Date</label>
              <input type="date" value={form.plan_date} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, plan_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>Responsible</label>
              <select value={form.responsible_team_id} onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(f => ({ ...f, responsible_team_id: e.target.value }))} style={inputStyle}>
                <option value="">Unassigned</option>
                {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Shot list, locations, anything freeform..."
              style={{ ...inputStyle, height: '100px', padding: '10px 12px', resize: 'vertical' as const, lineHeight: 1.5 }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <AsyncButton onClick={savePlan} disabled={saving} pendingLabel="Saving…" style={{
              fontSize: '14px', padding: '0 20px', borderRadius: '10px', background: accent, color: '#fff',
              border: 'none', fontWeight: 500, minHeight: '44px',
            }}>Save</AsyncButton>
            <button onClick={() => setShowForm(false)} style={{
              fontSize: '14px', padding: '0 20px', borderRadius: '10px', background: 'transparent', color: muted,
              border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: muted, fontSize: '15px' }}>Loading…</p>
      ) : plans.length === 0 ? (
        <p style={{ color: muted, fontSize: '14px', padding: '20px' }}>No capture plans yet. Click "+ New plan" to add one.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Upcoming</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {upcoming.map(p => <PlanCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Past</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {past.map(p => <PlanCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
