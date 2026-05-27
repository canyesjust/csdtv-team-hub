'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { getSchoolName } from '@/lib/schools'
import { statusBadge, statusTone } from '@/lib/ui/styles'
import { toast } from '@/lib/toast'
import { sanitizeEmailSubject } from '@/lib/escape-html'
import {
  formatPanelVenue,
  getTypeColor,
  getTypeLabel,
  isOverdueProd,
  primaryContactLabel,
  relativeTime,
  STATUS_DISPLAY,
  STATUS_TONE_MAP,
  templateUsesYoutubeLink,
  type DetailPanelCurrentUser,
  type DetailPanelTeamMember,
  type EmailTemplate,
  normalizePanelActivityRows,
  type PanelActivity,
  type PanelChecklist,
  type ProductionDetail,
} from '@/lib/productions/detail-panel-shared'

interface ProductionDetailDrawerOverlayProps {
  production: ProductionDetail
  setProduction: Dispatch<SetStateAction<ProductionDetail | null>>
  team: DetailPanelTeamMember[]
  currentUser: DetailPanelCurrentUser | null
  emailTemplates: EmailTemplate[]
  onClose: () => void
  opening: boolean
}

export function ProductionDetailDrawerOverlay({
  production: selectedProd,
  setProduction,
  team,
  currentUser,
  emailTemplates,
  onClose,
  opening,
}: ProductionDetailDrawerOverlayProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const selectedProdId = selectedProd.id

  const [panelChecklist, setPanelChecklist] = useState<PanelChecklist[]>([])
  const [panelActivity, setPanelActivity] = useState<PanelActivity[]>([])
  const [panelLoading, setPanelLoading] = useState(true)
  const [panelTeamNotes, setPanelTeamNotes] = useState(selectedProd.team_notes || '')
  const [savingTeamNotes, setSavingTeamNotes] = useState(false)
  const [teamNotesSavedFlash, setTeamNotesSavedFlash] = useState(false)
  const [memberToAdd, setMemberToAdd] = useState('')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [showPanelEmailModal, setShowPanelEmailModal] = useState(false)
  const [panelEmailTemplate, setPanelEmailTemplate] = useState('')
  const [panelEmailBody, setPanelEmailBody] = useState('')
  const [panelEmailSubject, setPanelEmailSubject] = useState('')

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const surface2 = 'var(--surface-2)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'
  const success = statusTone.success.color
  const danger = statusTone.danger.color
  const info = statusTone.info.color
  const warning = statusTone.warning.color
  const warningBg = statusTone.warning.background

  const panelEmailInputStyle = {
    background: surface2,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: text,
    fontFamily: 'inherit' as const,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    minHeight: '40px',
  }

  const patchProduction = useCallback(
    (patch: Partial<ProductionDetail>) => {
      setProduction(prev => (prev ? { ...prev, ...patch } : prev))
    },
    [setProduction],
  )

  const loadPanelData = useCallback(async () => {
    setPanelLoading(true)
    setPanelTeamNotes(selectedProd.team_notes || '')
    setMemberToAdd('')
    setNewChecklistTitle('')
    try {
      const [checkRes, actRes] = await Promise.all([
        supabase
          .from('checklist_items')
          .select('id, title, completed, sort_order')
          .eq('production_id', selectedProdId)
          .order('sort_order'),
        supabase
          .from('production_activity')
          .select('id, action, detail, created_at, team:team(name)')
          .eq('production_id', selectedProdId)
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      if (checkRes.error) {
        toast('Failed to load production details', 'error')
        setPanelChecklist([])
      } else {
        setPanelChecklist(checkRes.data || [])
      }
      setPanelActivity(actRes.error ? [] : normalizePanelActivityRows(actRes.data))
    } catch {
      toast('Failed to load production details', 'error')
      setPanelChecklist([])
      setPanelActivity([])
    } finally {
      setPanelLoading(false)
    }
  }, [selectedProd.team_notes, selectedProdId, supabase])

  useEffect(() => {
    void loadPanelData()
  }, [loadPanelData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isMobile = window.matchMedia('(max-width: 1023px)').matches
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const logPanelActivity = useCallback(
    async (action: string, detail: string | null) => {
      if (!currentUser) return
      const { data } = await supabase
        .from('production_activity')
        .insert({ production_id: selectedProdId, user_id: currentUser.id, action, detail })
        .select('id, action, detail, created_at, team:team(name)')
        .single()
      if (data) {
        const row = normalizePanelActivityRows([data])[0]
        if (row) setPanelActivity(prev => [row, ...prev].slice(0, 5))
      }
    },
    [currentUser, selectedProdId, supabase],
  )

  const getPanelSyncedYoutubeLink = useCallback(
    () => (selectedProd.livestream_url?.trim() || '').trim(),
    [selectedProd.livestream_url],
  )

  const substitutePanelEmailVars = useCallback(
    (str: string): string => {
      const name = selectedProd.organizer_name?.split(' ')[0] || 'there'
      const title = selectedProd.title
      const type = selectedProd.request_type_label || selectedProd.type || 'production'
      const date = selectedProd.start_datetime
        ? new Date(selectedProd.start_datetime).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'TBD'
      const dateShort = selectedProd.start_datetime
        ? new Date(selectedProd.start_datetime).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : 'TBD'
      const venue = selectedProd.event_location || formatPanelVenue(selectedProd)
      const status = selectedProd.status || ''
      const ytLink = getPanelSyncedYoutubeLink()
      return str
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{title\}\}/g, title)
        .replace(/\{\{type\}\}/g, type)
        .replace(/\{\{date_short\}\}/g, dateShort)
        .replace(/\{\{date\}\}/g, date)
        .replace(/\{\{venue\}\}/g, venue)
        .replace(/\{\{youtube_link\}\}/g, ytLink)
        .replace(/\{\{status\}\}/g, status)
    },
    [getPanelSyncedYoutubeLink, selectedProd],
  )

  useEffect(() => {
    if (!panelEmailTemplate) return
    const t = emailTemplates.find(x => x.id === panelEmailTemplate)
    if (!t) return
    setPanelEmailBody(substitutePanelEmailVars(t.body))
    setPanelEmailSubject(sanitizeEmailSubject(substitutePanelEmailVars(t.subject)))
  }, [emailTemplates, panelEmailTemplate, selectedProd.livestream_url, substitutePanelEmailVars])

  const selectPanelEmailTemplate = (templateId: string) => {
    const t = emailTemplates.find(x => x.id === templateId)
    if (!t) return
    if (templateUsesYoutubeLink(t) && !getPanelSyncedYoutubeLink()) {
      toast(
        'This production does not have a video/livestream link from sync yet. Sync from the productions site first, or pick another template.',
        'error',
      )
      return
    }
    setPanelEmailTemplate(templateId)
    setPanelEmailBody(substitutePanelEmailVars(t.body))
    setPanelEmailSubject(sanitizeEmailSubject(substitutePanelEmailVars(t.subject)))
  }

  const openPanelOrganizerEmail = async () => {
    if (!selectedProd.organizer_email || !panelEmailBody) return
    const tpl = emailTemplates.find(t => t.id === panelEmailTemplate)
    if (templateUsesYoutubeLink(tpl) && !getPanelSyncedYoutubeLink()) {
      toast('No synced video/livestream link on this production yet.', 'error')
      return
    }
    const tplLabel = tpl?.label
    await logPanelActivity('Emailed organizer', tplLabel ? `Template: ${tplLabel}` : 'Custom message')
    if (templateUsesYoutubeLink(tpl) && getPanelSyncedYoutubeLink()) {
      try {
        const res = await fetch('/api/productions/youtube-link-email-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ productionId: selectedProdId }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok && body.sentAt) {
          patchProduction({ youtube_link_email_sent_at: body.sentAt })
        } else {
          const fallbackAt = new Date().toISOString()
          const { error } = await supabase
            .from('productions')
            .update({ youtube_link_email_sent_at: fallbackAt })
            .eq('id', selectedProdId)
          if (!error) patchProduction({ youtube_link_email_sent_at: fallbackAt })
        }
      } catch {
        toast('Could not record link-email timestamp.', 'error')
      }
    }
    const mailto = `mailto:${selectedProd.organizer_email}?subject=${encodeURIComponent(sanitizeEmailSubject(panelEmailSubject))}&body=${encodeURIComponent(panelEmailBody)}`
    window.location.href = mailto
    setTimeout(() => {
      setShowPanelEmailModal(false)
      setPanelEmailTemplate('')
      setPanelEmailBody('')
      setPanelEmailSubject('')
    }, 500)
  }

  const syncChecklistToProduction = (nextChecklist: PanelChecklist[]) => {
    const synthetic = nextChecklist.map(c => ({ completed: c.completed }))
    patchProduction({ checklist_items: synthetic })
  }

  const togglePanelChecklistItem = async (item: PanelChecklist) => {
    const updated = !item.completed
    const { error } = await supabase
      .from('checklist_items')
      .update({ completed: updated, completed_at: updated ? new Date().toISOString() : null })
      .eq('id', item.id)
    if (error) {
      toast('Failed to update checklist', 'error')
      return
    }
    const nextChecklist = panelChecklist.map(c => (c.id === item.id ? { ...c, completed: updated } : c))
    setPanelChecklist(nextChecklist)
    syncChecklistToProduction(nextChecklist)
  }

  const addPanelChecklistItem = async () => {
    const title = newChecklistTitle.trim()
    if (!title) return
    const { data, error } = await supabase
      .from('checklist_items')
      .insert({ production_id: selectedProdId, title, completed: false, sort_order: panelChecklist.length })
      .select('id, title, completed, sort_order')
      .single()
    if (error || !data) {
      toast('Failed to add checklist item', 'error')
      return
    }
    const nextChecklist = [...panelChecklist, data]
    setPanelChecklist(nextChecklist)
    setNewChecklistTitle('')
    syncChecklistToProduction(nextChecklist)
  }

  const removePanelChecklistItem = async (itemId: string) => {
    const { error } = await supabase.from('checklist_items').delete().eq('id', itemId)
    if (error) {
      toast('Failed to remove checklist item', 'error')
      return
    }
    const nextChecklist = panelChecklist.filter(c => c.id !== itemId)
    setPanelChecklist(nextChecklist)
    syncChecklistToProduction(nextChecklist)
  }

  const savePanelTeamNotes = async () => {
    if (selectedProd.team_notes === panelTeamNotes) return
    setSavingTeamNotes(true)
    const { error } = await supabase
      .from('productions')
      .update({ team_notes: panelTeamNotes || null })
      .eq('id', selectedProdId)
    setSavingTeamNotes(false)
    if (error) {
      toast('Failed to save notes', 'error')
      return
    }
    patchProduction({ team_notes: panelTeamNotes || null })
    setTeamNotesSavedFlash(true)
    setTimeout(() => setTeamNotesSavedFlash(false), 2000)
  }

  const addPanelMember = async () => {
    if (!memberToAdd) return
    if ((selectedProd.production_members || []).some(m => m.user_id === memberToAdd)) {
      setMemberToAdd('')
      return
    }
    const member = team.find(m => m.id === memberToAdd)
    const { error } = await supabase
      .from('production_members')
      .insert({ production_id: selectedProdId, user_id: memberToAdd })
    if (error) {
      toast('Failed to add team member', 'error')
      return
    }
    patchProduction({
      production_members: [
        ...(selectedProd.production_members || []),
        {
          user_id: memberToAdd,
          team: member ? { name: member.name, avatar_color: member.avatar_color } : null,
        },
      ],
    })
    setMemberToAdd('')
    await logPanelActivity('Added team member', member?.name || null)
  }

  const removePanelMember = async (memberId: string, memberName: string | null) => {
    const { error } = await supabase
      .from('production_members')
      .delete()
      .eq('production_id', selectedProdId)
      .eq('user_id', memberId)
    if (error) {
      toast('Failed to remove team member', 'error')
      return
    }
    patchProduction({
      production_members: (selectedProd.production_members || []).filter(m => m.user_id !== memberId),
    })
    await logPanelActivity('Removed team member', memberName)
  }

  const renderStatusPill = (status: string | null) => {
    if (!status) {
      return (
        <span style={{ ...statusBadge('review', true), fontSize: '12px' }}>Unknown</span>
      )
    }
    const tone = STATUS_TONE_MAP[status]
    const label = STATUS_DISPLAY[status] || status
    if (!tone) {
      return (
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '6px',
            background: surface2,
            color: muted,
          }}
        >
          {label}
        </span>
      )
    }
    return <span style={{ ...statusBadge(tone, true), fontSize: '12px' }}>{label}</span>
  }

  const renderTypePill = () => {
    const label = getTypeLabel(selectedProd)
    const color = getTypeColor(selectedProd)
    return (
      <span
        style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '5px',
          background: `${color}1A`,
          color,
          fontWeight: 500,
          border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    )
  }

  return (
    <>
      <div className="hub-drawer-root" role="presentation">
        <div className="hub-drawer-backdrop" onClick={onClose} aria-hidden />
        <aside
          className="hub-drawer-panel"
          style={{
            background: cardBg,
            border: `1px solid ${border}`,
            overflowY: 'auto' as const,
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Production ${selectedProd.production_number}`}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 18px 10px',
              borderBottom: `1px solid ${border}`,
              position: 'sticky' as const,
              top: 0,
              background: cardBg,
              zIndex: 1,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '11px', color: muted, margin: '0 0 2px', fontWeight: 600 }}>
                #{selectedProd.production_number}
              </p>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0, lineHeight: 1.25 }}>
                {selectedProd.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail"
              style={{
                background: 'none',
                border: 'none',
                color: muted,
                cursor: 'pointer',
                fontSize: '22px',
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </header>

          {panelLoading || opening ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 0', color: muted }}>Loading…</div>
          ) : (
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' as const }}>
                {renderStatusPill(selectedProd.status)}
                {renderTypePill()}
                {isOverdueProd(selectedProd) && (
                  <span style={{ ...statusBadge('danger', true), fontSize: '12px', padding: '3px 10px' }}>
                    Overdue
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' as const }}>
                <Link
                  href={`/dashboard/productions/${selectedProd.production_number}`}
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--brand-primary)',
                    textDecoration: 'none',
                    padding: '8px 10px',
                    background: surface2,
                    border: `1px solid ${border}`,
                    borderRadius: '8px',
                    textAlign: 'center' as const,
                  }}
                >
                  Open full details →
                </Link>
                {selectedProd.organizer_email && (
                  <button
                    type="button"
                    onClick={() => setShowPanelEmailModal(true)}
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: statusTone.info.background,
                      color: info,
                      border: `1px solid ${border}`,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ✉ Email organizer
                  </button>
                )}
              </div>

              <div
                style={{
                  background: surface2,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                  border: `1px solid ${border}`,
                }}
              >
                {selectedProd.start_datetime && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ color: muted }}>Date</span>
                    <span style={{ color: text, fontWeight: 500 }}>
                      {new Date(selectedProd.start_datetime).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      ·{' '}
                      {new Date(selectedProd.start_datetime).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {(selectedProd.filming_location || selectedProd.school_department) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ color: muted }}>Location</span>
                    <span style={{ color: text, fontWeight: 500, textAlign: 'right' as const }}>
                      {getSchoolName(selectedProd.filming_location) ||
                        getSchoolName(selectedProd.school_department) ||
                        selectedProd.filming_location ||
                        ''}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', gap: '12px' }}>
                  <span style={{ color: muted }}>Organizer</span>
                  <span style={{ textAlign: 'right' as const, minWidth: 0 }}>
                    <span style={{ display: 'block', color: text, fontWeight: 500 }}>
                      {primaryContactLabel(selectedProd)}
                    </span>
                    {selectedProd.organizer_email && (
                      <a
                        href={`mailto:${selectedProd.organizer_email}`}
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: 'var(--brand-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        {selectedProd.organizer_email}
                      </a>
                    )}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <p
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: muted,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.6px',
                      margin: 0,
                    }}
                  >
                    Team
                  </p>
                  <span style={{ fontSize: '11px', color: muted, fontWeight: 600 }}>
                    {(selectedProd.production_members || []).length}
                  </span>
                </div>
                {(selectedProd.production_members || []).length === 0 ? (
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px', fontStyle: 'italic' as const }}>
                    No team assigned yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
                    {(selectedProd.production_members || []).map(
                      m =>
                        m.team && (
                          <span
                            key={m.user_id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              padding: '3px 4px',
                              borderRadius: '20px',
                              background: surface2,
                              color: text,
                              fontWeight: 500,
                              border: `1px solid ${border}`,
                            }}
                          >
                            <span
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: m.team.avatar_color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '8px',
                                fontWeight: 700,
                                color: '#0a0f1e',
                              }}
                            >
                              {m.team.name.slice(0, 2).toUpperCase()}
                            </span>
                            {m.team.name}
                            <button
                              type="button"
                              onClick={() => removePanelMember(m.user_id, m.team?.name || null)}
                              aria-label={`Remove ${m.team.name}`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: muted,
                                cursor: 'pointer',
                                fontSize: '14px',
                                lineHeight: 1,
                                padding: '0 4px 0 0',
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ),
                    )}
                  </div>
                )}
                {team.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      value={memberToAdd}
                      onChange={e => setMemberToAdd(e.target.value)}
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        padding: '7px 10px',
                        background: surface2,
                        border: `1px solid ${border}`,
                        borderRadius: '8px',
                        color: text,
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value="">+ Add team member…</option>
                      {team
                        .filter(m => !(selectedProd.production_members || []).some(pm => pm.user_id === m.id))
                        .map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={addPanelMember}
                      disabled={!memberToAdd}
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '7px 14px',
                        background: memberToAdd ? 'var(--brand-primary)' : surface2,
                        color: memberToAdd ? '#fff' : muted,
                        border: `1px solid ${memberToAdd ? 'var(--brand-primary)' : border}`,
                        borderRadius: '8px',
                        cursor: memberToAdd ? 'pointer' : 'not-allowed',
                        fontFamily: 'inherit',
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <p
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: muted,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.6px',
                      margin: 0,
                    }}
                  >
                    Team notes
                  </p>
                  {savingTeamNotes ? (
                    <span style={{ fontSize: '11px', color: muted, fontStyle: 'italic' as const }}>Saving…</span>
                  ) : teamNotesSavedFlash ? (
                    <span style={{ fontSize: '11px', color: success, fontWeight: 600 }}>Saved</span>
                  ) : null}
                </div>
                <textarea
                  value={panelTeamNotes}
                  onChange={e => setPanelTeamNotes(e.target.value)}
                  onBlur={savePanelTeamNotes}
                  placeholder="Internal notes for the crew (saves on blur)…"
                  rows={3}
                  style={{
                    width: '100%',
                    fontSize: '13px',
                    padding: '8px 10px',
                    background: surface2,
                    border: `1px solid ${border}`,
                    borderRadius: '8px',
                    color: text,
                    fontFamily: 'inherit',
                    resize: 'vertical' as const,
                    lineHeight: 1.4,
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <p
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: muted,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.6px',
                      margin: 0,
                    }}
                  >
                    Checklist
                  </p>
                  {panelChecklist.length > 0 && (
                    <span style={{ fontSize: '11px', color: muted, fontWeight: 600 }}>
                      {panelChecklist.filter(c => c.completed).length}/{panelChecklist.length}
                    </span>
                  )}
                </div>
                {panelChecklist.length === 0 ? (
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px', fontStyle: 'italic' as const }}>
                    No checklist items yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2px', marginBottom: '8px' }}>
                    {panelChecklist.map(item => (
                      <div
                        key={item.id}
                        className="hub-cl-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => togglePanelChecklistItem(item)}
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
                        >
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '4px',
                              border: `1.5px solid ${item.completed ? success : border}`,
                              background: item.completed ? success : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {item.completed && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                        </button>
                        <span
                          onClick={() => togglePanelChecklistItem(item)}
                          style={{
                            flex: 1,
                            fontSize: '13px',
                            color: item.completed ? muted : text,
                            textDecoration: item.completed ? 'line-through' : 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {item.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePanelChecklistItem(item.id)}
                          style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', fontSize: '14px' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    value={newChecklistTitle}
                    onChange={e => setNewChecklistTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addPanelChecklistItem()
                      }
                    }}
                    placeholder="Add checklist item…"
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      padding: '7px 10px',
                      background: surface2,
                      border: `1px solid ${border}`,
                      borderRadius: '8px',
                      color: text,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={addPanelChecklistItem}
                    disabled={!newChecklistTitle.trim()}
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '7px 14px',
                      background: newChecklistTitle.trim() ? 'var(--brand-primary)' : surface2,
                      color: newChecklistTitle.trim() ? '#fff' : muted,
                      border: `1px solid ${newChecklistTitle.trim() ? 'var(--brand-primary)' : border}`,
                      borderRadius: '8px',
                      cursor: newChecklistTitle.trim() ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: muted,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.6px',
                    margin: '0 0 6px',
                  }}
                >
                  Recent activity
                </p>
                {panelActivity.length === 0 ? (
                  <p style={{ fontSize: '12px', color: muted, margin: 0, fontStyle: 'italic' as const }}>
                    No recent activity yet.
                  </p>
                ) : (
                  panelActivity.map(a => (
                    <div
                      key={a.id}
                      style={{
                        fontSize: '12px',
                        color: muted,
                        padding: '4px 0',
                        borderBottom: `1px solid ${border}`,
                      }}
                    >
                      <span style={{ color: text, fontWeight: 500 }}>{a.team?.name || 'System'}</span> {a.action.replace(/_/g, ' ')}
                      {a.detail && <span> — {a.detail}</span>}
                      <span style={{ display: 'block', fontSize: '11px', marginTop: '2px' }}>
                        {relativeTime(a.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {showPanelEmailModal && selectedProd.organizer_email && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setShowPanelEmailModal(false)
          }}
        >
          <div
            style={{
              background: cardBg,
              border: `0.5px solid ${border}`,
              borderRadius: '16px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto' as const,
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>Email organizer</h2>
              <button type="button" onClick={() => setShowPanelEmailModal(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px' }}>
                ×
              </button>
            </div>
            {emailTemplates.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {emailTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectPanelEmailTemplate(t.id)}
                    style={{
                      fontSize: '12px',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: `0.5px solid ${panelEmailTemplate === t.id ? info : border}`,
                      background: panelEmailTemplate === t.id ? statusTone.info.background : cardBg,
                      color: panelEmailTemplate === t.id ? info : muted,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Subject</label>
              <input value={panelEmailSubject} onChange={e => setPanelEmailSubject(e.target.value)} style={panelEmailInputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Message</label>
              <textarea
                value={panelEmailBody}
                onChange={e => setPanelEmailBody(e.target.value)}
                style={{ ...panelEmailInputStyle, minHeight: '200px', resize: 'vertical' as const }}
              />
            </div>
            <button
              type="button"
              onClick={openPanelOrganizerEmail}
              disabled={!panelEmailBody}
              style={{
                fontSize: '14px',
                padding: '10px 20px',
                borderRadius: '8px',
                background: panelEmailBody ? 'var(--brand-primary)' : surface2,
                color: panelEmailBody ? '#fff' : muted,
                border: 'none',
                cursor: panelEmailBody ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              ✉ Open in Outlook
            </button>
          </div>
        </div>
      )}

      <style>{`
        .hub-drawer-root {
          position: fixed;
          inset: 0;
          z-index: 85;
          display: flex;
          justify-content: flex-end;
          pointer-events: none;
        }
        .hub-drawer-backdrop {
          pointer-events: auto;
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
        }
        .hub-drawer-panel {
          pointer-events: auto;
          position: relative;
          width: min(420px, 100vw);
          max-height: 100vh;
          border-radius: 16px 0 0 16px;
          box-shadow: var(--shadow-raised);
          margin-top: 0;
        }
        .hub-cl-row:hover {
          background: ${hoverBg};
        }
        @media (max-width: 1023px) {
          .hub-drawer-root {
            align-items: flex-end;
          }
          .hub-drawer-panel {
            width: 100% !important;
            max-height: 90vh !important;
            border-radius: 16px 16px 0 0 !important;
          }
        }
      `}</style>
    </>
  )
}
