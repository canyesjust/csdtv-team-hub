'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants'

interface TeamMember { id: string; name: string; email: string; role: string; avatar_color: string; supabase_user_id: string | null }
interface SchoolListRow {
  id: string
  code: string
  name: string
  type: string
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
  text_color?: string | null
  mascot?: string | null
}
interface NotificationPrefs {
  notify_assigned_email: boolean; notify_assigned_inapp: boolean
  notify_completed_email: boolean; notify_completed_inapp: boolean
  notify_new_production_email: boolean; notify_new_production_inapp: boolean
}
interface EmailTemplate {
  id: string
  template_key: string
  label: string
  subject: string
  body: string
  sort_order: number
  active: boolean
}
interface SignupTier {
  id: string
  name: string
  cooldown_hours: number
  monthly_event_cap: number | null
  description: string | null
}

const NOTIF_SETTINGS: { label: string; desc: string; emailKey: keyof NotificationPrefs; inappKey: keyof NotificationPrefs }[] = [
  { label: 'Task assigned to me', desc: 'When someone assigns you a task', emailKey: 'notify_assigned_email', inappKey: 'notify_assigned_inapp' },
  { label: 'Task completed', desc: 'When a task you created is completed', emailKey: 'notify_completed_email', inappKey: 'notify_completed_inapp' },
  { label: 'New production synced', desc: 'When productions sync from the site', emailKey: 'notify_new_production_email', inappKey: 'notify_new_production_inapp' },
]

const AVATAR_COLORS = ['#e8a020', '#5ba3e0', '#22c55e', '#9b85e0', '#ef4444', '#f97316', '#06b6d4', '#ec4899']

const TEMPLATE_VARIABLES: { key: string; desc: string }[] = [
  { key: '{{name}}', desc: "organizer's first name" },
  { key: '{{title}}', desc: 'production title' },
  { key: '{{type}}', desc: 'production type' },
  { key: '{{date}}', desc: 'full date and time' },
  { key: '{{date_short}}', desc: 'short date (no time)' },
  { key: '{{venue}}', desc: 'filming location' },
  { key: '{{youtube_link}}', desc: 'Synced livestream/video URL on the production (district sync)' },
  { key: '{{status}}', desc: 'current production status' },
]

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    notify_assigned_email: true, notify_assigned_inapp: true,
    notify_completed_email: true, notify_completed_inapp: true,
    notify_new_production_email: false, notify_new_production_inapp: true,
  })
  const [loading, setLoading] = useState(true)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', email: '' })
  const [selectedColor, setSelectedColor] = useState('#e8a020')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('Staff')
  const [inviteColor, setInviteColor] = useState('#5ba3e0')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [editingTeamMember, setEditingTeamMember] = useState<string | null>(null)
  const [schools, setSchools] = useState<SchoolListRow[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [newSchoolCode, setNewSchoolCode] = useState('')
  const [newSchoolName, setNewSchoolName] = useState('')
  const [newSchoolType, setNewSchoolType] = useState('school')
  const [editingSchool, setEditingSchool] = useState<string | null>(null)
  const [editSchoolName, setEditSchoolName] = useState('')
  const [schoolBrandingId, setSchoolBrandingId] = useState<string | null>(null)
  const [brandForm, setBrandForm] = useState({ primary: '', secondary: '', accent: '', text: '', mascot: '' })
  const [brandSaving, setBrandSaving] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminEmailSaved, setAdminEmailSaved] = useState(false)
  const [changePw, setChangePw] = useState('')
  const [changePw2, setChangePw2] = useState('')
  const [changePwSaving, setChangePwSaving] = useState(false)
  const [changePwMsg, setChangePwMsg] = useState('')
  // Email templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editingTplId, setEditingTplId] = useState<string | null>(null)
  const [showNewTpl, setShowNewTpl] = useState(false)
  const [tplForm, setTplForm] = useState({ label: '', subject: '', body: '' })
  const [savingTpl, setSavingTpl] = useState(false)
  // Sign-up tiers
  const [tiers, setTiers] = useState<SignupTier[]>([])
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [tierForm, setTierForm] = useState({ cooldown_hours: '0', monthly_event_cap: '', description: '' })
  const [savingTier, setSavingTier] = useState(false)
  const [digestPreview, setDigestPreview] = useState<{
    subject: string
    body: string
    html: string
    longDateLabel: string
    timezone: string
    todayKey: string
  } | null>(null)
  const [digestPreviewMode, setDigestPreviewMode] = useState<'html' | 'text'>('html')
  const [digestPreviewLoading, setDigestPreviewLoading] = useState(false)
  const [digestPreviewError, setDigestPreviewError] = useState<string | null>(null)
  const [digestSendLoading, setDigestSendLoading] = useState(false)
  const [taskSignageHref, setTaskSignageHref] = useState<string>('/signage/tasks')
  const [taskSignageAbsolute, setTaskSignageAbsolute] = useState<string>('')
  const [signageTasksKeyConfigured, setSignageTasksKeyConfigured] = useState<boolean | null>(null)
  const [signageOutlookEnabled, setSignageOutlookEnabled] = useState(false)
  const [signageOutlookConfigured, setSignageOutlookConfigured] = useState(false)
  const [signageOutlookBusy, setSignageOutlookBusy] = useState(false)

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [userRes, teamRes, schoolsRes, settingsRes, tplRes, tiersRes] = await Promise.all([
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
      supabase.from('team').select('*').eq('active', true).order('name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('app_settings').select('*'),
      supabase.from('email_templates').select('*').order('sort_order'),
      supabase.from('signup_tiers').select('*').order('name'),
    ])
    setCurrentUser(userRes.data)
    setTeam(teamRes.data || [])
    setSchools((schoolsRes.data as SchoolListRow[]) || [])
    setTemplates(tplRes.data || [])
    setTiers(tiersRes.data || [])
    const settings = settingsRes.data || []
    const adminSetting = settings.find((s: { key: string; value: string }) => s.key === 'admin_assistant_email')
    if (adminSetting) setAdminEmail(adminSetting.value || '')
    if (userRes.data) {
      setProfileForm({ name: userRes.data.name, email: userRes.data.email })
      setSelectedColor(userRes.data.avatar_color || '#e8a020')
      const { data: prefs } = await supabase.from('notification_preferences').select('*').eq('user_id', userRes.data.id).single()
      if (prefs) setNotifPrefs(prefs)
    }

    try {
      const sigRes = await fetch('/api/dashboard/signage-links', { cache: 'no-store' })
      const sigBody = await sigRes.json().catch(() => ({}))
      if (sigRes.ok && typeof sigBody.taskSignagePath === 'string') {
        setTaskSignageHref(sigBody.taskSignagePath)
        setTaskSignageAbsolute(typeof sigBody.absoluteTaskSignageUrl === 'string' ? sigBody.absoluteTaskSignageUrl : '')
        setSignageTasksKeyConfigured(Boolean(sigBody.keyConfigured))
      } else {
        setSignageTasksKeyConfigured(false)
      }
    } catch {
      setSignageTasksKeyConfigured(false)
    }

    try {
      const olRes = await fetch('/api/dashboard/signage-outlook', { cache: 'no-store' })
      const olBody = await olRes.json().catch(() => ({}))
      if (olRes.ok) {
        setSignageOutlookEnabled(Boolean(olBody.enabled))
        setSignageOutlookConfigured(Boolean(olBody.configured))
      } else {
        setSignageOutlookEnabled(false)
        setSignageOutlookConfigured(false)
      }
    } catch {
      setSignageOutlookEnabled(false)
      setSignageOutlookConfigured(false)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const callAdminSettings = async (action: string, payload: Record<string, any>) => {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.success) throw new Error(body.error || 'Request failed')
    return body
  }

  const saveProfile = async () => {
    if (!currentUser) return
    await supabase.from('team').update({ name: profileForm.name, email: profileForm.email, avatar_color: selectedColor }).eq('id', currentUser.id)
    setCurrentUser(prev => prev ? { ...prev, name: profileForm.name, email: profileForm.email, avatar_color: selectedColor } : null)
    setEditingProfile(false)
    setSavedMsg('Profile saved')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const loadDigestPreview = async () => {
    setDigestPreviewLoading(true)
    setDigestPreviewError(null)
    try {
      const res = await fetch('/api/daily-digest/preview')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load preview')
      setDigestPreview({
        subject: data.subject,
        body: data.body,
        html: data.html || '',
        longDateLabel: data.longDateLabel,
        timezone: data.timezone,
        todayKey: data.todayKey,
      })
    } catch (e: unknown) {
      setDigestPreviewError(e instanceof Error ? e.message : 'Failed to load preview')
      setDigestPreview(null)
    } finally {
      setDigestPreviewLoading(false)
    }
  }

  const sendDigestNow = async () => {
    setDigestSendLoading(true)
    try {
      const res = await fetch('/api/daily-digest/send', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send email')
      toast(`Daily email sent to ${data.recipient}`, 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to send email', 'error')
    } finally {
      setDigestSendLoading(false)
    }
  }

  const saveNotifPrefs = async () => {
    if (!currentUser) return
    const existing = await supabase.from('notification_preferences').select('id').eq('user_id', currentUser.id).single()
    if (existing.data) {
      await supabase.from('notification_preferences').update({ ...notifPrefs }).eq('user_id', currentUser.id)
    } else {
      await supabase.from('notification_preferences').insert({ user_id: currentUser.id, ...notifPrefs })
    }
    setSavedMsg('Preferences saved')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const inviteUser = async () => {
    if (!inviteEmail || !currentUser) return
    if (!confirm(`Add ${inviteEmail} to the team as ${inviteRole}? They'll receive an email with a sign-in link.`)) return
    setInviting(true)
    setInviteResult(null)

    // Check if email already in team
    const existing = team.find(m => m.email.toLowerCase() === inviteEmail.toLowerCase())
    if (existing) {
      setInviteResult({ success: false, message: `${inviteEmail} is already on the team` })
      setInviting(false)
      return
    }

    // Use edge function to create auth account + team record + send invite
    try {
      const name = inviteEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { setInviteResult({ success: false, message: 'Session expired. Please refresh the page and try again.' }); setInviting(false); return }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: inviteEmail, name, role: inviteRole, avatar_color: inviteColor }),
      })
      const result = await res.json()

      if (!res.ok || result.error) {
        setInviteResult({ success: false, message: result.error || 'Failed to invite. Please try again.' })
        setInviting(false)
        return
      }

      setInviteResult({ success: true, message: `Invite sent to ${inviteEmail}. They'll receive an email with a sign-in link.` })
      setInviteEmail('')
      setInviting(false)
      loadData()
    } catch {
      setInviteResult({ success: false, message: 'Failed to invite. Please try again.' })
      setInviting(false)
    }
  }

  const deactivateMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the team?`)) return
    try {
      await callAdminSettings('deactivate_member', { memberId })
    } catch (e: any) {
      toast(e.message || 'Failed to remove member', 'error')
      return
    }
    setTeam(prev => prev.filter(m => m.id !== memberId))
    setSavedMsg(`${memberName} removed`)
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const startViewAs = async (member: TeamMember) => {
    if (member.id === currentUser?.id) return
    try {
      const res = await fetch('/api/impersonate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberId: member.id }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast(json.error || 'Could not start view-as mode', 'error')
        return
      }
      toast(`Viewing as ${member.name}`, 'success')
      window.location.href = '/dashboard'
    } catch {
      toast('Could not start view-as mode', 'error')
    }
  }

  // ─── Email Templates CRUD ────────────────────────────────────────────────
  const startEditTpl = (t: EmailTemplate) => {
    setEditingTplId(t.id)
    setShowNewTpl(false)
    setTplForm({ label: t.label, subject: t.subject, body: t.body })
  }

  const startNewTpl = () => {
    setShowNewTpl(true)
    setEditingTplId(null)
    setTplForm({ label: '', subject: '', body: '' })
  }

  const cancelTplEdit = () => {
    setEditingTplId(null)
    setShowNewTpl(false)
    setTplForm({ label: '', subject: '', body: '' })
  }

  const saveTpl = async () => {
    if (!tplForm.label.trim() || !tplForm.subject.trim() || !tplForm.body.trim()) {
      toast('Label, subject, and body are required', 'error'); return
    }
    setSavingTpl(true)
    if (editingTplId) {
      try {
        await callAdminSettings('save_template', {
          id: editingTplId,
          label: tplForm.label.trim(),
          subject: tplForm.subject.trim(),
          body: tplForm.body,
        })
      } catch (e: any) {
        toast('Failed to save: ' + (e.message || 'Unknown error'), 'error'); setSavingTpl(false); return
      }
      setTemplates(prev => prev.map(t => t.id === editingTplId ? { ...t, label: tplForm.label.trim(), subject: tplForm.subject.trim(), body: tplForm.body } : t))
      toast('Template saved', 'success')
    } else {
      // Generate template_key from label
      const baseKey = tplForm.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `template_${Date.now()}`
      // Ensure uniqueness
      const existingKeys = new Set(templates.map(t => t.template_key))
      let key = baseKey
      let n = 2
      while (existingKeys.has(key)) { key = `${baseKey}_${n}`; n++ }
      const maxOrder = templates.reduce((m, t) => Math.max(m, t.sort_order), 0)
      let data: EmailTemplate | null = null
      try {
        const res = await callAdminSettings('create_template', {
          template_key: key,
          label: tplForm.label.trim(),
          subject: tplForm.subject.trim(),
          body: tplForm.body,
          sort_order: maxOrder + 1,
        })
        data = res.data
      } catch (e: any) {
        toast('Failed to create: ' + (e.message || 'Unknown error'), 'error'); setSavingTpl(false); return
      }
      if (data) setTemplates(prev => [...prev, data])
      toast('Template created', 'success')
    }
    setSavingTpl(false)
    cancelTplEdit()
  }

  const deleteTpl = async (id: string, label: string) => {
    if (!confirm(`Delete template "${label}"? This cannot be undone.`)) return
    try {
      await callAdminSettings('delete_template', { id })
    } catch (e: any) {
      toast('Failed to delete: ' + (e.message || 'Unknown error'), 'error'); return
    }
    setTemplates(prev => prev.filter(t => t.id !== id))
    toast('Template deleted', 'success')
  }

  const moveTpl = async (id: string, dir: 'up' | 'down') => {
    const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(t => t.id === id)
    if (idx === -1) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapIdx]
    try {
      await callAdminSettings('swap_template_order', { aId: a.id, aSort: a.sort_order, bId: b.id, bSort: b.sort_order })
    } catch (e: any) {
      toast(e.message || 'Failed to reorder templates', 'error'); return
    }
    setTemplates(prev => prev.map(t => {
      if (t.id === a.id) return { ...t, sort_order: b.sort_order }
      if (t.id === b.id) return { ...t, sort_order: a.sort_order }
      return t
    }))
  }

  // ─── Sign-up tier rules CRUD ─────────────────────────────────────────────
  const startEditTier = (t: SignupTier) => {
    setEditingTierId(t.id)
    setTierForm({
      cooldown_hours: String(t.cooldown_hours),
      monthly_event_cap: t.monthly_event_cap !== null ? String(t.monthly_event_cap) : '',
      description: t.description || '',
    })
  }

  const cancelTierEdit = () => {
    setEditingTierId(null)
    setTierForm({ cooldown_hours: '0', monthly_event_cap: '', description: '' })
  }

  const saveTier = async () => {
    if (!editingTierId) return
    const cooldown = parseInt(tierForm.cooldown_hours) || 0
    if (cooldown < 0) { toast('Cooldown cannot be negative', 'error'); return }
    const cap = tierForm.monthly_event_cap.trim() ? parseInt(tierForm.monthly_event_cap) : null
    if (cap !== null && cap < 0) { toast('Cap cannot be negative', 'error'); return }
    setSavingTier(true)
    try {
      await callAdminSettings('save_tier', {
        id: editingTierId,
        cooldown_hours: cooldown,
        monthly_event_cap: cap,
        description: tierForm.description.trim() || null,
      })
    } catch (e: any) {
      toast('Failed to save: ' + (e.message || 'Unknown error'), 'error'); setSavingTier(false); return
    }
    setTiers(prev => prev.map(t => t.id === editingTierId ? { ...t, cooldown_hours: cooldown, monthly_event_cap: cap, description: tierForm.description.trim() || null } : t))
    toast('Tier rules saved', 'success')
    setSavingTier(false)
    setEditingTierId(null)
  }

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} style={{ width: '40px', height: '22px', borderRadius: '11px', background: checked ? '#1e6cb5' : (dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'), border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: checked ? '21px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )

  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: '44px' }
  const isManager = currentUser?.role === 'Manager'
  type SettingsTab = 'account' | 'notifications' | 'signage' | 'team' | 'admin'
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')

  const addSchool = async () => {
    if (!newSchoolCode.trim() || !newSchoolName.trim()) return
    let data: SchoolListRow | null = null
    try {
      const res = await callAdminSettings('add_school', { code: newSchoolCode.trim(), name: newSchoolName.trim(), type: newSchoolType })
      data = res.data
    } catch (e: any) {
      toast(e.message || 'Failed to add school', 'error')
      return
    }
    if (data) { setSchools(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))); setNewSchoolCode(''); setNewSchoolName(''); setNewSchoolType('school') }
  }
  const updateSchool = async (id: string) => {
    if (!editSchoolName.trim()) return
    try {
      await callAdminSettings('update_school', { id, name: editSchoolName.trim() })
    } catch (e: any) {
      toast(e.message || 'Failed to update school', 'error')
      return
    }
    setSchools(prev => prev.map(s => s.id === id ? { ...s, name: editSchoolName.trim() } : s))
    setEditingSchool(null)
  }
  const deleteSchool = async (id: string) => {
    try {
      await callAdminSettings('delete_school', { id })
    } catch (e: any) {
      toast(e.message || 'Failed to remove school', 'error')
      return
    }
    if (schoolBrandingId === id) setSchoolBrandingId(null)
    setSchools(prev => prev.filter(s => s.id !== id))
  }
  const filteredSchools = schools.filter(s => !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || (s.code || '').includes(schoolSearch))

  const openSchoolBranding = (school: SchoolListRow) => {
    setEditingSchool(null)
    setSchoolBrandingId(school.id)
    setBrandForm({
      primary: school.primary_color || '',
      secondary: school.secondary_color || '',
      accent: school.accent_color || '',
      text: school.text_color || '',
      mascot: school.mascot || '',
    })
  }

  const normalizeHexField = (raw: string): string | null => {
    const t = raw.trim()
    if (!t) return null
    const h = t.startsWith('#') ? t : `#${t}`
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null
    return h.toLowerCase()
  }

  const saveSchoolBranding = async () => {
    if (!schoolBrandingId) return
    const primary = normalizeHexField(brandForm.primary)
    const secondary = normalizeHexField(brandForm.secondary)
    const accent = normalizeHexField(brandForm.accent)
    const text = normalizeHexField(brandForm.text)
    const pairs: [string, string | null][] = [
      [brandForm.primary, primary],
      [brandForm.secondary, secondary],
      [brandForm.accent, accent],
      [brandForm.text, text],
    ]
    for (const [raw, norm] of pairs) {
      if (raw.trim() && norm === null) {
        toast('Each color must be blank or a valid hex like #003087 or #abc', 'error')
        return
      }
    }
    setBrandSaving(true)
    try {
      await callAdminSettings('update_school', {
        id: schoolBrandingId,
        primary_color: primary,
        secondary_color: secondary,
        accent_color: accent,
        text_color: text,
        mascot: brandForm.mascot.trim() || null,
      })
    } catch (e: any) {
      toast(e.message || 'Failed to save brand colors', 'error')
      setBrandSaving(false)
      return
    }
    setSchools(prev => prev.map(s => (s.id === schoolBrandingId
      ? {
          ...s,
          primary_color: primary,
          secondary_color: secondary,
          accent_color: accent,
          text_color: text,
          mascot: brandForm.mascot.trim() || null,
        }
      : s)))
    setSchoolBrandingId(null)
    setBrandSaving(false)
    toast('Brand colors saved', 'success')
  }

  const saveAdminEmail = async () => {
    try {
      await callAdminSettings('save_admin_email', { adminEmail: adminEmail.trim() })
    } catch (e: any) {
      toast(e.message || 'Failed to save admin email', 'error')
      return
    }
    setAdminEmailSaved(true)
    setTimeout(() => setAdminEmailSaved(false), 2000)
  }

  const toggleSchoolType = async (school: SchoolListRow) => {
    const newType = school.type === 'school' ? 'department' : 'school'
    try {
      await callAdminSettings('toggle_school_type', { id: school.id, type: newType })
    } catch (e: any) {
      toast(e.message || 'Failed to update school type', 'error')
      return
    }
    setSchools(prev => prev.map(s => s.id === school.id ? { ...s, type: newType } : s))
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  // Sorted templates for display
  const sortedTemplates = [...templates].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Settings</h1>
        {savedMsg && <span style={{ fontSize: '14px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '6px 14px', borderRadius: '8px' }}>{savedMsg}</span>}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {[
          { id: 'account', label: 'Account' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'signage', label: 'Signage' },
          ...(isManager ? [{ id: 'team', label: 'Team' }, { id: 'admin', label: 'Admin' }] : []),
        ].map(tab => {
          const active = activeTab === (tab.id as SettingsTab)
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              style={{
                fontSize: '13px',
                padding: '8px 14px',
                borderRadius: '999px',
                border: `1px solid ${active ? '#1e6cb5' : border}`,
                background: active ? 'rgba(30,108,181,0.2)' : cardBg,
                color: active ? '#8dc4ff' : muted,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: active ? 700 : 500,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Profile */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'account' ? 'block' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0 }}>Profile</h2>
          <button onClick={() => setEditingProfile(!editingProfile)} style={{ fontSize: '15px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '40px' }}>{editingProfile ? 'Cancel' : 'Edit'}</button>
        </div>
        {editingProfile ? (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '14px', color: muted, display: 'block', marginBottom: '4px' }}>Name</label>
              <input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '14px', color: muted, display: 'block', marginBottom: '4px' }}>Email</label>
              <input value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', color: muted, display: 'block', marginBottom: '8px' }}>Avatar color</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {AVATAR_COLORS.map(c => (
                  <button key={c} onClick={() => setSelectedColor(c)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, border: selectedColor === c ? `3px solid ${text}` : '3px solid transparent', cursor: 'pointer', boxShadow: selectedColor === c ? `0 0 0 2px ${c}40` : 'none' }} />
                ))}
              </div>
            </div>
            <button onClick={saveProfile} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>Save profile</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: currentUser?.avatar_color || '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
              {currentUser?.name?.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p style={{ fontSize: '16px', fontWeight: 500, color: text, margin: 0 }}>{currentUser?.name}</p>
              <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{currentUser?.email}</p>
              <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0', textTransform: 'capitalize' as const }}>{currentUser?.role}</p>
            </div>
          </div>
        )}
      </div>

      {/* Appearance */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'account' ? 'block' : 'none' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 16px' }}>Appearance</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px' }}>
          <div>
            <p style={{ fontSize: '14px', color: text, margin: 0 }}>Dark mode</p>
            <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>Toggle between dark and light theme</p>
          </div>
          <Toggle checked={dark} onChange={toggleTheme} />
        </div>
      </div>

      {/* Security */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'account' ? 'block' : 'none' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 16px' }}>Security</h2>
        <p style={{ fontSize: '14px', color: muted, margin: '0 0 12px' }}>Set or change your login password</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
          <div>
            <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>New password</p>
            <input type="password" value={changePw} onChange={e => { setChangePw(e.target.value); setChangePwMsg('') }} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} style={{ ...inputStyle, width: '200px', fontSize: '14px' }} />
          </div>
          <div>
            <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Confirm</p>
            <input type="password" value={changePw2} onChange={e => { setChangePw2(e.target.value); setChangePwMsg('') }} placeholder="••••••••" style={{ ...inputStyle, width: '200px', fontSize: '14px' }} />
          </div>
          <button onClick={async () => {
            if (!changePw || changePw.length < MIN_PASSWORD_LENGTH) { setChangePwMsg(`At least ${MIN_PASSWORD_LENGTH} characters`); return }
            if (changePw !== changePw2) { setChangePwMsg('Passwords don\'t match'); return }
            setChangePwSaving(true)
            const { error } = await supabase.auth.updateUser({ password: changePw })
            if (error) setChangePwMsg(error.message)
            else { setChangePwMsg('Password updated!'); setChangePw(''); setChangePw2('') }
            setChangePwSaving(false)
          }} disabled={changePwSaving || !changePw || changePw !== changePw2} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: changePw && changePw === changePw2 ? '#1e6cb5' : 'var(--surface-2)', color: changePw && changePw === changePw2 ? '#fff' : muted, border: 'none', cursor: changePw && changePw === changePw2 ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
            {changePwSaving ? 'Saving...' : 'Update password'}
          </button>
        </div>
        {changePwMsg && <p style={{ fontSize: '13px', color: changePwMsg === 'Password updated!' ? '#22c55e' : '#ef4444', margin: '8px 0 0' }}>{changePwMsg}</p>}
      </div>

      {/* Notifications */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'notifications' ? 'block' : 'none' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 16px' }}>Notifications</h2>
        {NOTIF_SETTINGS.map(({ label, desc, emailKey, inappKey }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `0.5px solid ${border}` }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', color: text, margin: 0 }}>{label}</p>
              <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>{desc}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ fontSize: '13px', color: muted }}>Email</span>
                <Toggle checked={notifPrefs[emailKey]} onChange={v => setNotifPrefs(p => ({ ...p, [emailKey]: v }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ fontSize: '13px', color: muted }}>In-app</span>
                <Toggle checked={notifPrefs[inappKey]} onChange={v => setNotifPrefs(p => ({ ...p, [inappKey]: v }))} />
              </div>
            </div>
          </div>
        ))}
        <button onClick={saveNotifPrefs} style={{ marginTop: '14px', fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>Save preferences</button>
      </div>

      {/* Daily briefing email preview */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'notifications' ? 'block' : 'none' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 8px' }}>Daily briefing email</h2>
        <p style={{ fontSize: '14px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          Preview the automated morning email (your tasks first, then the full team calendar for the day). Sends Monday–Friday only, at the configured local time. This is what you would receive; other staff see their own version.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={loadDigestPreview}
            disabled={digestPreviewLoading}
            style={{
              fontSize: '14px',
              padding: '10px 20px',
              borderRadius: '10px',
              background: digestPreviewLoading ? 'var(--surface-2)' : '#1e6cb5',
              color: digestPreviewLoading ? muted : '#fff',
              border: 'none',
              cursor: digestPreviewLoading ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              minHeight: '44px',
            }}
          >
            {digestPreviewLoading ? 'Loading preview…' : 'Preview my daily email'}
          </button>
          <button
            type="button"
            onClick={sendDigestNow}
            disabled={digestSendLoading}
            style={{
              fontSize: '14px',
              padding: '10px 20px',
              borderRadius: '10px',
              background: digestSendLoading ? 'var(--surface-2)' : '#1f8f4e',
              color: digestSendLoading ? muted : '#fff',
              border: 'none',
              cursor: digestSendLoading ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              minHeight: '44px',
            }}
          >
            {digestSendLoading ? 'Sending…' : 'Send me daily email now'}
          </button>
        </div>
        {digestPreviewError && (
          <p style={{ fontSize: '14px', color: '#ef4444', margin: '12px 0 0' }}>{digestPreviewError}</p>
        )}
        {digestPreview && (
          <div style={{ marginTop: '16px' }}>
            <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px' }}>
              Date context: {digestPreview.longDateLabel} ({digestPreview.todayKey}, {digestPreview.timezone})
            </p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 8px' }}>Subject</p>
            <div
              style={{
                fontSize: '14px',
                color: text,
                padding: '12px 14px',
                borderRadius: '10px',
                background: inputBg,
                border: `0.5px solid ${border}`,
                marginBottom: '14px',
                fontFamily: 'inherit',
              }}
            >
              {digestPreview.subject}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDigestPreviewMode('html')}
                style={{
                  fontSize: '13px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: `0.5px solid ${border}`,
                  background: digestPreviewMode === 'html' ? '#1e6cb5' : 'transparent',
                  color: digestPreviewMode === 'html' ? '#fff' : muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                HTML (what inboxes show)
              </button>
              <button
                type="button"
                onClick={() => setDigestPreviewMode('text')}
                style={{
                  fontSize: '13px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: `0.5px solid ${border}`,
                  background: digestPreviewMode === 'text' ? '#1e6cb5' : 'transparent',
                  color: digestPreviewMode === 'text' ? '#fff' : muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Plain text fallback
              </button>
            </div>
            {digestPreviewMode === 'html' && digestPreview.html ? (
              <div
                style={{
                  borderRadius: '10px',
                  border: `0.5px solid ${border}`,
                  overflow: 'hidden',
                  maxHeight: '560px',
                  overflowY: 'auto',
                  background: dark ? '#0f172a' : '#f1f5f9',
                }}
              >
                <iframe
                  title="Daily digest preview"
                  srcDoc={digestPreview.html}
                  sandbox="allow-same-origin"
                  style={{
                    width: '100%',
                    minHeight: '520px',
                    border: 'none',
                    display: 'block',
                    background: '#fff',
                  }}
                />
              </div>
            ) : (
              <pre
                style={{
                  fontSize: '13px',
                  lineHeight: 1.45,
                  color: text,
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: inputBg,
                  border: `0.5px solid ${border}`,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '480px',
                  overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                }}
              >
                {digestPreview.body}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Signage links */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'signage' ? 'block' : 'none' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 8px' }}>Office signage screens</h2>
        <p style={{ fontSize: '14px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          Use these links for your wall displays. Open in full-screen on each TV/browser for always-on office dashboards.
        </p>
        <div style={{ display: 'grid', gap: '8px' }}>
          <a
            href="/signage"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '14px', color: '#5ba3e0', textDecoration: 'none', fontWeight: 600 }}
          >
            Production calendar signage →
          </a>
          <a
            href={taskSignageHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '14px', color: '#5ba3e0', textDecoration: 'none', fontWeight: 600 }}
          >
            Task ops signage →
          </a>
        </div>
        {signageTasksKeyConfigured === false && (
          <p style={{ fontSize: '12px', color: muted, margin: '10px 0 0' }}>
            Set the server env var <code style={{ fontSize: '11px' }}>SIGNAGE_TASKS_KEY</code> in Vercel (same value you use for the signage API). Until then, task signage opens without authorization and may not load data.
          </p>
        )}
        {taskSignageAbsolute && signageTasksKeyConfigured && (
          <p style={{ fontSize: '12px', color: muted, margin: '10px 0 0' }}>
            Full URL for TVs:{' '}
            <span style={{ wordBreak: 'break-all' as const, color: text }}>{taskSignageAbsolute}</span>
          </p>
        )}

        {isManager && (
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: `0.5px solid ${border}` }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 6px' }}>Outlook room calendar</h3>
            <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px', lineHeight: 1.5 }}>
              Show Outlook/room bookings on the production calendar signage in teal when they are not already represented by a Hub production on that day.
            </p>
            {!signageOutlookConfigured ? (
              <p style={{ fontSize: '12px', color: muted, margin: 0 }}>
                Not configured — set <code style={{ fontSize: '11px' }}>OUTLOOK_ICAL_URL</code> in Vercel to your published Outlook iCal feed.
              </p>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: signageOutlookBusy ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={signageOutlookEnabled}
                  disabled={signageOutlookBusy}
                  onChange={async (e) => {
                    const next = e.target.checked
                    setSignageOutlookBusy(true)
                    try {
                      const res = await fetch('/api/dashboard/signage-outlook', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: next }),
                      })
                      const body = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        toast(typeof body.error === 'string' ? body.error : 'Could not update Outlook signage setting', 'error')
                        return
                      }
                      setSignageOutlookEnabled(Boolean(body.enabled))
                      toast(next ? 'Outlook events will show on production signage.' : 'Outlook events hidden on production signage.', 'success')
                    } finally {
                      setSignageOutlookBusy(false)
                    }
                  }}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--brand-primary)' }}
                />
                <span style={{ fontSize: '14px', color: text, fontWeight: signageOutlookEnabled ? 600 : 500 }}>
                  Show Outlook bookings on production signage
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Team management — manager only */}
      {isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px', display: activeTab === 'team' ? 'block' : 'none' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 8px' }}>Team</h2>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 16px', lineHeight: 1.5 }}>
            Use <strong style={{ fontWeight: 600, color: text }}>View as</strong> to see the dashboard with their role and data. Exit anytime from the yellow banner at the top.
          </p>

          {team.map(member => (
            <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `0.5px solid ${border}` }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                {member.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{member.name}</p>
                <p style={{ fontSize: '14px', color: muted, margin: 0 }}>
                  {member.email}
                  {!member.supabase_user_id && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>Pending login</span>}
                  {!member.supabase_user_id && isManager && (
                    <button onClick={async () => {
                      try {
                        const { data: { session } } = await supabase.auth.refreshSession()
                        if (!session) { toast('Session expired. Please refresh.', 'error'); return }
                        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                          body: JSON.stringify({ email: member.email, name: member.name, role: member.role, avatar_color: member.avatar_color }),
                        })
                        const result = await res.json()
                        if (res.ok && result.success) {
                          toast(`Invite sent to ${member.email}`, 'success')
                          loadData()
                        } else {
                          toast(result.error || 'Failed to send invite', 'error')
                        }
                      } catch { toast('Failed to send invite') }
                    }} style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(30,108,181,0.1)', color: '#5ba3e0', border: '0.5px solid rgba(30,108,181,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>Send invite</button>
                  )}
                </p>
              </div>
              <span style={{ fontSize: '14px', padding: '3px 10px', borderRadius: '6px', background: 'var(--surface-2)', color: muted }}>{member.role}</span>
              {member.id !== currentUser?.id && (
                <>
                  <button
                    type="button"
                    onClick={() => void startViewAs(member)}
                    style={{
                      fontSize: '14px',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      background: 'rgba(232,160,32,0.1)',
                      border: '0.5px solid rgba(232,160,32,0.35)',
                      color: '#e8a020',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      minHeight: '36px',
                    }}
                  >
                    View as
                  </button>
                  <button onClick={() => deactivateMember(member.id, member.name)} style={{ fontSize: '14px', padding: '5px 10px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '36px' }}>Remove</button>
                </>
              )}
            </div>
          ))}

          <div style={{ marginTop: '20px', padding: '16px', background: 'var(--surface-2)', borderRadius: '12px', border: `0.5px solid ${border}` }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500, color: text, margin: '0 0 4px' }}>Invite team member</h3>
            <p style={{ fontSize: '14px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              They&apos;ll receive an email with a one-click sign-in link to <strong>csdtvstaff.org</strong>. Their auth account is created automatically — no signup needed.
            </p>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="District email address" type="email" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={inputStyle}>
                  <option value="Staff">Staff</option>
                  <option value="Manager">Manager</option>
                  <option value="Intern">Intern</option>
                  <option value="Student Intern">Student Intern</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 12px' }}>
                  <span style={{ fontSize: '14px', color: muted, flexShrink: 0 }}>Color:</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {AVATAR_COLORS.slice(0, 5).map(c => (
                      <button key={c} onClick={() => setInviteColor(c)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: c, border: inviteColor === c ? `2px solid ${text}` : '2px solid transparent', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <button onClick={inviteUser} disabled={inviting || !inviteEmail} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: inviteEmail ? '#1e6cb5' : 'var(--surface-2)', color: inviteEmail ? '#fff' : muted, border: 'none', cursor: inviteEmail ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
              {inviting ? 'Sending invite...' : 'Invite to team'}
            </button>
            {inviteResult && (
              <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: inviteResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `0.5px solid ${inviteResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                <p style={{ fontSize: '15px', color: inviteResult.success ? '#22c55e' : '#ef4444', margin: 0, lineHeight: 1.5 }}>{inviteResult.message}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin Settings ── */}
      {isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px', display: activeTab === 'admin' ? 'block' : 'none' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 4px' }}>Admin settings</h2>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 14px' }}>System-wide configuration</p>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Admin assistant email</p>
            <p style={{ fontSize: '11px', color: muted, margin: '0 0 6px' }}>Receives notification when a production is marked complete</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin.assistant@canyonsdistrict.org" style={{ ...inputStyle, flex: 1, fontSize: '14px' }} />
              <button onClick={saveAdminEmail} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
                {adminEmailSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Templates ── */}
      {isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px', display: activeTab === 'admin' ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 4px' }}>Email templates</h2>
              <p style={{ fontSize: '13px', color: muted, margin: 0, lineHeight: 1.5 }}>
                Templates for emailing organizers from production pages. Use <code style={{ fontSize: '12px', padding: '1px 5px', background: 'var(--surface-2)', borderRadius: '4px', color: text }}>{'{{variable}}'}</code> placeholders to auto-fill production details.
              </p>
            </div>
            {!showNewTpl && !editingTplId && (
              <button onClick={startNewTpl} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                + New template
              </button>
            )}
          </div>

          {/* Variables reference */}
          <div style={{ background: 'var(--surface-2)', border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 8px' }}>Available variables</p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {TEMPLATE_VARIABLES.map(v => (
                <span key={v.key} title={v.desc} style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '5px', background: dark ? 'rgba(91,163,224,0.1)' : 'rgba(91,163,224,0.08)', color: '#5ba3e0', fontFamily: 'monospace', cursor: 'help' }}>{v.key}</span>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: muted, margin: '8px 0 0', lineHeight: 1.4 }}>Hover for description. Variables auto-fill from the production when you send. <code style={{ fontSize: '11px', padding: '1px 4px', background: dark ? 'rgba(255,255,255,0.04)' : '#fff', borderRadius: '3px' }}>{'{{youtube_link}}'}</code> uses the livestream/video URL synced from the productions site (not Team Hub links or YouTube API).</p>
          </div>

          {/* New / Edit form */}
          {(showNewTpl || editingTplId) && (
            <div style={{ background: dark ? 'rgba(91,163,224,0.06)' : 'rgba(91,163,224,0.04)', border: '0.5px solid rgba(91,163,224,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 10px' }}>{showNewTpl ? 'New template' : 'Edit template'}</p>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Label</label>
                <input value={tplForm.label} onChange={e => setTplForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. YouTube Livestream Link" style={{ ...inputStyle, fontSize: '14px' }} />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Subject</label>
                <input value={tplForm.subject} onChange={e => setTplForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Livestream link for {{title}}" style={{ ...inputStyle, fontSize: '14px' }} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Body</label>
                <textarea value={tplForm.body} onChange={e => setTplForm(f => ({ ...f, body: e.target.value }))} placeholder="Hi {{name}}, here's the link..." style={{ ...inputStyle, minHeight: '180px', resize: 'vertical' as const, lineHeight: 1.5, fontSize: '13px', whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={saveTpl} disabled={savingTpl} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: savingTpl ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  {savingTpl ? 'Saving...' : (showNewTpl ? 'Create template' : 'Save changes')}
                </button>
                <button onClick={cancelTplEdit} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Template list */}
          {sortedTemplates.length === 0 ? (
            <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '20px 0', margin: 0 }}>No templates yet. Click &quot;+ New template&quot; to create one.</p>
          ) : (
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
              {sortedTemplates.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: i < sortedTemplates.length - 1 ? `0.5px solid ${border}` : 'none', background: editingTplId === t.id ? (dark ? 'rgba(91,163,224,0.06)' : 'rgba(91,163,224,0.04)') : 'transparent' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1px', flexShrink: 0 }}>
                    <button onClick={() => moveTpl(t.id, 'up')} disabled={i === 0} title="Move up" style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'transparent' : muted, fontSize: '11px', padding: '0 4px', lineHeight: 1, opacity: i === 0 ? 0.3 : 0.7 }}>▲</button>
                    <button onClick={() => moveTpl(t.id, 'down')} disabled={i === sortedTemplates.length - 1} title="Move down" style={{ background: 'none', border: 'none', cursor: i === sortedTemplates.length - 1 ? 'default' : 'pointer', color: i === sortedTemplates.length - 1 ? 'transparent' : muted, fontSize: '11px', padding: '0 4px', lineHeight: 1, opacity: i === sortedTemplates.length - 1 ? 0.3 : 0.7 }}>▼</button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{t.label}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.subject}</p>
                  </div>
                  <button onClick={() => startEditTpl(t)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: 'transparent', color: '#5ba3e0', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' }}>Edit</button>
                  <button onClick={() => deleteTpl(t.id, t.label)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sign-up tiers ── */}
      {isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px', display: activeTab === 'admin' ? 'block' : 'none' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 4px' }}>Student sign-up tiers</h2>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
            Rules for how often students in each tier can sign up for crew events. Manager override is always available regardless of these rules.
            Cooldown is the minimum hours between sign-ups. Monthly cap limits how many events a student can sign up for in a calendar month (leave blank for unlimited).
          </p>

          {tiers.length === 0 ? (
            <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '20px 0', margin: 0 }}>No tiers configured yet.</p>
          ) : (
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
              {tiers.map((t, i) => editingTierId === t.id ? (
                <div key={t.id} style={{ padding: '14px', borderBottom: i < tiers.length - 1 ? `0.5px solid ${border}` : 'none', background: dark ? 'rgba(91,163,224,0.06)' : 'rgba(91,163,224,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: text, textTransform: 'capitalize' as const }}>{t.name}</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: t.name === 'restricted' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.1)', color: t.name === 'restricted' ? '#f59e0b' : '#22c55e' }}>tier</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Cooldown (hours)</label>
                      <input type="number" min={0} value={tierForm.cooldown_hours} onChange={e => setTierForm(f => ({ ...f, cooldown_hours: e.target.value }))} style={{ ...inputStyle, fontSize: '14px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Monthly event cap</label>
                      <input type="number" min={0} value={tierForm.monthly_event_cap} onChange={e => setTierForm(f => ({ ...f, monthly_event_cap: e.target.value }))} placeholder="Leave blank = unlimited" style={{ ...inputStyle, fontSize: '14px' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Description (optional)</label>
                    <input value={tierForm.description} onChange={e => setTierForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. For students with attendance issues" style={{ ...inputStyle, fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={saveTier} disabled={savingTier} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: savingTier ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                      {savingTier ? 'Saving...' : 'Save changes'}
                    </button>
                    <button onClick={cancelTierEdit} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: i < tiers.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <span style={{ fontSize: '13px', padding: '4px 10px', borderRadius: '12px', background: t.name === 'restricted' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.1)', color: t.name === 'restricted' ? '#f59e0b' : '#22c55e', textTransform: 'capitalize' as const, fontWeight: 500, flexShrink: 0 }}>{t.name}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: text, margin: 0 }}>
                      Cooldown <strong>{t.cooldown_hours}h</strong> · Cap <strong>{t.monthly_event_cap !== null ? `${t.monthly_event_cap}/mo` : 'unlimited'}</strong>
                    </p>
                    {t.description && <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{t.description}</p>}
                  </div>
                  <button onClick={() => startEditTier(t)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: 'transparent', color: '#5ba3e0', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' }}>Edit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Schools / Locations ── */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', display: isManager ? (activeTab === 'admin' ? 'block' : 'none') : (activeTab === 'account' ? 'block' : 'none') }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: 0 }}>Schools &amp; locations</h2>
            <p style={{ fontSize: '13px', color: muted, margin: '4px 0 0' }}>{schools.filter(s => s.type === 'school').length} schools · {schools.filter(s => s.type === 'department').length} departments</p>
          </div>
        </div>

        {/* Add new */}
        {isManager && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Code</p>
              <input value={newSchoolCode} onChange={e => setNewSchoolCode(e.target.value)} placeholder="e.g. 702" style={{ ...inputStyle, width: '80px', fontSize: '14px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Name</p>
              <input value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSchool()} placeholder="e.g. Alta High" style={{ ...inputStyle, fontSize: '14px' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Type</p>
              <select value={newSchoolType} onChange={e => setNewSchoolType(e.target.value)} style={{ ...inputStyle, fontSize: '14px', width: '120px' }}>
                <option value="school">School</option>
                <option value="department">Department</option>
              </select>
            </div>
            <button onClick={addSchool} disabled={!newSchoolCode.trim() || !newSchoolName.trim()} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: newSchoolCode && newSchoolName ? '#1e6cb5' : 'var(--surface-2)', color: newSchoolCode && newSchoolName ? '#fff' : muted, border: 'none', cursor: newSchoolCode && newSchoolName ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
              Add
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 14px', marginBottom: '12px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={schoolSearch} onChange={e => setSchoolSearch(e.target.value)} placeholder="Search schools..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: text, fontFamily: 'inherit', width: '100%' }} />
          {schoolSearch && <button onClick={() => setSchoolSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
        </div>

        {/* Table */}
        <div style={{ border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 168px', padding: '10px 14px', borderBottom: `0.5px solid ${border}`, background: 'var(--surface-2)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Code</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Name</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Type</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', textAlign: 'right' as const }}>Actions</span>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' as const }}>
            {filteredSchools.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' as const }}>
                <p style={{ color: muted, fontSize: '14px', margin: 0 }}>{schoolSearch ? 'No matches' : 'No schools added yet'}</p>
              </div>
            ) : filteredSchools.map((school, i) => (
              <div key={school.id} style={{ borderBottom: i < filteredSchools.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 168px', padding: '10px 14px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: muted, fontFamily: 'monospace' }}>{school.code}</span>
                  {editingSchool === school.id ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input value={editSchoolName} onChange={e => setEditSchoolName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateSchool(school.id); if (e.key === 'Escape') setEditingSchool(null) }} autoFocus style={{ ...inputStyle, fontSize: '14px', flex: 1, padding: '6px 10px' }} />
                      <button type="button" onClick={() => updateSchool(school.id)} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                      <button type="button" onClick={() => setEditingSchool(null)} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '14px', color: text }}>{school.name}</span>
                  )}
                  <button type="button" onClick={() => isManager && toggleSchoolType(school)} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: school.type === 'school' ? 'rgba(34,197,94,0.1)' : 'rgba(96,165,250,0.1)', color: school.type === 'school' ? '#22c55e' : '#60a5fa', border: 'none', cursor: isManager ? 'pointer' : 'default', fontFamily: 'inherit' }}>{school.type}</button>
                  {isManager && editingSchool !== school.id && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => (schoolBrandingId === school.id ? setSchoolBrandingId(null) : openSchoolBranding(school))}
                        style={{ fontSize: '12px', color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {schoolBrandingId === school.id ? 'Close' : 'Colors'}
                      </button>
                      <button type="button" onClick={() => { setSchoolBrandingId(null); setEditingSchool(school.id); setEditSchoolName(school.name) }} style={{ fontSize: '12px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                      <button type="button" onClick={() => { if (confirm(`Remove "${school.name}"?`)) deleteSchool(school.id) }} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                    </div>
                  )}
                </div>
                {schoolBrandingId === school.id && isManager && (
                  <div style={{ padding: '12px 14px 16px', background: 'var(--surface-2)', borderTop: `0.5px solid ${border}` }}>
                    <p style={{ fontSize: '12px', color: muted, margin: '0 0 10px' }}>Saved on the <strong>schools</strong> row for thumbnails (#RGB or #RRGGBB). Leave blank to clear.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Primary</p>
                        <input value={brandForm.primary} onChange={e => setBrandForm(prev => ({ ...prev, primary: e.target.value }))} placeholder="#003087" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px', minHeight: '40px' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Secondary</p>
                        <input value={brandForm.secondary} onChange={e => setBrandForm(prev => ({ ...prev, secondary: e.target.value }))} placeholder="#e8a020" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px', minHeight: '40px' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Accent</p>
                        <input value={brandForm.accent} onChange={e => setBrandForm(prev => ({ ...prev, accent: e.target.value }))} placeholder="#ffffff" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px', minHeight: '40px' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Text</p>
                        <input value={brandForm.text} onChange={e => setBrandForm(prev => ({ ...prev, text: e.target.value }))} placeholder="#000000" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px', minHeight: '40px' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Mascot (thumbnail prompt)</p>
                      <input value={brandForm.mascot} onChange={e => setBrandForm(prev => ({ ...prev, mascot: e.target.value }))} placeholder="Hawks" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px', minHeight: '40px', maxWidth: '320px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" disabled={brandSaving} onClick={saveSchoolBranding} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: brandSaving ? 'var(--surface-2)' : '#1e6cb5', color: '#fff', border: 'none', cursor: brandSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}>{brandSaving ? 'Saving…' : 'Save colors'}</button>
                      <button type="button" disabled={brandSaving} onClick={() => setSchoolBrandingId(null)} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
