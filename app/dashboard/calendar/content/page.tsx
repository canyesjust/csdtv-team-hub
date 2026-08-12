'use client'

import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { formatDate, toDateInputValue } from '@/lib/format-date'
import AsyncButton from '../../components/AsyncButton'

type TeamMember = {
  id: string
  name: string
}

type CampaignNeed = {
  id: string
  label: string
  done: boolean
}

type Campaign = {
  id: string
  name: string
  start_date: string
  end_date: string
  responsible_team_id: string | null
  notes: string | null
  needs: CampaignNeed[]
}

type CampaignForm = {
  id: string | null
  name: string
  start_date: string
  end_date: string
  responsible_team_id: string
  notes: string
}

const EMPTY_FORM: CampaignForm = {
  id: null,
  name: '',
  start_date: toDateInputValue(new Date()),
  end_date: toDateInputValue(new Date()),
  responsible_team_id: '',
  notes: '',
}

function normalizeNeeds(raw: unknown): CampaignNeed[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n): n is CampaignNeed => !!n && typeof n === 'object' && typeof (n as CampaignNeed).label === 'string')
    .map(n => ({ id: n.id || crypto.randomUUID(), label: n.label, done: !!n.done }))
}

export default function ContentCalendarPage() {
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [newNeedDraft, setNewNeedDraft] = useState<Record<string, string>>({})

  const inputStyle = {
    width: '100%', height: '40px', borderRadius: '10px',
    border: `0.5px solid ${border}`, background: inputBg, color: text,
    padding: '0 12px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: campaignRows }, { data: teamRows }] = await Promise.all([
      supabase.from('calendar_campaigns')
        .select('id, name, start_date, end_date, responsible_team_id, notes, needs')
        .order('start_date', { ascending: true }),
      supabase.from('team').select('id, name').order('name'),
    ])
    setCampaigns((campaignRows || []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      start_date: c.start_date as string,
      end_date: c.end_date as string,
      responsible_team_id: (c.responsible_team_id as string) || null,
      notes: (c.notes as string) || null,
      needs: normalizeNeeds(c.needs),
    })))
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

  function openEditForm(c: Campaign) {
    setForm({
      id: c.id,
      name: c.name,
      start_date: c.start_date,
      end_date: c.end_date,
      responsible_team_id: c.responsible_team_id || '',
      notes: c.notes || '',
    })
    setShowForm(true)
  }

  async function saveCampaign() {
    if (!form.name.trim()) {
      toast('Campaign name is required', 'error')
      return
    }
    if (form.end_date < form.start_date) {
      toast('End date is before the start date', 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      responsible_team_id: form.responsible_team_id || null,
      notes: form.notes.trim() || null,
    }
    const { error } = form.id
      ? await supabase.from('calendar_campaigns').update(payload).eq('id', form.id)
      : await supabase.from('calendar_campaigns').insert({ ...payload, needs: [] })
    setSaving(false)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast(form.id ? 'Campaign updated' : 'Campaign created', 'success')
    setShowForm(false)
    await loadData()
  }

  async function deleteCampaign(c: Campaign) {
    if (!(await confirmDialog({ message: `Delete "${c.name}"? This can't be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return
    const { error } = await supabase.from('calendar_campaigns').delete().eq('id', c.id)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('Campaign deleted', 'success')
    setCampaigns(prev => prev.filter(x => x.id !== c.id))
  }

  async function saveNeeds(campaignId: string, needs: CampaignNeed[]) {
    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, needs } : c))
    const { error } = await supabase.from('calendar_campaigns').update({ needs }).eq('id', campaignId)
    if (error) toast(error.message, 'error')
  }

  function toggleNeed(campaign: Campaign, needId: string) {
    const needs = campaign.needs.map(n => n.id === needId ? { ...n, done: !n.done } : n)
    saveNeeds(campaign.id, needs)
  }

  function removeNeed(campaign: Campaign, needId: string) {
    const needs = campaign.needs.filter(n => n.id !== needId)
    saveNeeds(campaign.id, needs)
  }

  function addNeed(campaign: Campaign) {
    const label = (newNeedDraft[campaign.id] || '').trim()
    if (!label) return
    const needs = [...campaign.needs, { id: crypto.randomUUID(), label, done: false }]
    saveNeeds(campaign.id, needs)
    setNewNeedDraft(prev => ({ ...prev, [campaign.id]: '' }))
  }

  const todayStr = toDateInputValue(new Date())
  const upcoming = campaigns.filter(c => c.end_date >= todayStr)
  const past = campaigns.filter(c => c.end_date < todayStr).sort((a, b) => b.start_date.localeCompare(a.start_date))

  function CampaignCard({ c }: { c: Campaign }) {
    const doneCount = c.needs.filter(n => n.done).length
    return (
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 4px' }}>{c.name}</p>
            <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
              {formatDate(c.start_date)} – {formatDate(c.end_date)} · {teamName(c.responsible_team_id)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={() => openEditForm(c)} style={{
              fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent',
              color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px',
            }}>Edit</button>
            <button onClick={() => deleteCampaign(c)} style={{
              fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent',
              color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.3)', cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px',
            }}>Delete</button>
          </div>
        </div>

        {c.notes && (
          <p style={{ fontSize: '13.5px', color: muted, margin: '10px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>{c.notes}</p>
        )}

        <div style={{ marginTop: '14px', borderTop: `0.5px solid ${border}`, paddingTop: '12px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0 0 8px' }}>
            Needs {c.needs.length > 0 && `· ${doneCount}/${c.needs.length}`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {c.needs.map(n => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={n.done}
                  onChange={() => toggleNeed(c, n.id)}
                  style={{ width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13.5px', color: n.done ? muted : text, textDecoration: n.done ? 'line-through' : 'none', flex: 1 }}>{n.label}</span>
                <button onClick={() => removeNeed(c, n.id)} style={{
                  background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '13px', padding: '2px 6px', fontFamily: 'inherit',
                }} aria-label={`Remove ${n.label}`}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              value={newNeedDraft[c.id] || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewNeedDraft(prev => ({ ...prev, [c.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') addNeed(c) }}
              placeholder="Add a need..."
              style={{
                flex: 1, height: '32px', borderRadius: '8px', border: `0.5px solid ${border}`,
                background: inputBg, color: text, padding: '0 10px', fontSize: '13px', fontFamily: 'inherit',
              }}
            />
            <button onClick={() => addNeed(c)} style={{
              fontSize: '13px', padding: '0 12px', borderRadius: '8px', background: border, color: muted,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px',
            }}>Add</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Content calendar</h1>
          <p style={{ fontSize: '15px', color: muted, margin: 0, lineHeight: 1.5, maxWidth: '640px' }}>
            Marketing and content campaigns with a simple checklist. Not linked to the Tasks system.
          </p>
        </div>
        <button onClick={openNewForm} style={{
          fontSize: '14px', padding: '0 20px', borderRadius: '10px', background: accent, color: '#fff',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px', flexShrink: 0,
        }}>+ New campaign</button>
      </div>

      {showForm && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '18px', marginBottom: '20px' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 14px' }}>{form.id ? 'Edit campaign' : 'New campaign'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>Name</label>
              <input value={form.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>Start date</label>
              <input type="date" value={form.start_date} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12.5px', color: muted, display: 'block', marginBottom: '4px' }}>End date</label>
              <input type="date" value={form.end_date} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
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
              style={{ ...inputStyle, height: '80px', padding: '10px 12px', resize: 'vertical' as const, lineHeight: 1.5 }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <AsyncButton onClick={saveCampaign} disabled={saving} pendingLabel="Saving…" style={{
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
      ) : campaigns.length === 0 ? (
        <p style={{ color: muted, fontSize: '14px', padding: '20px' }}>No campaigns yet. Click "+ New campaign" to add one.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Upcoming</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {upcoming.map(c => <CampaignCard key={c.id} c={c} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Past</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {past.map(c => <CampaignCard key={c.id} c={c} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
