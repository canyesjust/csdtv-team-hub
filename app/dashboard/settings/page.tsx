'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'

interface TeamMember { id: string; name: string; email: string; role: string; avatar_color: string; supabase_user_id: string | null }
interface NotificationPrefs {
  notify_assigned_email: boolean; notify_assigned_inapp: boolean
  notify_completed_email: boolean; notify_completed_inapp: boolean
  notify_new_production_email: boolean; notify_new_production_inapp: boolean
}

const NOTIF_SETTINGS: { label: string; desc: string; emailKey: keyof NotificationPrefs; inappKey: keyof NotificationPrefs }[] = [
  { label: 'Task assigned to me', desc: 'When someone assigns you a task', emailKey: 'notify_assigned_email', inappKey: 'notify_assigned_inapp' },
  { label: 'Task completed', desc: 'When a task you created is completed', emailKey: 'notify_completed_email', inappKey: 'notify_completed_inapp' },
  { label: 'New production synced', desc: 'When productions sync from the site', emailKey: 'notify_new_production_email', inappKey: 'notify_new_production_inapp' },
]

const AVATAR_COLORS = ['#e8a020', '#5ba3e0', '#22c55e', '#9b85e0', '#ef4444', '#f97316', '#06b6d4', '#ec4899']

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
  const [schools, setSchools] = useState<{ id: string; code: string; name: string; type: string }[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [newSchoolCode, setNewSchoolCode] = useState('')
  const [newSchoolName, setNewSchoolName] = useState('')
  const [newSchoolType, setNewSchoolType] = useState('school')
  const [editingSchool, setEditingSchool] = useState<string | null>(null)
  const [editSchoolName, setEditSchoolName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminEmailSaved, setAdminEmailSaved] = useState(false)

  const text    = dark ? '#f0f4ff' : '#1a1f36'
  const muted   = dark ? '#8899bb' : '#6b7280'
  const border  = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg  = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [userRes, teamRes, schoolsRes, settingsRes] = await Promise.all([
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
      supabase.from('team').select('*').eq('active', true).order('name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('app_settings').select('*'),
    ])
    setCurrentUser(userRes.data)
    setTeam(teamRes.data || [])
    setSchools(schoolsRes.data || [])
    const settings = settingsRes.data || []
    const adminSetting = settings.find((s: any) => s.key === 'admin_assistant_email')
    if (adminSetting) setAdminEmail(adminSetting.value || '')
    if (userRes.data) {
      setProfileForm({ name: userRes.data.name, email: userRes.data.email })
      setSelectedColor(userRes.data.avatar_color || '#e8a020')
      const { data: prefs } = await supabase.from('notification_preferences').select('*').eq('user_id', userRes.data.id).single()
      if (prefs) setNotifPrefs(prefs)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const saveProfile = async () => {
    if (!currentUser) return
    await supabase.from('team').update({ name: profileForm.name, email: profileForm.email, avatar_color: selectedColor }).eq('id', currentUser.id)
    setCurrentUser(prev => prev ? { ...prev, name: profileForm.name, email: profileForm.email, avatar_color: selectedColor } : null)
    setEditingProfile(false)
    setSavedMsg('Profile saved')
    setTimeout(() => setSavedMsg(''), 2000)
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
      const { data: { session } } = await supabase.auth.getSession()
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
    await supabase.from('team').update({ active: false }).eq('id', memberId)
    setTeam(prev => prev.filter(m => m.id !== memberId))
    setSavedMsg(`${memberName} removed`)
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} style={{ width: '40px', height: '22px', borderRadius: '11px', background: checked ? '#1e6cb5' : (dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'), border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: checked ? '21px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )

  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: '44px' }
  const isManager = currentUser?.role === 'Manager'

  const addSchool = async () => {
    if (!newSchoolCode.trim() || !newSchoolName.trim()) return
    const { data } = await supabase.from('schools').insert({ code: newSchoolCode.trim(), name: newSchoolName.trim(), type: newSchoolType }).select('*').single()
    if (data) { setSchools(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))); setNewSchoolCode(''); setNewSchoolName(''); setNewSchoolType('school') }
  }
  const updateSchool = async (id: string) => {
    if (!editSchoolName.trim()) return
    await supabase.from('schools').update({ name: editSchoolName.trim() }).eq('id', id)
    setSchools(prev => prev.map(s => s.id === id ? { ...s, name: editSchoolName.trim() } : s))
    setEditingSchool(null)
  }
  const deleteSchool = async (id: string) => {
    await supabase.from('schools').delete().eq('id', id)
    setSchools(prev => prev.filter(s => s.id !== id))
  }
  const filteredSchools = schools.filter(s => !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || s.code.includes(schoolSearch))

  const saveAdminEmail = async () => {
    await supabase.from('app_settings').upsert({ key: 'admin_assistant_email', value: adminEmail.trim(), updated_at: new Date().toISOString() })
    setAdminEmailSaved(true)
    setTimeout(() => setAdminEmailSaved(false), 2000)
  }

  const toggleSchoolType = async (school: { id: string; type: string }) => {
    const newType = school.type === 'school' ? 'department' : 'school'
    await supabase.from('schools').update({ type: newType }).eq('id', school.id)
    setSchools(prev => prev.map(s => s.id === school.id ? { ...s, type: newType } : s))
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Settings</h1>
        {savedMsg && <span style={{ fontSize: '14px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '6px 14px', borderRadius: '8px' }}>{savedMsg}</span>}
      </div>

      {/* Profile */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px' }}>
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
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 16px' }}>Appearance</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px' }}>
          <div>
            <p style={{ fontSize: '14px', color: text, margin: 0 }}>Dark mode</p>
            <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>Toggle between dark and light theme</p>
          </div>
          <Toggle checked={dark} onChange={toggleTheme} />
        </div>
      </div>

      {/* Notifications */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px' }}>
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

      {/* Team management — manager only */}
      {isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 16px' }}>Team</h2>

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
                        const { data: { session } } = await supabase.auth.getSession()
                        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                          body: JSON.stringify({ email: member.email, name: member.name, role: member.role, avatar_color: member.avatar_color }),
                        })
                        const result = await res.json()
                        if (res.ok && result.success) {
                          alert(`Invite sent to ${member.email}`)
                          loadData()
                        } else {
                          alert(result.error || 'Failed to send invite')
                        }
                      } catch { alert('Failed to send invite') }
                    }} style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(30,108,181,0.1)', color: '#5ba3e0', border: '0.5px solid rgba(30,108,181,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>Send invite</button>
                  )}
                </p>
              </div>
              <span style={{ fontSize: '14px', padding: '3px 10px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', color: muted }}>{member.role}</span>
              {member.id !== currentUser?.id && (
                <button onClick={() => deactivateMember(member.id, member.name)} style={{ fontSize: '14px', padding: '5px 10px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '36px' }}>Remove</button>
              )}
            </div>
          ))}

          <div style={{ marginTop: '20px', padding: '16px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8f9fc', borderRadius: '12px', border: `0.5px solid ${border}` }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500, color: text, margin: '0 0 4px' }}>Invite team member</h3>
            <p style={{ fontSize: '14px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              They'll receive an email with a one-click sign-in link to <strong>csdtvstaff.org</strong>. Their auth account is created automatically — no signup needed.
            </p>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="District email address" type="email" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={inputStyle}>
                  <option value="Staff">Staff</option>
                  <option value="Manager">Manager</option>
                  <option value="Intern">Intern</option>
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
            <button onClick={inviteUser} disabled={inviting || !inviteEmail} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: inviteEmail ? '#1e6cb5' : (dark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'), color: inviteEmail ? '#fff' : muted, border: 'none', cursor: inviteEmail ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
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
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
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

      {/* ── Schools / Locations ── */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
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
            <button onClick={addSchool} disabled={!newSchoolCode.trim() || !newSchoolName.trim()} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: newSchoolCode && newSchoolName ? '#1e6cb5' : (dark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'), color: newSchoolCode && newSchoolName ? '#fff' : muted, border: 'none', cursor: newSchoolCode && newSchoolName ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 100px', padding: '10px 14px', borderBottom: `0.5px solid ${border}`, background: dark ? 'rgba(255,255,255,0.02)' : '#f8f9fc' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Code</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Name</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Type</span>
            <span />
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' as const }}>
            {filteredSchools.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' as const }}>
                <p style={{ color: muted, fontSize: '14px', margin: 0 }}>{schoolSearch ? 'No matches' : 'No schools added yet'}</p>
              </div>
            ) : filteredSchools.map((school, i) => (
              <div key={school.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 100px', padding: '10px 14px', borderBottom: i < filteredSchools.length - 1 ? `0.5px solid ${border}` : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: muted, fontFamily: 'monospace' }}>{school.code}</span>
                {editingSchool === school.id ? (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input value={editSchoolName} onChange={e => setEditSchoolName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') updateSchool(school.id); if (e.key === 'Escape') setEditingSchool(null) }} autoFocus style={{ ...inputStyle, fontSize: '14px', flex: 1, padding: '6px 10px' }} />
                    <button onClick={() => updateSchool(school.id)} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                    <button onClick={() => setEditingSchool(null)} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                ) : (
                  <span style={{ fontSize: '14px', color: text }}>{school.name}</span>
                )}
                <button onClick={() => isManager && toggleSchoolType(school)} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: school.type === 'school' ? 'rgba(34,197,94,0.1)' : 'rgba(96,165,250,0.1)', color: school.type === 'school' ? '#22c55e' : '#60a5fa', border: 'none', cursor: isManager ? 'pointer' : 'default', fontFamily: 'inherit' }}>{school.type}</button>
                {isManager && editingSchool !== school.id && (
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setEditingSchool(school.id); setEditSchoolName(school.name) }} style={{ fontSize: '12px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                    <button onClick={() => { if (confirm(`Remove "${school.name}"?`)) deleteSchool(school.id) }} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
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