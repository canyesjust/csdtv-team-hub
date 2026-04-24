'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'
import Loader from './components/Loader'
import { getSchoolName } from '@/lib/schools'

interface Task {
  id: string; title: string; status: string; due_date: string | null; priority: string
  productions?: { title: string } | null
}

interface Production {
  id: string; production_number: number; title: string
  request_type_label: string | null; type: string | null; status: string | null
  start_datetime: string | null; filming_location: string | null; school_department: string | null
  checklist_items?: { id: string; title: string; completed: boolean }[]
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
}

interface TeamMember { id: string; name: string; role: string; avatar_color: string }
interface CurrentUser { id: string; name: string; role: string }
interface Activity { id: string; action: string; detail: string | null; created_at: string; production_id: string; team?: { name: string } | null }
interface ScheduleDay { monday: string; tuesday: string; wednesday: string; thursday: string; friday: string }

export default function DashboardPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myProductions, setMyProductions] = useState<Production[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [totalProductions, setTotalProductions] = useState(0)
  const [todayProductions, setTodayProductions] = useState<Production[]>([])
  const [overdueProductions, setOverdueProductions] = useState<Production[]>([])
  const [view, setView] = useState<'my' | 'team'>('my')
  const [loading, setLoading] = useState(true)
  const [todayHours, setTodayHours] = useState<string | null>(null)
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [weekStats, setWeekStats] = useState({ prodsCompleted: 0, tasksCompleted: 0, videosPublished: 0 })
  const [expandedTodayProd, setExpandedTodayProd] = useState<string | null>(null)
  const [monthStats, setMonthStats] = useState({ prodsCompleted: 0, tasksCompleted: 0, videosPublished: 0 })
  const [yearProdCount, setYearProdCount] = useState(0)
  const [totalDeliverables, setTotalDeliverables] = useState(0)
  const [totalYtViews, setTotalYtViews] = useState(0)

  const text     = dark ? '#f0f4ff' : '#1a1f36'
  const muted    = dark ? '#94a3b8' : '#6b7280'
  const border   = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const cardBg   = dark ? '#111827' : '#ffffff'
  const metricBg = dark ? '#1a2740' : '#f0f4ff'
  const rowHover = dark ? 'rgba(255,255,255,0.04)' : '#f8fafc'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: user } = await supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single()
    if (!user) return
    setCurrentUser(user)

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

    const [tasksRes, prodMembersRes, teamRes, allTasksRes, countRes, todayProdsRes, schedDefaultRes, activityRes] = await Promise.all([
      supabase.from('tasks').select('*, productions(title)').eq('assigned_to', user.id).neq('status', 'complete').order('due_date', { ascending: true, nullsFirst: false }).limit(12),
      supabase.from('production_members').select('production_id').eq('user_id', user.id),
      supabase.from('team').select('*').eq('active', true),
      supabase.from('tasks').select('*, productions(title)').neq('status', 'complete').order('due_date', { ascending: true, nullsFirst: false }).limit(12),
      supabase.from('productions').select('id', { count: 'exact', head: true }),
      supabase.from('productions').select('id, title, production_number, request_type_label, type, status, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(id, title, completed)').gte('start_datetime', todayStart.toISOString()).lte('start_datetime', todayEnd.toISOString()).limit(10),
      supabase.from('schedule_defaults').select('*').eq('user_id', user.id).single(),
      supabase.from('production_activity').select('*, team:team(name)').order('created_at', { ascending: false }).limit(10),
    ])

    setMyTasks(tasksRes.data || [])
    setTeamMembers(teamRes.data || [])
    setAllTasks(allTasksRes.data || [])
    setTotalProductions(countRes.count || 0)
    setTodayProductions((todayProdsRes.data as any) || [])
    setRecentActivity(activityRes.data || [])

    // Load overdue productions (past date, not Complete/Abandoned)
    const { data: overdueData } = await supabase.from('productions').select('id, title, production_number, request_type_label, status, start_datetime').lt('start_datetime', new Date().toISOString()).not('status', 'in', '("Complete","Abandoned")').order('start_datetime', { ascending: false }).limit(10)
    setOverdueProductions((overdueData || []) as any)

    // Figure out today's scheduled hours
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const
    const todayDayName = dayNames[new Date().getDay()]
    const isWeekday = todayDayName !== 'sunday' && todayDayName !== 'saturday'; if (isWeekday) { const dayKey = todayDayName as keyof ScheduleDay
      // Check for override this week first
      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      const weekStart = monday.toISOString().split('T')[0]
      const { data: override } = await supabase.from('schedule_overrides').select('*').eq('user_id', user.id).eq('week_start', weekStart).single()
      if (override && override[dayKey]) {
        setTodayHours(override[dayKey])
      } else if (schedDefaultRes.data && schedDefaultRes.data[dayKey]) {
        setTodayHours(schedDefaultRes.data[dayKey])
      } else {
        setTodayHours(null)
      }
    }

    // Weekly/monthly stats pulse
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); monday.setHours(0,0,0,0)
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const [weekProds, monthProds, weekTasks, monthTasks, weekVids, monthVids, yearProds] = await Promise.all([
      supabase.from('production_activity').select('id', { count: 'exact', head: true }).eq('action', 'marked_complete').gte('created_at', monday.toISOString()),
      supabase.from('production_activity').select('id', { count: 'exact', head: true }).eq('action', 'marked_complete').gte('created_at', monthStart.toISOString()),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'complete').gte('completed_at', monday.toISOString()),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'complete').gte('completed_at', monthStart.toISOString()),
      supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'Published').gte('date_published', monday.toISOString().split('T')[0]),
      supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'Published').gte('date_published', monthStart.toISOString().split('T')[0]),
      supabase.from('productions').select('id', { count: 'exact', head: true }).eq('status', 'Complete'),
    ])
    // Total deliverables and YouTube views
    const { data: delivData } = await supabase.from('productions').select('deliverables_count').not('deliverables_count', 'is', null).gt('deliverables_count', 0)
    const delivSum = (delivData || []).reduce((s: number, p: any) => s + (p.deliverables_count || 0), 0)
    const { data: ytData } = await supabase.from('videos').select('youtube_views').not('youtube_views', 'is', null)
    const viewsSum = (ytData || []).reduce((s: number, v: any) => s + (v.youtube_views || 0), 0)
    setWeekStats({ prodsCompleted: weekProds.count || 0, tasksCompleted: weekTasks.count || 0, videosPublished: weekVids.count || 0 })
    setMonthStats({ prodsCompleted: monthProds.count || 0, tasksCompleted: monthTasks.count || 0, videosPublished: monthVids.count || 0 })
    setYearProdCount(yearProds.count || 0)
    setTotalDeliverables(delivSum)
    setTotalYtViews(viewsSum)

    if (prodMembersRes.data && prodMembersRes.data.length > 0) {
      const ids = prodMembersRes.data.map((p: { production_id: string }) => p.production_id)
      const { data: prods } = await supabase.from('productions').select('*, checklist_items(completed)').in('id', ids).neq('status', 'Complete').order('start_datetime', { ascending: true, nullsFirst: false }).limit(8)
      setMyProductions(prods || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const getMorningBriefing = () => {
    const parts: string[] = []
    const today = new Date()
    const todayTasks = myTasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === today.toDateString())
    const overdueTasks = myTasks.filter(t => t.due_date && new Date(t.due_date) < today)
    if (todayProductions.length > 0) parts.push(`${todayProductions.length} production${todayProductions.length > 1 ? 's' : ''} happening today`)
    if (overdueTasks.length > 0) parts.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} need attention`)
    else if (todayTasks.length > 0) parts.push(`${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today`)
    if (parts.length === 0 && myTasks.length === 0) return "You're all caught up — no open tasks."
    if (parts.length === 0) return `You have ${myTasks.length} open task${myTasks.length > 1 ? 's' : ''}.`
    return parts.join(' · ') + '.'
  }

  const formatDate = (d: string | null): { label: string; color: string } | null => {
    if (!d) return null
    const date = new Date(d), today = new Date()
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: 'Overdue', color: '#ef4444' }
    if (diff === 0) return { label: 'Today', color: '#f59e0b' }
    if (diff === 1) return { label: 'Tomorrow', color: '#f59e0b' }
    if (diff <= 7) return { label: `${diff}d`, color: muted }
    return { label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: muted }
  }

  const getProgress = (prod: Production) => {
    const items = prod.checklist_items || []
    if (items.length === 0) return null
    const done = items.filter(i => i.completed).length
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
  }

  const overdueCount = myTasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length
  const urgentCount = myTasks.filter(t => t.priority === 'high' || t.priority === 'day of').length

  const completeTask = async (taskId: string) => {
    setCompleting(prev => new Set(prev).add(taskId))
    await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', taskId)
    setTimeout(() => {
      setMyTasks(prev => prev.filter(t => t.id !== taskId))
      setAllTasks(prev => prev.filter(t => t.id !== taskId))
      setCompleting(prev => { const n = new Set(prev); n.delete(taskId); return n })
    }, 400)
  }
  const nextDue = myTasks.find(t => t.due_date) || null
  const nextDueInfo = nextDue ? formatDate(nextDue.due_date) : null

  const statusBadge = (status: string) => {
    const s = status?.toLowerCase()
    const st = { 'in progress': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }, 'pending': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' }, 'complete': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' } }[s] || { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
    return <span style={{ fontSize: '14px', fontWeight: 500, padding: '4px 10px', borderRadius: '20px', background: st.bg, color: st.color, whiteSpace: 'nowrap' as const }}>{status}</span>
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  const QUICK_ACTIONS = [
    { href: '/dashboard/tasks', label: 'New task', desc: 'Create a task', color: '#3b82f6', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
    { href: '/dashboard/productions', label: 'Productions', desc: `${totalProductions} total`, color: '#f59e0b', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> },
    { href: '/dashboard/schedule', label: 'My schedule', desc: 'Set your hours', color: '#22c55e', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { href: '/dashboard/knowledge', label: 'Knowledge base', desc: 'Guides & docs', color: '#a78bfa', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> },
  ]

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: text, margin: '0 0 4px' }}>{greeting()}, {currentUser?.name?.split(' ')[0]}</h1>
        <p style={{ fontSize: '14px', color: muted, margin: '0 0 6px' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p style={{ fontSize: '14px', color: urgentCount > 0 || overdueCount > 0 ? '#f59e0b' : muted, margin: 0 }}>{getMorningBriefing()}</p>
      </div>

      {/* Your day at a glance */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '10px 16px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: '14px', color: todayHours ? text : muted, fontWeight: todayHours ? 500 : 400 }}>
            {todayHours || 'No hours set'}
          </span>
        </div>
        {myTasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px 16px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            <span style={{ fontSize: '14px', color: '#f59e0b', fontWeight: 500 }}>
              {myTasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).length} due today
            </span>
          </div>
        )}
        {overdueCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 16px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: 500 }}>{overdueCount} overdue</span>
          </div>
        )}
        {todayProductions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(30,108,181,0.08)', border: '1px solid rgba(30,108,181,0.2)', borderRadius: '10px', padding: '10px 16px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5ba3e0" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            <span style={{ fontSize: '14px', color: '#5ba3e0', fontWeight: 500 }}>{todayProductions.length} production{todayProductions.length > 1 ? 's' : ''} today</span>
          </div>
        )}
      </div>

      {/* Overdue productions */}
      {overdueProductions.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', margin: '0 0 10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>⚠ {overdueProductions.length} Overdue production{overdueProductions.length > 1 ? 's' : ''}</p>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
            {overdueProductions.map(p => (
              <Link key={p.id} href={`/dashboard/productions/${p.production_number}`} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: dark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)', borderRadius: '8px', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: text }}>#{p.production_number} {p.title}</span>
                </div>
                <span style={{ fontSize: '12px', color: '#ef4444', flexShrink: 0 }}>
                  {p.start_datetime ? new Date(p.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Today's productions — prominent + expandable */}
      {todayProductions.length > 0 && (
        <div style={{ background: 'rgba(30,108,181,0.08)', border: '1px solid rgba(30,108,181,0.2)', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#5ba3e0', margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>🎬 Today — {todayProductions.length} production{todayProductions.length > 1 ? 's' : ''}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
            {todayProductions.map(p => {
              const d = p.start_datetime ? new Date(p.start_datetime) : null
              const time = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
              const loc = getSchoolName(p.school_department) || p.filming_location || ''
              const members = (p.production_members || []).map(m => m.team).filter(Boolean)
              const isExpanded = expandedTodayProd === p.id
              const items = (p.checklist_items || []).sort((a, b) => (a as any).sort_order - (b as any).sort_order)
              const doneCount = items.filter(c => c.completed).length
              return (
                <div key={p.id} onClick={() => setExpandedTodayProd(isExpanded ? null : p.id)} style={{ padding: '14px 16px', borderRadius: '12px', background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${isExpanded ? 'rgba(30,108,181,0.4)' : border}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '4px', height: '44px', borderRadius: '2px', background: '#5ba3e0', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.title}</p>
                      <p style={{ fontSize: '13px', color: muted, margin: '3px 0 0' }}>
                        {time && <span style={{ fontWeight: 500, color: '#5ba3e0' }}>{time}</span>}
                        {time && loc ? ' · ' : ''}{loc}
                      </p>
                      <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>
                        {p.request_type_label || 'Production'}
                        {members.length > 0 && ` · ${members.map(m => m!.name.split(' ')[0]).join(', ')}`}
                        {items.length > 0 && ` · ${doneCount}/${items.length} steps`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                      {members.slice(0, 3).map((m, i) => m && (
                        <div key={i} style={{ width: '28px', height: '28px', borderRadius: '50%', background: m.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#0a0f1e' }}>{m.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
                      ))}
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
                      {items.length > 0 ? items.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${item.completed ? '#22c55e' : border}`, background: item.completed ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {item.completed && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                          <span style={{ fontSize: '13px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none' }}>{item.title}</span>
                        </div>
                      )) : <p style={{ fontSize: '13px', color: muted, margin: 0 }}>No checklist items</p>}
                      <Link href={`/dashboard/productions/${p.production_number}`} style={{ display: 'inline-block', fontSize: '12px', color: '#5ba3e0', textDecoration: 'none', marginTop: '10px', fontWeight: 500 }}>Open production →</Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats pulse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'This week', items: [`${weekStats.prodsCompleted} productions`, `${weekStats.tasksCompleted} tasks`, `${weekStats.videosPublished} videos`], color: '#5ba3e0' },
          { label: 'This month', items: [`${monthStats.prodsCompleted} productions`, `${monthStats.tasksCompleted} tasks`, `${monthStats.videosPublished} videos`], color: '#a855f7' },
          { label: 'Year pace', items: [`${yearProdCount} completed`, `${Math.round(yearProdCount / Math.max(1, new Date().getMonth() + 1) * 12)} projected/yr`], color: '#22c55e' },
          ...(totalDeliverables > 0 || totalYtViews > 0 ? [{ label: 'Video output', items: [`${totalDeliverables} deliverables`, ...(totalYtViews > 0 ? [`${totalYtViews.toLocaleString()} YT views`] : [])], color: '#ef4444' }] : []),
        ].map(s => (
          <div key={s.label} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px 16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: s.color, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{s.label}</p>
            {s.items.map((item, i) => <p key={i} style={{ fontSize: '13px', color: i === 0 ? text : muted, margin: '2px 0', fontWeight: i === 0 ? 600 : 400 }}>{item}</p>)}
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: '4px', background: dark ? '#1e2a3a' : '#e2e8f0', borderRadius: '12px', padding: '4px', width: 'fit-content', marginBottom: '20px' }}>
        {(['my', 'team'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ fontSize: '14px', padding: '8px 24px', borderRadius: '10px', border: 'none', background: view === v ? '#1e6cb5' : 'transparent', color: view === v ? '#fff' : muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: view === v ? 600 : 400, minHeight: '40px', transition: 'all 0.15s' }}>
            {v === 'my' ? 'My day' : 'Team view'}
          </button>
        ))}
      </div>

      {view === 'my' && (
        <div>
          {/* Metric cards */}
          <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Open tasks', value: String(myTasks.length), sub: 'assigned to you', hi: false, href: '/dashboard/tasks' },
              { label: 'Overdue', value: String(overdueCount), sub: overdueCount === 0 ? 'all on track ✓' : 'need attention', hi: overdueCount > 0, color: '#ef4444', href: '/dashboard/tasks' },
              { label: 'High priority', value: String(urgentCount), sub: urgentCount === 0 ? 'nothing urgent' : 'urgent tasks', hi: urgentCount > 0, color: '#f59e0b', href: '/dashboard/tasks' },
              { label: 'Next due', value: nextDueInfo?.label || '—', sub: nextDue?.title || 'no tasks due', hi: false, valueColor: nextDueInfo?.color, href: '/dashboard/tasks' },
              { label: 'My productions', value: String(myProductions.length), sub: 'you are assigned to', hi: false, href: '/dashboard/productions?scope=mine' },
            ].map(({ label, value, sub, hi, color, valueColor, href }) => (
              <Link key={label} href={href} style={{ textDecoration: 'none' }}>
              <div style={{ background: hi ? `${color}12` : metricBg, borderRadius: '16px', padding: '20px 24px', border: `1px solid ${hi ? `${color}35` : border}`, cursor: 'pointer', transition: 'transform 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'}
              >
                <p style={{ fontSize: '13px', fontWeight: 700, color: hi ? color : muted, margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>{label}</p>
                <p style={{ fontSize: '38px', fontWeight: 800, color: valueColor || (hi ? color : text), margin: '0 0 4px', lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: '15px', color: muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sub}</p>
              </div>
              </Link>
            ))}
          </div>

          {/* Quick actions */}
          <div className="quick-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {QUICK_ACTIONS.map(({ href, label, desc, color, icon }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', padding: '18px 20px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '16px', minHeight: '80px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = color; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${color}20` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = border; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: text, margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Tasks + Productions — full height */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>

            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: `1px solid ${border}` }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0 }}>My tasks</h2>
                <Link href="/dashboard/tasks" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
              </div>
              <div style={{ flex: 1 }}>
                {myTasks.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '15px', color: muted, margin: '0 0 10px' }}>No open tasks</p>
                    <Link href="/dashboard/tasks" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>Create a task →</Link>
                  </div>
                ) : myTasks.map((task, i) => {
                  const dateInfo = formatDate(task.due_date)
                  const isCompleting = completing.has(task.id)
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < myTasks.length - 1 ? `1px solid ${border}` : 'none', transition: 'all 0.3s', opacity: isCompleting ? 0.4 : 1, background: isCompleting ? 'rgba(34,197,94,0.06)' : 'transparent' }}
                      onMouseEnter={e => { if (!isCompleting) (e.currentTarget as HTMLDivElement).style.background = rowHover }}
                      onMouseLeave={e => { if (!isCompleting) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      <button onClick={() => !isCompleting && completeTask(task.id)} style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${isCompleting ? '#22c55e' : task.status === 'in progress' ? '#f59e0b' : border}`, flexShrink: 0, background: isCompleting ? '#22c55e' : task.status === 'in progress' ? 'rgba(245,158,11,0.12)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        {isCompleting && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                      <Link href="/dashboard/tasks" style={{ flex: 1, minWidth: 0, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{task.title}</p>
                          {task.productions && <p style={{ fontSize: '14px', color: muted, margin: '3px 0 0' }}>{task.productions.title}</p>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          {statusBadge(task.status)}
                          {dateInfo && <span style={{ fontSize: '13px', color: dateInfo.color, fontWeight: 700 }}>{dateInfo.label}</span>}
                        </div>
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: `1px solid ${border}` }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0 }}>My productions</h2>
                <Link href="/dashboard/productions" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
              </div>
              <div style={{ flex: 1 }}>
                {myProductions.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '15px', color: muted, margin: '0 0 10px' }}>No active productions</p>
                    <Link href="/dashboard/productions" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none' }}>Browse productions →</Link>
                  </div>
                ) : myProductions.map((prod, i) => {
                  const progress = getProgress(prod)
                  const typeLabel = prod.request_type_label || prod.type || 'Unknown'
                  return (
                    <Link key={prod.id} href={`/dashboard/productions/${prod.production_number}`} style={{ textDecoration: 'none', display: 'block', padding: '14px 20px', borderBottom: i < myProductions.length - 1 ? `1px solid ${border}` : 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = rowHover}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, paddingRight: '10px' }}>{prod.title}</p>
                        <span style={{ fontSize: '14px', color: muted, flexShrink: 0, fontWeight: 500 }}>{progress ? `${progress.pct}%` : '—'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, height: '5px', background: dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          {progress && <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: '3px' }} />}
                        </div>
                        <span style={{ fontSize: '14px', color: muted, flexShrink: 0, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{typeLabel}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'team' && (
        <div>
          <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Team members', value: String(teamMembers.length), sub: 'active', href: '/dashboard/settings' },
              { label: 'Open tasks', value: String(allTasks.length), sub: 'across team', href: '/dashboard/tasks' },
              { label: 'High priority', value: String(allTasks.filter(t => t.priority === 'high' || t.priority === 'day of').length), sub: 'team wide', href: '/dashboard/tasks' },
              { label: 'Total productions', value: String(totalProductions), sub: 'in system', href: '/dashboard/productions' },
            ].map(({ label, value, sub, href }) => (
              <Link key={label} href={href} style={{ textDecoration: 'none' }}>
              <div style={{ background: metricBg, borderRadius: '16px', padding: '20px 24px', border: `1px solid ${border}`, cursor: 'pointer', transition: 'transform 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'}
              >
                <p style={{ fontSize: '13px', fontWeight: 700, color: muted, margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>{label}</p>
                <p style={{ fontSize: '38px', fontWeight: 800, color: text, margin: '0 0 4px', lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: '15px', color: muted, margin: 0 }}>{sub}</p>
              </div>
              </Link>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px', borderBottom: `1px solid ${border}` }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0 }}>Team</h2>
              </div>
              {teamMembers.map((member, i) => (
                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < teamMembers.length - 1 ? `1px solid ${border}` : 'none' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>{member.name.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0 }}>{member.name}</p>
                    <p style={{ fontSize: '15px', color: muted, margin: 0, textTransform: 'capitalize' as const }}>{member.role}</p>
                  </div>
                  <span style={{ fontSize: '14px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>Active</span>
                </div>
              ))}
            </div>
            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: `1px solid ${border}` }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0 }}>All open tasks</h2>
                <Link href="/dashboard/tasks" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
              </div>
              {allTasks.map((task, i) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < allTasks.length - 1 ? `1px solid ${border}` : 'none' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${border}`, flexShrink: 0 }} />
                  <p style={{ fontSize: '14px', color: text, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{task.title}</p>
                  {statusBadge(task.status)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflow: 'hidden' as const }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${border}` }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0 }}>Recent activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p style={{ padding: '24px 20px', color: muted, fontSize: '14px', margin: 0, textAlign: 'center' as const }}>No recent activity — actions on productions will appear here</p>
          ) : recentActivity.map((a, i) => {
              const time = new Date(a.created_at)
              const diff = Date.now() - time.getTime()
              const mins = Math.floor(diff / 60000)
              const hrs = Math.floor(mins / 60)
              const days = Math.floor(hrs / 24)
              const ago = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : mins > 0 ? `${mins}m ago` : 'just now'
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 20px', borderBottom: i < recentActivity.length - 1 ? `1px solid ${border}` : 'none', fontSize: '13px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5ba3e0', marginTop: '6px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: text, fontWeight: 500 }}>{a.team?.name || 'System'}</span>
                    <span style={{ color: muted }}> {a.action}</span>
                    {a.detail && <span style={{ color: muted }}> — {a.detail}</span>}
                  </div>
                  <span style={{ color: muted, flexShrink: 0, fontSize: '12px' }}>{ago}</span>
                </div>
              )
            })}
          </div>
        </div>

      <style>{`
        @media (min-width: 640px) {
          .metric-grid { grid-template-columns: repeat(5, 1fr) !important; }
          .quick-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}