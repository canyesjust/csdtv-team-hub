'use client'

import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { getSchoolName } from '@/lib/schools'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Loader from '../../components/Loader'
import CommentsSection from '../../components/CommentsSection'
import StudentCrewTab from '../../components/StudentCrewTab'
import { toast } from '@/lib/toast'
import { ZoneHeader } from '../../components/ZoneHeader'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'

interface Production {
  id: string; production_number: number; title: string
  type: string | null; request_type_label: string | null; request_type_number: number | null
  internal_type_label: string | null; status: string | null
  organizer_name: string | null; organizer_email: string | null
  school_department: string | null; school_year: string | null; focus_area: string | null
  start_datetime: string | null; end_datetime: string | null
  filming_location: string | null; event_location: string | null
  additional_notes: string | null; video_description: string | null
  livestream_url: string | null; thumbnail_url: string | null
  project_lead: string | null; synced_at: string | null; team_notes: string | null
  deliverables_count: number; deliverables_notes: string | null
}

interface ChecklistItem {
  id: string; title: string; completed: boolean
  completed_at: string | null; assigned_to: string | null; sort_order: number
  kb_article_id: string | null
}

interface ProductionMember {
  id: string; user_id: string
  team: { id: string; name: string; role: string; avatar_color: string } | null
}

interface TeamMember { id: string; name: string; email: string; role: string; avatar_color: string }

interface ProductionLink { id: string; title: string; url: string; created_at: string }

interface KBArticle { id: string; title: string; category: string }

interface ActivityItem {
  id: string; action: string; detail: string | null; created_at: string
  user_id: string
  team?: { name: string } | null
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

const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  'LiveStream Meeting': ['Create thumbnail','Create livestream link','Assign staff','Determine if students needed','Confirm equipment type and pack','Email organizer'],
  'Record Meeting': ['Gather equipment','Record','Edit','Send for feedback','Final export','Send to organizer'],
  'Create a Video(Film, Edit, Publish)': ['Work with organizer on script','Create shot guide','Prep shoot and schedule','Pack equipment','Film','Edit','Send for feedback','Final export','Send to organizer'],
  'Create a Video': ['Work with organizer on script','Create shot guide','Prep shoot and schedule','Pack equipment','Film','Edit','Send for feedback','Final export','Send to organizer'],
  'Board Meeting': ['Setup board room','Find out if any virtual attendees','Create stream link','Create thumbnail','Email link to comms','Add to agenda','Stream meeting','Export board comments and run through AI','Email to Jeff'],
  'Photo Headshots': ['Confirm appointment','Send email — what to wear','Pack up shoot','Shoot','Edit photos','Send to organizer'],
  'Podcast': ['Confirm guest and topic','Prep equipment','Record','Edit audio','Create artwork or thumbnail','Export and publish'],
  'Other, Unsure, Or Consultation': ['Initial consultation','Define scope and deliverables','Execute','Review and deliver'],
}

export default function ProductionDetailPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const params = useParams()
  const supabase = createClient()
  const productionNum = params.id as string

  const [production, setProduction] = useState<Production | null>(null)
  const [uuid, setUuid] = useState<string>('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [members, setMembers] = useState<ProductionMember[]>([])
  const [allTeam, setAllTeam] = useState<TeamMember[]>([])
  const [links, setLinks] = useState<ProductionLink[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([])
  const [linkedVideos, setLinkedVideos] = useState<{ id: string; title: string; video_type: string; status: string; date_published: string | null; youtube_url: string | null; youtube_id: string | null; youtube_views: number | null; youtube_likes: number | null; youtube_duration: string | null; youtube_thumbnail: string | null }[]>([])
  const [linkedTasks, setLinkedTasks] = useState<{ id: string; title: string; status: string; priority: string; assigned_to: string | null; due_date: string | null }[]>([])
  const [callSheet, setCallSheet] = useState<any>(null)
  const [generatingSheet, setGeneratingSheet] = useState(false)
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist'|'info'|'team'|'links'|'activity'|'comments'|'videos'|'callsheet'|'studentcrew'>('checklist')
  const [selectedMember, setSelectedMember] = useState<string|null>(null)
  const [assignSuccess, setAssignSuccess] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [memberToAdd, setMemberToAdd] = useState('')
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [showKBLink, setShowKBLink] = useState(false)
  const [selectedKB, setSelectedKB] = useState('')
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('normal')
  const [teamNotes, setTeamNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [delivCount, setDelivCount] = useState(0)
  const [delivNotes, setDelivNotes] = useState('')
  const [savingDeliv, setSavingDeliv] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [fetchingYt, setFetchingYt] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeChecks, setCompleteChecks] = useState({ deliverables: false, organizer: false, files: false, quality: false })
  const [sendingComplete, setSendingComplete] = useState(false)
  const [showCopySetup, setShowCopySetup] = useState(false)
  const [copyTargetId, setCopyTargetId] = useState('')
  const [allProductions, setAllProductions] = useState<{ id: string; production_number: number; title: string }[]>([])
  const [emailTemplate, setEmailTemplate] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Fetch by production_number (the clean URL param)
    const prodRes = await supabase
      .from('productions')
      .select('*')
      .eq('production_number', Number(productionNum))
      .single()

    if (!prodRes.data) { setLoading(false); return }

    const prodUUID = prodRes.data.id
    setProduction(prodRes.data)
    setUuid(prodUUID)
    setTeamNotes(prodRes.data.team_notes || '')
    setDelivCount(prodRes.data.deliverables_count || 0)
    setDelivNotes(prodRes.data.deliverables_notes || '')

    // All related queries use the UUID as FK
    const [checkRes, membersRes, teamRes, linksRes, actRes, userRes, kbRes, tplRes] = await Promise.all([
      supabase.from('checklist_items').select('*').eq('production_id', prodUUID).order('sort_order'),
      supabase.from('production_members').select('*, team:team(id, name, role, avatar_color)').eq('production_id', prodUUID),
      supabase.from('team').select('*').eq('active', true),
      supabase.from('production_links').select('*').eq('production_id', prodUUID).order('created_at'),
      supabase.from('production_activity').select('*').eq('production_id', prodUUID).order('created_at', { ascending: false }).limit(50),
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
      supabase.from('knowledge_base').select('id, title, category').order('title'),
      supabase.from('email_templates').select('*').order('sort_order'),
    ])

    setChecklist(checkRes.data || [])
    if ((checkRes.data || []).length === 0) setActiveTab('info')
    setMembers(membersRes.data || [])
    setAllTeam(teamRes.data || [])
    setLinks(linksRes.data || [])
    setActivity(actRes.data || [])
    setCurrentUser(userRes.data)
    setKbArticles(kbRes.data || [])
    setTemplates(tplRes.data || [])
    // Load linked videos
    const { data: vidData } = await supabase.from('videos').select('id, title, video_type, status, date_published, youtube_url, youtube_id, youtube_views, youtube_likes, youtube_duration, youtube_thumbnail').eq('production_id', prodUUID).order('created_at', { ascending: false })
    setLinkedVideos(vidData || [])
    const { data: taskData } = await supabase.from('tasks').select('id, title, status, priority, assigned_to, due_date').eq('production_id', prodUUID).order('created_at', { ascending: false })
    setLinkedTasks(taskData || [])
    const { data: sheetData } = await supabase.from('call_sheets').select('*').eq('production_id', prodUUID).single()
    if (sheetData) setCallSheet(sheetData)
    const { data: allProdsData } = await supabase.from('productions').select('id, production_number, title').neq('id', prodUUID).order('production_number', { ascending: false }).limit(50)
    setAllProductions(allProdsData || [])
    setLoading(false)
  }, [supabase, productionNum])

  useEffect(() => { loadData() }, [loadData])

  const getTypeLabel = (prod: Production) => prod.request_type_label || prod.type || 'Unknown'

  const logActivity = useCallback(async (action: string, detail?: string) => {
    if (!currentUser || !uuid) return
    const { error } = await supabase.from('production_activity').insert({ production_id: uuid, user_id: currentUser.id, action, detail: detail || null })
    if (!error) {
      setActivity(prev => [{ id: Date.now().toString(), production_id: uuid, user_id: currentUser.id, action, detail: detail || null, created_at: new Date().toISOString(), team: { name: currentUser.name } }, ...prev])
    }
  }, [currentUser, uuid, supabase])

  const createTaskForProduction = useCallback(async () => {
    if (!newTaskTitle || !currentUser || !uuid) return
    const { data, error } = await supabase.from('tasks').insert({
      title: newTaskTitle, priority: newTaskPriority,
      assigned_to: newTaskAssignee || null, due_date: newTaskDue || null,
      production_id: uuid, status: 'pending', created_by: currentUser.id,
    }).select('id, title, status, priority, assigned_to, due_date').single()
    if (error) { toast(`Failed to create task: ${error.message}`); return }
    if (data) setLinkedTasks(prev => [data, ...prev])
    // Send email to assignee if assigned to someone else
    if (newTaskAssignee && newTaskAssignee !== currentUser.id && production) {
      const assignee = allTeam.find(m => m.id === newTaskAssignee)
      if (assignee?.email) {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: 'task_assigned', recipientEmail: assignee.email, recipientName: assignee.name.split(' ')[0],
              subject: `Task assigned: ${newTaskTitle}`,
              body: `You've been assigned a task on #${production.production_number} ${production.title}:\n\n"${newTaskTitle}"${newTaskDue ? `\nDue: ${new Date(newTaskDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}\nPriority: ${newTaskPriority}`,
              actionUrl: `/dashboard/productions/${production.production_number}`, actionLabel: 'View Production',
            }),
          })
        }
      }
    }
    setNewTaskTitle(''); setNewTaskAssignee(''); setNewTaskDue(''); setNewTaskPriority('normal')
    setShowCreateTask(false)
    await logActivity('Created task', newTaskTitle)
  }, [newTaskTitle, newTaskPriority, newTaskAssignee, newTaskDue, currentUser, uuid, supabase, logActivity, allTeam, production])

  const initChecklist = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    const typeLabel = getTypeLabel(production)
    const template = CHECKLIST_TEMPLATES[typeLabel] || CHECKLIST_TEMPLATES['Other, Unsure, Or Consultation']
    const items = template.map((title, i) => ({ production_id: uuid, title, sort_order: i, completed: false }))
    const { data } = await supabase.from('checklist_items').insert(items).select('*')
    if (data) { setChecklist(data); await logActivity('Initialized checklist', `${data.length} steps from ${typeLabel} template`) }
  }, [production, currentUser, uuid, supabase, logActivity])

  const generateCallSheet = useCallback(async () => {
    if (!production || !uuid || !currentUser) return
    setGeneratingSheet(true)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { toast('Session expired', 'error'); setGeneratingSheet(false); return }
      const teamNames = members.map(m => m.team?.name).filter(Boolean)
      const checklistTitles = checklist.map(c => c.title)
      const schoolName = getSchoolName(production.school_department) || production.school_department || ''
      const locationName = getSchoolName(production.filming_location) || production.filming_location || ''
      // Fetch school address
      let schoolAddress = ''
      let schoolPhone = ''
      if (production.school_department) {
        const code = production.school_department.replace(/^0+/, '')
        const { data: schoolData } = await supabase.from('schools').select('address, phone').or(`code.eq.${production.school_department},code.eq.${code}`).limit(1).single()
        if (schoolData) { schoolAddress = schoolData.address || ''; schoolPhone = schoolData.phone || '' }
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-call-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ production: { ...production, id: uuid, team_names: teamNames, checklist_items: checklistTitles, resolved_school: schoolName, resolved_location: locationName, school_address: schoolAddress, school_phone: schoolPhone } }),
      })
      const result = await res.json()
      if (result.success) { setCallSheet(result.call_sheet); setActiveTab('callsheet') }
      else toast(result.error || 'Failed to generate call sheet', 'error')
    } catch { toast('Failed to generate call sheet') }
    setGeneratingSheet(false)
  }, [production, uuid, currentUser, supabase, checklist, members])

  const printCallSheet = () => {
    const el = document.getElementById('call-sheet-print')
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Call Sheet — ${production?.title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;padding:24px;font-size:13px;line-height:1.5}
.cs-header{border-bottom:3px solid #1a1a1a;padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between}
.cs-title{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
.cs-name{font-size:20px;font-weight:700}
.cs-date{font-size:20px;font-weight:500;color:#c0392b;text-align:right}
.cs-day{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px}
.cs-bar{display:flex;border:1px solid #e0e0e0;border-radius:4px;margin-bottom:16px;font-size:12px}
.cs-bar-item{flex:1;padding:8px 12px;border-right:1px solid #e0e0e0}
.cs-bar-item:last-child{border-right:none}
.cs-bar-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;margin-bottom:2px}
.cs-bar-val{font-weight:600}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.cs-card{border:1px solid #e0e0e0;border-radius:4px;padding:12px 14px}
.cs-card-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#6b7280;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f3f4f6}
.cs-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.cs-row+.cs-row{border-top:1px dotted #e0e0e0}
.cs-label{color:#6b7280;font-weight:500}
.cs-val{font-weight:600;text-align:right}
.cs-notes{background:#eff6ff;border-left:3px solid #1e3a5f;padding:12px 14px;border-radius:0 4px 4px 0;margin-bottom:14px}
.cs-notes h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin-bottom:6px}
.cs-notes li{padding:3px 0;padding-left:16px;position:relative;list-style:none}
.cs-notes li::before{content:'—';position:absolute;left:0;color:#1e3a5f;font-weight:700}
.cs-contact{display:flex;justify-content:space-between;padding-top:14px;border-top:2px solid #1a1a1a;font-size:12px}
.cs-footer{margin-top:16px;padding-top:10px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;font-size:10px;color:#6b7280}
.cs-check{display:flex;align-items:center;gap:6px;padding:3px 0}.cs-check input{width:14px;height:14px}
@media print{body{padding:16px}}
</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const emailCallSheet = useCallback(async () => {
    if (!production || !callSheet) return
    const teamEmails = members.map(m => allTeam.find(t => t.id === m.user_id)?.email).filter(Boolean) as string[]
    if (teamEmails.length === 0) { toast('No team members assigned to email'); return }
    if (!confirm(`Email call sheet to ${teamEmails.join(', ')}?`)) return
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) return
      const cs = callSheet
      const p = production
      const d = p.start_datetime ? new Date(p.start_datetime) : null
      const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
      const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBD'
      const venue = getSchoolName(p.filming_location) || getSchoolName(p.school_department) || p.filming_location || 'TBD'
      const address = cs.content?.production_snapshot?.school_address || ''
      const timelineHtml = (cs.schedule || []).map((t: any) => `<tr><td style="padding:6px 12px;color:#6b7280;font-weight:500;white-space:nowrap">${t.time}</td><td style="padding:6px 12px;font-weight:600">${t.activity}</td></tr>`).join('')
      const equipHtml = (cs.equipment || []).map((e: any) => `<tr><td style="padding:4px 12px">☐ ${e.item}</td></tr>`).join('')
      const notesHtml = (cs.producer_notes || []).map((n: string) => `<li style="padding:3px 0">${n}</li>`).join('')
      const crewHtml = (cs.crew || []).map((c: any) => `<tr><td style="padding:4px 12px;color:#6b7280">${c.role}</td><td style="padding:4px 12px;font-weight:600;text-align:right">${c.name || '<em style="color:#9ca3af">Unassigned</em>'}</td></tr>`).join('')

      const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:3px solid #1a1a1a;padding-bottom:14px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px">CSDtv Call Sheet</div>
          <div style="font-size:22px;font-weight:700">#${p.production_number} ${p.title}</div>
        </div>
        <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;margin-bottom:16px;font-size:13px">
          <tr>
            <td style="padding:10px 14px;border-right:1px solid #e0e0e0;background:#f9fafb"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280">Date</div><div style="font-weight:600">${dateStr}</div></td>
            <td style="padding:10px 14px;border-right:1px solid #e0e0e0;background:#f9fafb"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280">Time</div><div style="font-weight:600">${timeStr}</div></td>
            <td style="padding:10px 14px;background:#f9fafb"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280">Type</div><div style="font-weight:600">${p.request_type_label || 'Production'}</div></td>
          </tr>
        </table>
        <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;margin-bottom:16px;font-size:13px">
          <tr><td style="padding:10px 14px" colspan="2"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:4px">Location</div><div style="font-weight:600;font-size:15px">${venue}</div>${address ? `<div style="color:#6b7280;margin-top:2px">${address}</div>` : ''}${address ? `<div style="margin-top:6px"><a href="https://maps.google.com/?q=${encodeURIComponent(address)}" style="color:#1e6cb5;text-decoration:none;font-size:12px">📍 Open in Google Maps</a></div>` : ''}</td></tr>
        </table>
        <table style="width:100%;margin-bottom:16px"><tr><td style="vertical-align:top;width:50%;padding-right:8px">
          <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;font-size:13px">
            <tr><td colspan="2" style="padding:8px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:1px solid #f3f4f6">Timeline</td></tr>
            ${timelineHtml}
          </table>
        </td><td style="vertical-align:top;width:50%;padding-left:8px">
          <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:8px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:1px solid #f3f4f6">Equipment</td></tr>
            ${equipHtml}
          </table>
        </td></tr></table>
        <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;font-size:13px;margin-bottom:16px">
          <tr><td colspan="2" style="padding:8px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:1px solid #f3f4f6">Crew</td></tr>
          ${crewHtml}
        </table>
        ${notesHtml ? `<div style="background:#eff6ff;border-left:3px solid #1e3a5f;padding:12px 16px;border-radius:0 4px 4px 0;margin-bottom:16px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin-bottom:6px">Producer Notes</div>
          <ul style="list-style:none;padding:0;margin:0;font-size:13px">${notesHtml}</ul>
        </div>` : ''}
        ${cs.parking_access ? `<div style="background:#f9fafb;padding:10px 14px;border-radius:4px;margin-bottom:16px;font-size:13px">🅿️ <strong>Parking:</strong> ${cs.parking_access}</div>` : ''}
        <div style="border-top:2px solid #1a1a1a;padding-top:12px;font-size:12px;display:flex;justify-content:space-between">
          <div><strong>Organizer:</strong> ${p.organizer_name || 'N/A'} · <span style="color:#6b7280">${p.organizer_email || ''}</span></div>
        </div>
        <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e0e0e0;font-size:10px;color:#9ca3af">CSDtv Production Services · Canyons School District</div>
      </div>`

      for (const email of teamEmails) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ type: 'call_sheet', recipientEmail: email, subject: `Call Sheet: #${p.production_number} ${p.title} — ${dateStr}`, body: '', html }),
        })
      }
      toast('Call sheet emailed to crew!')
    } catch { toast('Failed to email call sheet') }
  }, [production, callSheet, supabase, members, allTeam])

  const toggleItem = useCallback(async (item: ChecklistItem) => {
    const updates = { completed: !item.completed, completed_at: !item.completed ? new Date().toISOString() : null }
    await supabase.from('checklist_items').update(updates).eq('id', item.id)
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, ...updates } : c))
    await logActivity(!item.completed ? 'Completed step' : 'Uncompleted step', item.title)
  }, [supabase, logActivity])

  const moveItem = useCallback(async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= checklist.length) return
    const a = checklist[index]
    const b = checklist[swapIdx]
    await Promise.all([
      supabase.from('checklist_items').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('checklist_items').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    setChecklist(prev => {
      const next = [...prev]
      next[index] = { ...b, sort_order: a.sort_order }
      next[swapIdx] = { ...a, sort_order: b.sort_order }
      return next.sort((x, y) => x.sort_order - y.sort_order)
    })
  }, [supabase, checklist])

  const massAssign = useCallback(async () => {
    if (!selectedMember || !uuid) return
    await supabase.from('checklist_items').update({ assigned_to: selectedMember }).eq('production_id', uuid)
    const member = allTeam.find(m => m.id === selectedMember)
    setChecklist(prev => prev.map(c => ({ ...c, assigned_to: selectedMember })))
    setSelectedMember(null)
    setAssignSuccess(true)
    setTimeout(() => setAssignSuccess(false), 2500)
    await logActivity('Mass assigned checklist', `All steps assigned to ${member?.name}`)
  }, [selectedMember, uuid, supabase, allTeam, logActivity])

  const addMember = useCallback(async () => {
    if (!memberToAdd || !uuid) return
    const existing = members.find(m => m.user_id === memberToAdd)
    if (existing) { setMemberToAdd(''); return }
    const { data } = await supabase.from('production_members').insert({ production_id: uuid, user_id: memberToAdd }).select('*, team:team(id, name, role, avatar_color, email)').single()
    if (data) {
      setMembers(prev => [...prev, data])
      const member = allTeam.find(m => m.id === memberToAdd)
      await logActivity('Added team member', member?.name)

      // Send email notification to the added member
      if (member?.email && production) {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          const d = production.start_datetime ? new Date(production.start_datetime) : null
          const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
          const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
          const venue = getSchoolName(production.filming_location) || getSchoolName(production.school_department) || production.filming_location || 'TBD'
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: 'production_assignment',
              recipientEmail: member.email,
              recipientName: member.name.split(' ')[0],
              subject: `You've been added to #${production.production_number} ${production.title}`,
              body: `You've been assigned to production #${production.production_number} — ${production.title}.\n\nDate: ${dateStr}${timeStr ? ` at ${timeStr}` : ''}\nLocation: ${venue}\nType: ${production.request_type_label || 'Production'}\n\nView the production details and checklist in the Team Hub.`,
              actionUrl: `/dashboard/productions/${production.production_number}`,
              actionLabel: 'View Production',
            }),
          })
        }
      }
    }
    setMemberToAdd('')
    setAddingMember(false)
  }, [memberToAdd, members, uuid, supabase, allTeam, logActivity, production])

  const removeMember = useCallback(async (memberId: string, memberName: string) => {
    if (!uuid) return
    await supabase.from('production_members').delete().eq('production_id', uuid).eq('user_id', memberId)
    setMembers(prev => prev.filter(m => m.user_id !== memberId))
    await logActivity('Removed team member', memberName)
  }, [uuid, supabase, logActivity])

  // ─── Email templates ─────────────────────────────────────────────────────
  // Templates are loaded from email_templates table via loadData.
  // Variable substitution supports: {{name}}, {{title}}, {{type}}, {{date}},
  // {{date_short}}, {{venue}}, {{youtube_link}}, {{status}}.
  const substituteVariables = (str: string): string => {
    if (!production) return str
    const name = production.organizer_name?.split(' ')[0] || 'there'
    const title = production.title
    const type = production.request_type_label || production.type || 'production'
    const date = production.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'
    const dateShort = production.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'
    const venue = production.event_location || getSchoolName(production.filming_location) || 'TBD'
    const status = production.status || ''
    // {{youtube_link}} priority:
    //   1. production.livestream_url — the YouTube link set on the production itself
    //      (this is the "upcoming livestream" link for sharing BEFORE the event)
    //   2. Most recently linked video — fallback for "deliverable ready" emails AFTER the event
    //   3. Empty string if neither exists
    const ytLink = production.livestream_url
      || (linkedVideos.length > 0 ? (linkedVideos[0].youtube_url || (linkedVideos[0].youtube_id ? `https://youtube.com/watch?v=${linkedVideos[0].youtube_id}` : '')) : '')
    return str
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{type\}\}/g, type)
      .replace(/\{\{date_short\}\}/g, dateShort)
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{venue\}\}/g, venue)
      .replace(/\{\{youtube_link\}\}/g, ytLink)
      .replace(/\{\{status\}\}/g, status)
  }

  const selectTemplate = (templateId: string) => {
    const t = templates.find(x => x.id === templateId)
    if (!t) return
    setEmailTemplate(templateId)
    setEmailBody(substituteVariables(t.body))
    setEmailSubject(substituteVariables(t.subject))
  }

  const copySetupTo = useCallback(async () => {
    if (!copyTargetId || !uuid || !currentUser) return
    // Copy checklist items
    const items = checklist.map((c, i) => ({ production_id: copyTargetId, title: c.title, completed: false, sort_order: i }))
    if (items.length > 0) await supabase.from('checklist_items').insert(items)
    // Copy team members
    const memberInserts = members.map(m => ({ production_id: copyTargetId, user_id: m.user_id }))
    if (memberInserts.length > 0) await supabase.from('production_members').insert(memberInserts)
    // Log activity
    await supabase.from('production_activity').insert({ production_id: copyTargetId, user_id: currentUser.id, action: 'setup_copied', detail: `Copied from #${production?.production_number || ''}` })
    setShowCopySetup(false)
    setCopyTargetId('')
    toast('Setup copied!', 'success')
  }, [copyTargetId, uuid, currentUser, checklist, members, supabase, production])

  const markProductionComplete = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    setSendingComplete(true)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { setSendingComplete(false); return }
      // Get admin assistant email from settings
      const { data: settingData } = await supabase.from('app_settings').select('value').eq('key', 'admin_assistant_email').single()
      const adminEmail = settingData?.value || ''
      const recipients = [currentUser.email, adminEmail].filter(Boolean)
      const prodTitle = `#${production.production_number} ${production.title}`
      const body = `Production ${prodTitle} has been marked complete in CSDtv Team Hub.\n\nPlease mark this production as complete in the district productions system.\n\nType: ${production.request_type_label || 'Unknown'}\nOrganizer: ${production.organizer_name || 'N/A'}\nDate: ${production.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}\n\n— CSDtv Team Hub`
      for (const email of recipients) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ type: 'production_complete', recipientEmail: email, subject: `Production complete: ${prodTitle}`, body }),
        })
      }
      await supabase.from('production_activity').insert({ production_id: uuid, user_id: currentUser.id, action: 'marked_complete', detail: 'Production marked complete — email sent to admin' })
      setActivity(prev => [{ id: Date.now().toString(), production_id: uuid, user_id: currentUser.id, action: 'marked_complete', detail: 'Production marked complete — email sent to admin', created_at: new Date().toISOString(), team: { name: currentUser.name } }, ...prev])
    } catch { /* error */ }
    setSendingComplete(false)
    setShowCompleteModal(false)
    setCompleteChecks({ deliverables: false, organizer: false, files: false, quality: false })
  }, [production, currentUser, uuid, supabase])

  const requestInProgress = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) return
      const { data: settingData } = await supabase.from('app_settings').select('value').eq('key', 'admin_assistant_email').single()
      const adminEmail = settingData?.value || ''
      const recipients = [currentUser.email, adminEmail].filter(Boolean)
      const prodTitle = `#${production.production_number} ${production.title}`
      const body = `Production ${prodTitle} is now in progress in CSDtv Team Hub.\n\nPlease update this production's status to "In Progress" in the district productions system.\n\nType: ${production.request_type_label || 'Unknown'}\nOrganizer: ${production.organizer_name || 'N/A'}\nDate: ${production.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}\n\n— CSDtv Team Hub`
      for (const email of recipients) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ type: 'production_in_progress', recipientEmail: email, subject: `Production in progress: ${prodTitle}`, body }),
        })
      }
      await logActivity('requested_in_progress', 'Requested status change to In Progress — email sent to admin')
      toast('In Progress request sent', 'success')
    } catch { toast('Failed to send request', 'error') }
  }, [production, currentUser, uuid, supabase, logActivity])

  // Open organizer email in user's default mail client (Outlook) via mailto.
  // This replaces the previous send-via-Resend approach so the user can review
  // and edit before sending. Activity is logged when the button is clicked.
  const openOrganizerEmail = useCallback(async () => {
    if (!production?.organizer_email || !emailBody) return
    const tplLabel = templates.find(t => t.id === emailTemplate)?.label
    await logActivity('Emailed organizer', tplLabel ? `Template: ${tplLabel}` : 'Custom message')
    const mailto = `mailto:${production.organizer_email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    window.location.href = mailto
    setTimeout(() => { setShowEmailModal(false); setEmailTemplate(''); setEmailBody(''); setEmailSubject('') }, 500)
  }, [production, emailBody, emailSubject, emailTemplate, templates, logActivity])

  // ─── Team notes ──────────────────────────────────────────────────────────
  const saveTeamNotes = useCallback(async () => {
    if (!uuid) return
    setSavingNotes(true)
    const { error } = await supabase.from('productions').update({ team_notes: teamNotes }).eq('id', uuid)
    setSavingNotes(false)
    if (error) { toast('Failed to save notes', 'error'); return }
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 3000)
  }, [uuid, teamNotes, supabase])

  const saveVideosProduced = useCallback(async () => {
    if (!uuid) return
    setSavingDeliv(true)
    const { error } = await supabase.from('productions').update({ deliverables_count: delivCount, deliverables_notes: delivNotes || null }).eq('id', uuid)
    setSavingDeliv(false)
    if (error) { toast('Failed to save videos produced', 'error'); return }
    toast('Videos Produced saved', 'success')
    await logActivity('Updated videos produced', `${delivCount} items${delivNotes ? ' — ' + delivNotes : ''}`)
  }, [uuid, delivCount, delivNotes, supabase, logActivity])

  const refreshYoutubeStats = useCallback(async (videoId: string, ytId: string) => {
    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(ytId)}`)
      if (!res.ok) { toast('Failed to refresh stats', 'error'); return }
      const yt = await res.json()
      const { error } = await supabase.from('videos').update({ youtube_views: yt.views, youtube_likes: yt.likes, youtube_synced_at: new Date().toISOString() }).eq('id', videoId)
      if (error) { toast('Failed to save refreshed stats', 'error'); return }
      setLinkedVideos(prev => prev.map(v => v.id === videoId ? { ...v, youtube_views: yt.views, youtube_likes: yt.likes } : v))
      toast(`Updated: ${yt.views.toLocaleString()} views`, 'success')
    } catch { toast('Refresh failed', 'error') }
  }, [supabase])

  const linkYoutubeVideo = useCallback(async () => {
    if (!youtubeUrl || !uuid || !currentUser || !production) return
    setFetchingYt(true)
    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(youtubeUrl)}`)
      if (!res.ok) { const e = await res.json(); toast(e.error || 'Failed to fetch video', 'error'); setFetchingYt(false); return }
      const yt = await res.json()
      // Create video entry linked to this production
      const { data, error } = await supabase.from('videos').insert({
        title: yt.title, video_type: production.request_type_label || 'Video', status: 'Published',
        date_published: yt.local_date || (yt.published_at ? new Date(yt.published_at).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : null),
        description: yt.description?.slice(0, 500) || null,
        production_id: uuid, created_by: currentUser.id,
        youtube_url: youtubeUrl, youtube_id: yt.youtube_id,
        youtube_views: yt.views, youtube_likes: yt.likes,
        youtube_duration: yt.duration, youtube_thumbnail: yt.thumbnail,
        youtube_synced_at: new Date().toISOString(),
      }).select().single()
      if (error) { toast('Failed to create video entry: ' + error.message, 'error') }
      else {
        toast(`Linked "${yt.title}" — ${yt.views.toLocaleString()} views`, 'success')
        setYoutubeUrl('')
        await logActivity('Linked YouTube video', yt.title)
        // Reload linked videos
        const { data: refreshed } = await supabase.from('videos').select('id, title, video_type, status, date_published, youtube_url, youtube_id, youtube_views, youtube_likes, youtube_duration, youtube_thumbnail').eq('production_id', uuid).order('created_at', { ascending: false })
        if (refreshed) setLinkedVideos(refreshed)
      }
    } catch { toast('Failed to connect to YouTube', 'error') }
    setFetchingYt(false)
  }, [youtubeUrl, uuid, currentUser, production, supabase, logActivity])

  const addLink = useCallback(async () => {
    if (!newLinkTitle || !newLinkUrl || !currentUser || !uuid) return
    const url = newLinkUrl.startsWith('http') ? newLinkUrl : `https://${newLinkUrl}`
    const { data, error } = await supabase.from('production_links').insert({ production_id: uuid, title: newLinkTitle, url, added_by: currentUser.id }).select().single()
    if (error) { toast('Failed to add link', 'error'); return }
    if (data) { setLinks(prev => [...prev, data]); setNewLinkTitle(''); setNewLinkUrl(''); setShowLinkForm(false) }
  }, [newLinkTitle, newLinkUrl, currentUser, uuid, supabase])

  const addKBLink = useCallback(async () => {
    if (!selectedKB || !uuid) return
    const article = kbArticles.find(a => a.id === selectedKB)
    if (!article) return
    const url = `${window.location.origin}/dashboard/knowledge?article=${selectedKB}`
    const { data, error } = await supabase.from('production_links').insert({ production_id: uuid, title: `KB: ${article.title}`, url, added_by: currentUser?.id }).select().single()
    if (error) { toast('Failed to add KB link', 'error'); return }
    if (data) { setLinks(prev => [...prev, data]); setSelectedKB(''); setShowKBLink(false) }
  }, [selectedKB, kbArticles, uuid, supabase, currentUser])

  const completedCount = checklist.filter(c => c.completed).length
  const progress = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0

  const inputStyle: CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px',
    padding: '8px 12px', fontSize: '13px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: '40px',
  }

  const infoTone = statusTone.info.color
  const warningTone = statusTone.warning.color
  const successTone = statusTone.success.color
  const brandTone = 'var(--brand-primary)'

  const tabBtn = (tab: typeof activeTab, label: string, count?: number) => (
    <button key={tab} onClick={() => setActiveTab(tab)} style={{
      fontSize: '13px', padding: '10px 14px', border: 'none', background: 'transparent',
      cursor: 'pointer', fontFamily: 'inherit',
      color: activeTab === tab ? infoTone : muted,
      borderBottom: activeTab === tab ? `2px solid ${brandTone}` : '2px solid transparent',
      fontWeight: activeTab === tab ? 500 : 400, whiteSpace: 'nowrap' as const,
    }}>
      {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
    </button>
  )

  const formatDateTime = (d: string | null) => {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )

  if (!production) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
      <p style={{ color: muted }}>Production not found</p>
      <Link href="/dashboard/productions" style={{ color: '#5ba3e0' }}>Back</Link>
    </div>
  )

  const typeLabel = getTypeLabel(production)
  const nonMembers = allTeam.filter(m => !members.find(pm => pm.user_id === m.id))

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      <Link href="/dashboard/productions" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: muted, fontSize: '13px', textDecoration: 'none', marginBottom: '16px', minHeight: '40px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Productions
      </Link>

      {/* Header */}
      <section style={{ ...uiStyles.zoneSection, marginBottom: '20px' }}>
        <ZoneHeader title="Production Brief" />
        <div style={{ ...uiStyles.card, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: muted }}>#{production.production_number}</span>
              <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>{typeLabel}</span>
              {production.internal_type_label && production.internal_type_label !== typeLabel && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'var(--surface-2)', color: muted }}>{production.internal_type_label}</span>
              )}
              <span style={{ ...statusBadge('success', true), fontSize: '11px' }}>{production.status}</span>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: '0 0 6px' }}>{production.title}</h1>
            {production.organizer_name && (
              <p style={{ fontSize: '13px', color: muted, margin: 0, wordBreak: 'break-all' as const }}>
                {production.organizer_name}
                {production.organizer_email && (
                  <> · <a href={`mailto:${production.organizer_email}`} style={{ color: '#5ba3e0', textDecoration: 'none' }}>{production.organizer_email}</a></>
                )}
              </p>
            )}
            {production.organizer_email && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                <button onClick={() => setShowEmailModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.info.background, color: infoTone, border: `0.5px solid ${statusTone.info.border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ✉ Email organizer
                </button>
                <button onClick={requestInProgress} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.warning.background, color: warningTone, border: `0.5px solid ${statusTone.warning.border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ◴ Request In Progress
                </button>
                <button onClick={() => setShowCompleteModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.success.background, color: successTone, border: `0.5px solid ${statusTone.success.border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ✓ Mark complete
                </button>
              </div>
            )}
          </div>
          {production.thumbnail_url && production.thumbnail_url.startsWith('http') && (
            <div style={{ width: '120px', height: '68px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
              <img src={production.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
            </div>
          )}
        </div>

        {/* Info strip */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '12px', padding: '10px 14px', background: inputBg, borderRadius: '10px', border: `0.5px solid ${border}` }}>
          {production.start_datetime && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{ color: text }}>{formatDateTime(production.start_datetime)}</span>
            </div>
          )}
          {(production.filming_location || production.school_department) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span style={{ color: text }}>{getSchoolName(production.filming_location) || getSchoolName(production.school_department) || production.filming_location || ''}</span>
            </div>
          )}
          {production.livestream_url && (
            <a href={production.livestream_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: infoTone, textDecoration: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              Livestream link
            </a>
          )}
          {members.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {members.slice(0, 4).map((m, i) => m.team && (
                <div key={m.id} title={m.team.name} style={{ width: '24px', height: '24px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#0a0f1e', marginLeft: i > 0 ? '-6px' : 0, border: `2px solid ${cardBg}`, position: 'relative', zIndex: members.length - i }}>
                  {m.team.name.slice(0, 2).toUpperCase()}
                </div>
              ))}
              {members.length > 4 && <span style={{ fontSize: '11px', color: muted, marginLeft: '4px' }}>+{members.length - 4}</span>}
            </div>
          )}
          {(delivCount > 0 || linkedVideos.length > 0) && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500 }}>
              🎬 {delivCount > 0 ? `${delivCount} produced` : `${linkedVideos.length} video${linkedVideos.length !== 1 ? 's' : ''}`}
              {linkedVideos.some(v => v.youtube_views) ? ` · ${linkedVideos.reduce((s, v) => s + (v.youtube_views || 0), 0).toLocaleString()} views` : ''}
            </span>
          )}
        </div>
        </div>
      </section>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: '20px', overflowX: 'auto' as const, background: cardBg, borderRadius: '10px 10px 0 0', padding: '0 6px' }}>
        {tabBtn('checklist', 'Checklist', checklist.length > 0 ? completedCount : undefined)}
        {tabBtn('info', 'Production info')}
        {tabBtn('team', 'Team', members.length)}
        {tabBtn('links', 'Links', links.length)}
        {tabBtn('activity', 'Activity')}
        {tabBtn('comments', 'Comments')}
        {tabBtn('videos', 'Videos', linkedVideos.length)}
        {tabBtn('callsheet', 'Call sheet', callSheet ? 1 : 0)}
        {tabBtn('studentcrew', 'Student Crew')}
      </div>

      {/* CHECKLIST TAB */}
      {activeTab === 'checklist' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' as const }}>
            <button onClick={async () => {
              if (!production || !uuid) return
              const typeLabel = production.request_type_label || production.type
              if (!typeLabel) { toast('No production type set'); return }
              // Find the most recent completed production of same type
              const { data: lastProd } = await supabase.from('productions').select('id, production_number, title').eq('request_type_label', typeLabel).neq('id', uuid).order('start_datetime', { ascending: false }).limit(1).single()
              if (!lastProd) { toast(`No previous ${typeLabel} production found`, 'error'); return }
              if (!confirm(`Apply checklist and team from #${lastProd.production_number} ${lastProd.title}?`)) return
              const [clRes, tmRes] = await Promise.all([
                supabase.from('checklist_items').select('title, sort_order').eq('production_id', lastProd.id).order('sort_order'),
                supabase.from('production_members').select('user_id').eq('production_id', lastProd.id),
              ])
              if (clRes.data && clRes.data.length > 0) {
                await supabase.from('checklist_items').insert(clRes.data.map((c: any, i: number) => ({ production_id: uuid, title: c.title, completed: false, sort_order: i })))
              }
              if (tmRes.data && tmRes.data.length > 0) {
                await supabase.from('production_members').insert(tmRes.data.map((m: any) => ({ production_id: uuid, user_id: m.user_id })))
              }
              loadData()
            }} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}>
              Apply last {production.request_type_label?.split('(')[0]?.trim() || 'type'} setup
            </button>
            <button onClick={() => setShowCopySetup(!showCopySetup)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}>
              Copy setup to...
            </button>
            <button
              onClick={() => setShowCreateTask(!showCreateTask)}
              style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create task for this production
            </button>
          </div>

          {showCopySetup && (
            <div style={{ background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <p style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>Copy checklist ({checklist.length} items) and team ({members.length} members) to another production:</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={copyTargetId} onChange={e => setCopyTargetId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">Select a production...</option>
                  {allProductions.map(p => <option key={p.id} value={p.id}>#{p.production_number} {p.title}</option>)}
                </select>
                <button onClick={copySetupTo} disabled={!copyTargetId} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: copyTargetId ? '#1e6cb5' : 'var(--surface-2)', color: copyTargetId ? '#fff' : muted, border: 'none', cursor: copyTargetId ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap' as const }}>Copy</button>
              </div>
            </div>
          )}

          {showCreateTask && (
            <div style={{ background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title" style={{ ...inputStyle, marginBottom: '8px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {allTeam.map(m => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
                </select>
                <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)} style={inputStyle}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="day of">Day of</option>
                </select>
                <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={createTaskForProduction}
                  disabled={!newTaskTitle}
                  style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: newTaskTitle ? '#1e6cb5' : 'var(--surface-2)', color: newTaskTitle ? '#fff' : muted, border: 'none', cursor: newTaskTitle ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}
                >
                  Create task
                </button>
                <button
                  onClick={() => setShowCreateTask(false)}
                  style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {checklist.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 20px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
              <p style={{ color: muted, fontSize: '14px', marginBottom: '12px' }}>No checklist yet</p>
              <button
                onClick={initChecklist}
                style={{ fontSize: '13px', padding: '8px 20px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
              >
                Load {typeLabel} template
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ flex: 1, height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '3px', transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '12px', color: muted, flexShrink: 0 }}>{completedCount} of {checklist.length}</span>
              </div>

              {/* Mass assign */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: muted, flexShrink: 0 }}>Assign all to:</span>
                <div style={{ display: 'flex', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
                  {allTeam.map(member => (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMember(selectedMember === member.id ? null : member.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', border: `0.5px solid ${selectedMember === member.id ? '#22c55e' : border}`, background: selectedMember === member.id ? 'rgba(34,197,94,0.1)' : 'transparent', color: selectedMember === member.id ? '#22c55e' : muted, fontFamily: 'inherit' }}
                    >
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700, color: '#0a0f1e' }}>
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      {member.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={massAssign}
                  disabled={!selectedMember}
                  style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', border: 'none', background: selectedMember ? '#1e6cb5' : 'var(--surface-2)', color: selectedMember ? '#fff' : muted, cursor: selectedMember ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}
                >
                  {assignSuccess ? '✓ Assigned' : 'Assign all'}
                </button>
              </div>

              <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                {checklist.map((item, i) => {
                  const assignee = allTeam.find(m => m.id === item.assigned_to)
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, padding: '12px 16px', borderBottom: i < checklist.length - 1 ? `0.5px solid ${border}` : 'none', background: item.completed ? (dark ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.03)') : 'transparent' }}>
                      <button
                        onClick={() => toggleItem(item)}
                        style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, border: `1.5px solid ${item.completed ? '#22c55e' : border}`, background: item.completed ? '#22c55e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {item.completed && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      <span style={{ flex: '1 1 260px', minWidth: 0, fontSize: '13px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none' }}>
                        {item.title}
                        {item.kb_article_id && (() => {
                          const kb = kbArticles.find(a => a.id === item.kb_article_id)
                          return kb ? <Link href="/dashboard/knowledge" style={{ fontSize: '11px', color: '#5ba3e0', marginLeft: '6px', textDecoration: 'none' }}>📖 {kb.title}</Link> : null
                        })()}
                      </span>
                      <select value={item.kb_article_id || ''} onChange={e => {
                        const val = e.target.value || null
                        supabase.from('checklist_items').update({ kb_article_id: val }).eq('id', item.id)
                        setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, kb_article_id: val } : c))
                      }} style={{ fontSize: '11px', padding: '3px 6px', borderRadius: '6px', border: `0.5px solid ${border}`, background: inputBg, color: item.kb_article_id ? infoTone : muted, cursor: 'pointer', fontFamily: 'inherit', maxWidth: '60px', opacity: 0.8 }} title="Link KB article">
                        <option value="">📖</option>
                        {kbArticles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                      </select>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                        <button onClick={() => moveItem(i, 'up')} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'transparent' : muted, fontSize: '10px', padding: '0 4px', lineHeight: 1, opacity: 0.5 }}>▲</button>
                        <button onClick={() => moveItem(i, 'down')} disabled={i === checklist.length - 1} style={{ background: 'none', border: 'none', cursor: i === checklist.length - 1 ? 'default' : 'pointer', color: i === checklist.length - 1 ? 'transparent' : muted, fontSize: '10px', padding: '0 4px', lineHeight: 1, opacity: 0.5 }}>▼</button>
                      </div>
                      <select
                        value={item.assigned_to || ''}
                        onChange={e => {
                          supabase.from('checklist_items').update({ assigned_to: e.target.value || null }).eq('id', item.id)
                          setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, assigned_to: e.target.value || null } : c))
                        }}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: `0.5px solid ${border}`, background: inputBg, color: item.assigned_to ? text : muted, cursor: 'pointer', fontFamily: 'inherit', maxWidth: '130px' }}
                      >
                        <option value="">Unassigned</option>
                        {allTeam.map(m => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
                      </select>
                      {assignee && (
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                          {assignee.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={async () => {
                  const t = prompt('New step:')
                  if (!t || !uuid) return
                  const { data } = await supabase.from('checklist_items').insert({ production_id: uuid, title: t, sort_order: checklist.length, completed: false }).select('*').single()
                  if (data) setChecklist(prev => [...prev, data])
                }}
                style={{ marginTop: '10px', fontSize: '12px', color: muted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 0' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add step
              </button>
            </div>
          )}

          {/* Linked tasks */}
          {linkedTasks.length > 0 && (
            <div style={{ marginTop: '16px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 10px' }}>Tasks ({linkedTasks.length})</p>
              {linkedTasks.map((task, i) => {
                const assignee = allTeam.find(m => m.id === task.assigned_to)
                const statusColors: Record<string, string> = { pending: '#94a3b8', 'in progress': '#f59e0b', 'in review': '#a855f7', complete: '#22c55e' }
                const sc = statusColors[task.status] || '#94a3b8'
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < linkedTasks.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc, flexShrink: 0 }} />
                    <Link href="/dashboard/tasks" style={{ flex: 1, fontSize: '14px', color: text, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{task.title}</Link>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${sc}20`, color: sc }}>{task.status}</span>
                    {task.due_date && <span style={{ fontSize: '11px', color: muted }}>{new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    {assignee && (
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>{assignee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {/* INFO TAB */}
      {activeTab === 'info' && (
        <div>
          {/* Timeline */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 14px' }}>Production timeline</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', position: 'relative' as const }}>
              {(() => {
                const steps = [
                  { label: 'Requested', date: null, done: true },
                  { label: 'Approved', date: null, done: production.status !== 'Idea/Request' },
                  { label: 'Scheduled', date: production.start_datetime, done: !!production.start_datetime },
                  { label: 'Complete', date: activity.find(a => a.action === 'marked_complete')?.created_at || null, done: production.status === 'Complete' || activity.some(a => a.action === 'marked_complete') },
                ]
                return steps.map((step, i) => (
                  <div key={step.label} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', position: 'relative' as const }}>
                    {i > 0 && <div style={{ position: 'absolute' as const, top: '10px', right: '50%', width: '100%', height: '2px', background: step.done ? '#22c55e' : border, zIndex: 0 }} />}
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: step.done ? '#22c55e' : 'var(--surface-2)', border: step.done ? 'none' : `2px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, position: 'relative' as const }}>
                      {step.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: step.done ? text : muted, margin: '6px 0 0', textAlign: 'center' as const }}>{step.label}</p>
                    {step.date && <p style={{ fontSize: '10px', color: muted, margin: '2px 0 0' }}>{new Date(step.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                  </div>
                ))
              })()}
            </div>
            {production.synced_at && production.start_datetime && (
              <p style={{ fontSize: '12px', color: muted, margin: '12px 0 0', textAlign: 'center' as const }}>
                {Math.round((new Date(production.start_datetime).getTime() - new Date(production.synced_at).getTime()) / (1000 * 60 * 60 * 24))} days from request to shoot
                {production.status === 'Complete' || activity.some(a => a.action === 'marked_complete') ? ` · ${Math.round((new Date(activity.find(a => a.action === 'marked_complete')?.created_at || Date.now()).getTime() - new Date(production.synced_at).getTime()) / (1000 * 60 * 60 * 24))} days total turnaround` : ''}
              </p>
            )}
          </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>Organizer</h3>
            {([['Name', production.organizer_name], ['Email', production.organizer_email], ['School', getSchoolName(production.school_department)], ['Year', production.school_year], ['Focus', production.focus_area]] as [string, string | null][]).map(([l, v]) => v ? (
              <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '60px', flexShrink: 0 }}>{l}</span>
                <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
              </div>
            ) : null)}
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>Schedule & location</h3>
            {([['Start', formatDateTime(production.start_datetime)], ['End', formatDateTime(production.end_datetime)], ['Location', getSchoolName(production.filming_location) || production.filming_location || getSchoolName(production.school_department)], ['Venue', production.event_location]] as [string, string | null][]).map(([l, v]) => v ? (
              <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '60px', flexShrink: 0 }}>{l}</span>
                <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
              </div>
            ) : null)}
          </div>
          {production.additional_notes && (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Organizer notes</h3>
              <p style={{ fontSize: '13px', color: text, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' as const }}>{production.additional_notes}</p>
            </div>
          )}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Team notes</h3>
            <p style={{ fontSize: '11px', color: muted, margin: '0 0 8px' }}>Internal notes — only visible to CSDtv staff</p>
            <textarea
              value={teamNotes}
              onChange={e => setTeamNotes(e.target.value)}
              placeholder="Add internal notes about this production..."
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const, lineHeight: 1.5, marginBottom: '8px' }}
            />
            <button onClick={saveTeamNotes} disabled={savingNotes} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: notesSaved ? '#22c55e' : '#1e6cb5', color: '#fff', border: 'none', cursor: savingNotes ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500, transition: 'background 0.2s' }}>
              {notesSaved ? '✓ Saved!' : savingNotes ? 'Saving...' : 'Save notes'}
            </button>
          </div>

          {/* Videos Produced */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Videos Produced</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Count</label>
                <input type="number" value={delivCount} onChange={e => setDelivCount(parseInt(e.target.value) || 0)} min={0} style={{ ...inputStyle, width: '80px', padding: '7px 10px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Notes</label>
                <input value={delivNotes} onChange={e => setDelivNotes(e.target.value)} placeholder="e.g. 50 slideshows + 1 highlight reel" style={{ ...inputStyle, padding: '7px 10px' }} />
              </div>
              <button onClick={saveVideosProduced} disabled={savingDeliv} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}>
                {savingDeliv ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Link YouTube Video */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Link YouTube Video</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="Paste YouTube URL..." style={{ ...inputStyle, flex: 1, padding: '7px 10px' }} onKeyDown={e => e.key === 'Enter' && linkYoutubeVideo()} />
              <button onClick={linkYoutubeVideo} disabled={fetchingYt || !youtubeUrl} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: youtubeUrl ? '#ef4444' : 'var(--surface-2)', color: youtubeUrl ? '#fff' : muted, border: 'none', cursor: youtubeUrl ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}>
                {fetchingYt ? 'Fetching...' : '▶ Link'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: muted, margin: '6px 0 0' }}>Creates a Video Library entry with title, views, likes, and thumbnail from YouTube</p>
          </div>
        </div>
        </div>
      )}
      {/* TEAM TAB */}
      {activeTab === 'team' && (
        <div>
          <div style={{ ...uiStyles.card, padding: '12px 14px', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: muted }}>
              Team assigned: <span style={{ color: text, fontWeight: 600 }}>{members.length}</span>
              {nonMembers.length > 0 ? (
                <> · Available to add: <span style={{ color: text, fontWeight: 600 }}>{nonMembers.length}</span></>
              ) : null}
            </p>
          </div>
          {members.length === 0 ? (
            <div style={{ ...uiStyles.card, padding: '14px', marginBottom: '12px' }}>
              <p style={{ color: muted, fontSize: '13px', margin: 0 }}>No team members assigned to this production yet.</p>
            </div>
          ) : (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
              {members.map((m, i) => m.team && (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: i < members.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                    {m.team.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{m.team.name}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: 0, textTransform: 'capitalize' as const }}>{m.team.role}</p>
                  </div>
                  <button
                    onClick={() => m.team && removeMember(m.user_id, m.team.name)}
                    style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingMember ? (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: 500, color: text, margin: '0 0 10px' }}>Add team member</p>
              <select value={memberToAdd} onChange={e => setMemberToAdd(e.target.value)} style={{ ...inputStyle, marginBottom: '10px' }}>
                <option value="">Select a team member...</option>
                {nonMembers.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={addMember}
                  disabled={!memberToAdd}
                  style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: memberToAdd ? 'var(--brand-primary)' : 'var(--surface-2)', color: memberToAdd ? '#fff' : muted, border: 'none', cursor: memberToAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingMember(false); setMemberToAdd('') }}
                  style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : nonMembers.length > 0 ? (
            <button
              onClick={() => setAddingMember(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: infoTone, background: 'none', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', padding: '8px 14px', fontFamily: 'inherit', minHeight: '40px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add team member
            </button>
          ) : (
            <p style={{ color: muted, fontSize: '13px' }}>All team members are already on this production</p>
          )}
        </div>
      )}

      {/* LINKS TAB */}
      {activeTab === 'links' && (
        <div>
          {links.length === 0 && !showLinkForm && (
            <p style={{ color: muted, fontSize: '13px', marginBottom: '12px' }}>No links added yet</p>
          )}
          {links.map(link => (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', marginBottom: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#5ba3e0', textDecoration: 'none', fontWeight: 500 }}>{link.title}</a>
                <p style={{ fontSize: '11px', color: muted, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{link.url}</p>
              </div>
            </div>
          ))}

          {showLinkForm ? (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
              <input value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} placeholder="Link title" style={{ ...inputStyle, marginBottom: '8px' }} />
              <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="URL" style={{ ...inputStyle, marginBottom: '10px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={addLink} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Add link</button>
                <button onClick={() => setShowLinkForm(false)} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowLinkForm(true)}
                style={{ fontSize: '13px', color: '#5ba3e0', background: 'none', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontFamily: 'inherit', minHeight: '40px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add link
              </button>
              {kbArticles.length > 0 && (
                showKBLink ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select value={selectedKB} onChange={e => setSelectedKB(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
                      <option value="">Select KB article...</option>
                      {kbArticles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                    <button
                      onClick={addKBLink}
                      disabled={!selectedKB}
                      style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: selectedKB ? '#1e6cb5' : 'var(--surface-2)', color: selectedKB ? '#fff' : muted, border: 'none', cursor: selectedKB ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, minHeight: '40px' }}
                    >
                      Link
                    </button>
                    <button
                      onClick={() => setShowKBLink(false)}
                      style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '40px' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKBLink(true)}
                    style={{ fontSize: '13px', color: '#9b85e0', background: 'none', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontFamily: 'inherit', minHeight: '40px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
                    </svg>
                    Link KB article
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* ACTIVITY TAB */}
      {activeTab === 'activity' && (
        <div>
          {activity.length === 0 ? (
            <p style={{ color: muted, fontSize: '13px' }}>No activity yet</p>
          ) : (
            <div>
              {activity.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: i < activity.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', color: text, margin: '0 0 2px' }}>
                      <span style={{ fontWeight: 500 }}>{allTeam.find(t => t.id === item.user_id)?.name || item.team?.name || 'System'}</span> {item.action.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    {item.detail && <p style={{ fontSize: '12px', color: muted, margin: 0 }}>{item.detail}</p>}
                    <p style={{ fontSize: '11px', color: muted, margin: '3px 0 0' }}>
                      {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COMMENTS TAB */}
      {activeTab === 'comments' && uuid && currentUser && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
          <CommentsSection entityType="production" entityId={uuid} currentUserId={currentUser.id} team={allTeam} />
        </div>
      )}

      {/* VIDEOS TAB */}
      {activeTab === 'videos' && (
        <div>
          {linkedVideos.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: muted }}>{linkedVideos.length} video{linkedVideos.length !== 1 ? 's' : ''} linked{linkedVideos.some(v => v.youtube_views) ? ` · ${linkedVideos.reduce((s, v) => s + (v.youtube_views || 0), 0).toLocaleString()} total views` : ''}</span>
              <button onClick={async () => {
                if (!confirm(`Unlink all ${linkedVideos.length} videos from this production?`)) return
                for (const v of linkedVideos) await supabase.from('videos').update({ production_id: null }).eq('id', v.id)
                setLinkedVideos([])
                toast(`Unlinked ${linkedVideos.length} videos`, 'success')
              }} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Unlink all
              </button>
            </div>
          )}
          {linkedVideos.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '30px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px' }}>
              <p style={{ fontSize: '14px', color: muted, margin: '0 0 8px' }}>No videos linked to this production</p>
              <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>Use the "Link YouTube Video" section in the Info tab to add one</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
              {linkedVideos.map(v => (
                <div key={v.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: '14px', padding: '14px' }}>
                    {v.youtube_thumbnail && (
                      <a href={v.youtube_url || `https://youtube.com/watch?v=${v.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                        <img src={v.youtube_thumbnail} alt="" style={{ width: '160px', height: '90px', objectFit: 'cover' as const, borderRadius: '8px' }} />
                      </a>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.title}</p>
                      <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px' }}>{v.video_type} · {v.status}{v.date_published ? ` · ${new Date(v.date_published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</p>
                      {(v.youtube_views !== null || v.youtube_likes !== null || v.youtube_duration) && (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {v.youtube_views !== null && <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>👁 {v.youtube_views.toLocaleString()} views</span>}
                          {v.youtube_likes !== null && <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>👍 {v.youtube_likes.toLocaleString()}</span>}
                          {v.youtube_duration && <span style={{ fontSize: '13px', color: muted }}>⏱ {v.youtube_duration}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        {v.youtube_url && <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#ef4444', textDecoration: 'none', fontWeight: 500 }}>▶ Watch on YouTube</a>}
                        {v.youtube_id && <button onClick={() => refreshYoutubeStats(v.id, v.youtube_id!)} style={{ fontSize: '12px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>🔄 Refresh stats</button>}
                        <Link href={`/dashboard/videos/${v.id}`} style={{ fontSize: '12px', color: muted, textDecoration: 'none' }}>Open in library →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CALL SHEET TAB */}
      {activeTab === 'callsheet' && (
        <div>
          {!callSheet ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 20px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
              <p style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 6px' }}>No call sheet yet</p>
              <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px' }}>Generate one from this production's details using AI</p>
              <button onClick={generateCallSheet} disabled={generatingSheet} style={{ fontSize: '14px', padding: '12px 24px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: generatingSheet ? 0.7 : 1 }}>
                {generatingSheet ? 'Generating...' : '✨ Generate call sheet'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button onClick={printCallSheet} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>🖨 Print</button>
                <button onClick={emailCallSheet} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>📧 Email to crew</button>
                <button onClick={generateCallSheet} disabled={generatingSheet} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>{generatingSheet ? 'Regenerating...' : '🔄 Regenerate'}</button>
              </div>
              <div id="call-sheet-print">
                <div className="cs-header" style={{ borderBottom: `3px solid ${text}`, paddingBottom: '14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div className="cs-title" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: muted, marginBottom: '4px' }}>CSDtv Call Sheet</div>
                    <div className="cs-name" style={{ fontSize: '20px', fontWeight: 700, color: text }}>{production?.title}</div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div className="cs-date" style={{ fontSize: '20px', fontWeight: 500, color: '#c0392b' }}>{production?.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : 'TBD'}</div>
                    <div className="cs-day" style={{ fontSize: '11px', color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px' }}>{production?.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' }) : ''}</div>
                  </div>
                </div>
                <div className="cs-bar" style={{ display: 'flex', border: `1px solid ${border}`, borderRadius: '4px', marginBottom: '16px', fontSize: '12px' }}>
                  {[{ l: 'Status', v: production?.status || 'Scheduled' }, { l: 'Type', v: production?.request_type_label || 'Production' }, { l: 'School', v: getSchoolName(production?.school_department) || production?.school_department || '' }].map((item, i) => (
                    <div key={i} style={{ flex: 1, padding: '8px 12px', borderRight: i < 2 ? `1px solid ${border}` : 'none', background: cardBg }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.8px', color: muted, marginBottom: '2px' }}>{item.l}</div>
                      <div style={{ fontWeight: 600, color: text }}>{item.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Timeline</div>
                    {(callSheet.schedule || []).map((s: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: i > 0 ? `1px dotted ${border}` : 'none' }}>
                        <span style={{ color: muted, fontWeight: 500 }}>{s.time}</span>
                        <span style={{ fontWeight: 600, color: text, textAlign: 'right' as const }}>{s.activity}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Equipment</div>
                    {(callSheet.equipment || []).map((e: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '13px' }}>
                        <input type="checkbox" checked={e.checked} readOnly style={{ width: '14px', height: '14px' }} />
                        <span style={{ color: text }}>{e.item}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Location</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
                      <span style={{ color: muted, fontWeight: 500 }}>Venue</span>
                      <span style={{ fontWeight: 600, color: text }}>{getSchoolName(production?.filming_location) || getSchoolName(production?.school_department) || production?.filming_location || 'TBD'}</span>
                    </div>
                    {callSheet.content?.production_snapshot?.school_address && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: `1px dotted ${border}` }}>
                        <span style={{ color: muted, fontWeight: 500 }}>Address</span>
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(callSheet.content.production_snapshot.school_address)}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, color: '#5ba3e0', textDecoration: 'none', textAlign: 'right' as const, maxWidth: '60%' }}>{callSheet.content.production_snapshot.school_address} 📍</a>
                      </div>
                    )}
                    {callSheet.parking_access && <div style={{ fontSize: '13px', color: muted, marginTop: '8px', padding: '6px 8px', background: cardBg, borderRadius: '4px' }}>🅿️ {callSheet.parking_access}</div>}
                  </div>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Crew</div>
                    {(callSheet.crew || []).map((c: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: i > 0 ? `1px dotted ${border}` : 'none' }}>
                        <span style={{ color: muted, fontWeight: 500 }}>{c.role}</span>
                        <span style={{ fontWeight: 600, color: c.name ? text : muted, fontStyle: c.name ? 'normal' : 'italic' }}>{c.name || 'Unassigned'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {(callSheet.producer_notes || []).length > 0 && (
                  <div style={{ background: dark ? 'rgba(30,58,95,0.2)' : '#eff6ff', borderLeft: '3px solid #1e3a5f', padding: '12px 14px', borderRadius: '0 4px 4px 0', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1px', color: '#1e3a5f', marginBottom: '6px' }}>Producer Notes</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {callSheet.producer_notes.map((n: string, i: number) => (
                        <li key={i} style={{ fontSize: '13px', padding: '3px 0', paddingLeft: '16px', position: 'relative' as const, lineHeight: 1.45 }}>
                          <span style={{ position: 'absolute' as const, left: 0, color: '#1e3a5f', fontWeight: 700 }}>—</span>
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '14px', borderTop: `2px solid ${text}`, fontSize: '12px' }}>
                  <div><strong>Organizer:</strong> {production?.organizer_name || 'N/A'}<br /><span style={{ color: muted }}>{production?.organizer_email || ''}</span></div>
                  <div style={{ textAlign: 'right' as const }}><strong>CSDtv</strong><br /><span style={{ color: muted }}>{currentUser?.name || 'Justin Andersen'}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STUDENT CREW TAB */}
      {activeTab === 'studentcrew' && uuid && production && (
        <StudentCrewTab
          productionId={uuid}
          productionNumber={production.production_number}
          productionTitle={production.title}
          isManager={currentUser?.role === 'Manager'}
        />
      )}

      {/* EMAIL ORGANIZER MODAL */}
      {showEmailModal && production && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowEmailModal(false) }}>
          <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' as const, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>Email organizer</h2>
              <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>

            <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>
              To: <strong style={{ color: text }}>{production.organizer_name}</strong> ({production.organizer_email})
            </p>

            {templates.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => selectTemplate(t.id)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', border: `0.5px solid ${emailTemplate === t.id ? '#1e6cb5' : border}`, background: emailTemplate === t.id ? 'rgba(30,108,181,0.12)' : cardBg, color: emailTemplate === t.id ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 14px', padding: '10px 12px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: '8px', border: `0.5px solid ${border}` }}>
                No templates configured. <Link href="/dashboard/settings" style={{ color: '#5ba3e0' }}>Add templates in Settings</Link>.
              </p>
            )}

            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Subject</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject..." style={{ ...inputStyle }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Message</label>
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Pick a template or write your message..." style={{ ...inputStyle, minHeight: '240px', resize: 'vertical' as const, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }} />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={openOrganizerEmail} disabled={!emailBody} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: emailBody ? '#1e6cb5' : 'var(--surface-2)', color: emailBody ? '#fff' : muted, border: 'none', cursor: emailBody ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}>
                ✉ Open in Outlook
              </button>
              <button onClick={() => setShowEmailModal(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
            <p style={{ fontSize: '11px', color: muted, margin: '8px 0 0' }}>Opens your default email app so you can review and send. The send is logged to this production's activity when you click the button.</p>
          </div>
        </div>
      )}

      {/* MARK COMPLETE MODAL */}
      {showCompleteModal && production && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCompleteModal(false) }}>
          <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: '0 0 4px' }}>Mark production complete</h2>
            <p style={{ fontSize: '13px', color: muted, margin: '0 0 16px' }}>#{production.production_number} {production.title}</p>

            <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 10px' }}>Confirm before completing:</p>
            {([
              { key: 'deliverables' as const, label: 'All deliverables have been sent to the organizer' },
              { key: 'organizer' as const, label: 'Organizer has confirmed receipt' },
              { key: 'files' as const, label: 'Project files are saved and organized' },
              { key: 'quality' as const, label: 'Final quality check passed' },
            ]).map(item => (
              <div key={item.key} onClick={() => setCompleteChecks(prev => ({ ...prev, [item.key]: !prev[item.key] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', marginBottom: '6px', background: completeChecks[item.key] ? 'rgba(34,197,94,0.06)' : (dark ? 'rgba(255,255,255,0.02)' : '#f8fafc'), border: `0.5px solid ${completeChecks[item.key] ? 'rgba(34,197,94,0.2)' : border}`, cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `1.5px solid ${completeChecks[item.key] ? '#22c55e' : border}`, background: completeChecks[item.key] ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {completeChecks[item.key] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize: '14px', color: completeChecks[item.key] ? text : muted }}>{item.label}</span>
              </div>
            ))}

            <p style={{ fontSize: '12px', color: muted, margin: '14px 0 12px' }}>An email will be sent to you and the admin assistant to mark this complete in the district system.</p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={markProductionComplete} disabled={sendingComplete || !Object.values(completeChecks).every(Boolean)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: Object.values(completeChecks).every(Boolean) ? '#22c55e' : 'var(--surface-2)', color: Object.values(completeChecks).every(Boolean) ? '#fff' : muted, border: 'none', cursor: Object.values(completeChecks).every(Boolean) ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>
                {sendingComplete ? 'Sending...' : 'Confirm & notify'}
              </button>
              <button onClick={() => setShowCompleteModal(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}