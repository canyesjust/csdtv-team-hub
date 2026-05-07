'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'
import Loader from './components/Loader'
import { ZoneHeader } from './components/ZoneHeader'
import { getSchoolName } from '@/lib/schools'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'
import { isStudentInternRole, STUDENT_INTERN_HOME_PATH } from '@/lib/roles'

interface Task {
  id: string; title: string; status: string; due_date: string | null; priority: string
  assigned_to?: string | null
  blocked_by?: string | null
  productions?: { title: string } | null
}

interface Production {
  id: string; production_number: number; title: string
  request_type_label: string | null; type: string | null; status: string | null
  start_datetime: string | null; filming_location: string | null; school_department: string | null
  checklist_items?: { id: string; title: string; completed: boolean }[]
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
}

interface QueueItem {
  id: string
  type: 'task' | 'production_risk'
  title: string
  subtitle: string
  reason: string
  href: string
  score: number
}

interface TeamMember { id: string; name: string; role: string; avatar_color: string }
interface CurrentUser { id: string; name: string; role: string }
interface Activity { id: string; action: string; detail: string | null; created_at: string; production_id: string; user_id?: string | null; team?: { name: string } | null }
interface ScheduleDay { monday: string; tuesday: string; wednesday: string; thursday: string; friday: string }
interface OverdueOwnerRow { assigned_to: string | null; due_date: string | null }
const SCHEDULE_DAY_SELECT = 'monday,tuesday,wednesday,thursday,friday'

const DAY_MS = 86400000

function dayDiffFromToday(input: string | Date | null): number | null {
  if (!input) return null
  const target = new Date(input)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

export default function DashboardPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myProductions, setMyProductions] = useState<Production[]>([])
  const [managerProductions, setManagerProductions] = useState<Production[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [totalProductions, setTotalProductions] = useState(0)
  const [todayProductions, setTodayProductions] = useState<Production[]>([])
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [todayHours, setTodayHours] = useState<string | null>(null)
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [ytEmailPendingCount, setYtEmailPendingCount] = useState(0)
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [weekStats, setWeekStats] = useState({ prodsCompleted: 0, tasksCompleted: 0, videosPublished: 0 })
  const [expandedTodayProd, setExpandedTodayProd] = useState<string | null>(null)
  const [monthStats, setMonthStats] = useState({ prodsCompleted: 0, tasksCompleted: 0, videosPublished: 0 })
  const [yearProdCount, setYearProdCount] = useState(0)
  const [totalVidsProduced, setTotalVidsProduced] = useState(0)
  const [totalYtViews, setTotalYtViews] = useState(0)
  const [dashboardUpdatedAt, setDashboardUpdatedAt] = useState<string | null>(null)
  const [clockTickMs, setClockTickMs] = useState(Date.now())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [crewSlotsTotal, setCrewSlotsTotal] = useState(0)
  const [crewSlotsFilled, setCrewSlotsFilled] = useState(0)
  const [managerRiskCounts, setManagerRiskCounts] = useState({ unassigned: 0, blocked: 0, overdue: 0 })
  const [overdueOwnerRows, setOverdueOwnerRows] = useState<OverdueOwnerRow[]>([])

  const text     = 'var(--text-primary)'
  const muted    = 'var(--text-muted)'
  const border   = 'var(--border-subtle)'
  const cardBg   = 'var(--surface-1)'
  const surface2 = 'var(--surface-2)'
  const rowHover = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'
  const warning = statusTone.warning.color
  const warningBg = statusTone.warning.background
  const danger = statusTone.danger.color
  const dangerBg = statusTone.danger.background
  const info = statusTone.info.color
  const infoBg = statusTone.info.background
  const review = statusTone.review.color
  const success = statusTone.success.color
  const successBg = statusTone.success.background

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setManagerOpen(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: user } = await supabase.from('team').select('id, name, role').eq('supabase_user_id', session.user.id).single()
      if (!user) return
      if (isStudentInternRole(user.role)) {
        router.replace(STUDENT_INTERN_HOME_PATH)
        return
      }
      setCurrentUser(user)

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

      const [tasksRes, prodMembersRes, teamRes, countRes, todayProdsRes, schedDefaultRes, activityRes] = await Promise.all([
        supabase.from('tasks').select('*, productions(title)').eq('assigned_to', user.id).neq('status', 'complete').order('due_date', { ascending: true, nullsFirst: false }).limit(20),
        supabase.from('production_members').select('production_id').eq('user_id', user.id),
        supabase.from('team').select('id, name, role, avatar_color').eq('active', true),
        supabase.from('productions').select('id', { count: 'exact', head: true }),
        supabase.from('productions').select('id, title, production_number, request_type_label, type, status, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(id, title, completed)').gte('start_datetime', todayStart.toISOString()).lte('start_datetime', todayEnd.toISOString()).order('start_datetime', { ascending: true }).limit(10),
        supabase.from('schedule_defaults').select(SCHEDULE_DAY_SELECT).eq('user_id', user.id).single(),
        supabase.from('production_activity').select('id, action, detail, created_at, production_id, user_id').order('created_at', { ascending: false }).limit(10),
      ])

      setMyTasks(tasksRes.data || [])
      setTeamMembers(teamRes.data || [])
      setTotalProductions(countRes.count || 0)
      setTodayProductions((todayProdsRes.data as any) || [])

      const activityRows = activityRes.error ? [] : (activityRes.data || [])
      const actUserIds = [...new Set(activityRows.map((a: { user_id: string | null }) => a.user_id).filter(Boolean))] as string[]
      let enrichedActivity: Activity[] = activityRows.map((a: Activity) => ({ ...a, team: null }))
      if (actUserIds.length > 0) {
        const { data: nameRows } = await supabase.from('team').select('id, name').in('id', actUserIds)
        const nameById = Object.fromEntries((nameRows || []).map((t: { id: string; name: string }) => [t.id, t.name]))
        enrichedActivity = activityRows.map((a: Activity & { user_id?: string | null }) => ({
          ...a,
          team: a.user_id && nameById[a.user_id] ? { name: nameById[a.user_id] } : null,
        }))
      }
      setRecentActivity(enrichedActivity)

      const { count: pendingCount, error: pendingErr } = await supabase
        .from('productions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Complete')
        .is('youtube_link_email_sent_at', null)
        .not('livestream_url', 'is', null)
        .neq('livestream_url', '')
      setYtEmailPendingCount(!pendingErr ? (pendingCount || 0) : 0)

      const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const
      const todayDayName = dayNames[new Date().getDay()]
      const isWeekday = todayDayName !== 'sunday' && todayDayName !== 'saturday'
      if (isWeekday) {
        const dayKey = todayDayName as keyof ScheduleDay
        const monday = new Date()
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
        const weekStart = monday.toISOString().split('T')[0]
        const { data: override } = await supabase
          .from('schedule_overrides')
          .select(SCHEDULE_DAY_SELECT)
          .eq('user_id', user.id)
          .eq('week_start', weekStart)
          .maybeSingle()
        if (override && override[dayKey]) {
          setTodayHours(override[dayKey])
        } else if (schedDefaultRes.data && schedDefaultRes.data[dayKey]) {
          setTodayHours(schedDefaultRes.data[dayKey])
        } else {
          setTodayHours(null)
        }
      }

      const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); monday.setHours(0,0,0,0)
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
      const [weekProds, monthProds, weekTasks, monthTasks, weekVids, monthVids, yearProds, delivAggRes, ytAggRes] = await Promise.all([
        supabase.from('production_activity').select('id', { count: 'exact', head: true }).eq('action', 'marked_complete').gte('created_at', monday.toISOString()),
        supabase.from('production_activity').select('id', { count: 'exact', head: true }).eq('action', 'marked_complete').gte('created_at', monthStart.toISOString()),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'complete').gte('completed_at', monday.toISOString()),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'complete').gte('completed_at', monthStart.toISOString()),
        supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'Published').gte('date_published', monday.toISOString().split('T')[0]),
        supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'Published').gte('date_published', monthStart.toISOString().split('T')[0]),
        supabase.from('productions').select('id', { count: 'exact', head: true }).eq('status', 'Complete'),
        supabase.from('productions').select('sum_deliverables:deliverables_count.sum()').gt('deliverables_count', 0).maybeSingle(),
        supabase.from('videos').select('sum_views:youtube_views.sum()').not('youtube_views', 'is', null).maybeSingle(),
      ])
      let delivSum = Number((delivAggRes.data as { sum_deliverables?: number | null } | null)?.sum_deliverables || 0)
      let viewsSum = Number((ytAggRes.data as { sum_views?: number | null } | null)?.sum_views || 0)
      if (!Number.isFinite(delivSum) || !Number.isFinite(viewsSum)) {
        const [delivRes, ytRes] = await Promise.all([
          supabase.from('productions').select('deliverables_count').not('deliverables_count', 'is', null).gt('deliverables_count', 0),
          supabase.from('videos').select('youtube_views').not('youtube_views', 'is', null),
        ])
        delivSum = (delivRes.data || []).reduce((s: number, p: { deliverables_count?: number | null }) => s + (p.deliverables_count || 0), 0)
        viewsSum = (ytRes.data || []).reduce((s: number, v: { youtube_views?: number | null }) => s + (v.youtube_views || 0), 0)
      }
      setWeekStats({ prodsCompleted: weekProds.count || 0, tasksCompleted: weekTasks.count || 0, videosPublished: weekVids.count || 0 })
      setMonthStats({ prodsCompleted: monthProds.count || 0, tasksCompleted: monthTasks.count || 0, videosPublished: monthVids.count || 0 })
      setYearProdCount(yearProds.count || 0)
      setTotalVidsProduced(delivSum)
      setTotalYtViews(viewsSum)

      if (prodMembersRes.data && prodMembersRes.data.length > 0) {
        const ids = prodMembersRes.data.map((p: { production_id: string }) => p.production_id)
        const { data: prods } = await supabase
          .from('productions')
          .select('id, title, production_number, request_type_label, type, status, start_datetime, filming_location, school_department, checklist_items(id, title, completed)')
          .in('id', ids)
          .neq('status', 'Complete')
          .order('start_datetime', { ascending: true, nullsFirst: false })
          .limit(8)
        setMyProductions(prods || [])
      } else {
        setMyProductions([])
      }
      if ((user.role || '').toLowerCase() === 'manager') {
        const { data: allManagerProds } = await supabase
          .from('productions')
          .select('id, title, production_number, request_type_label, type, status, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(id, title, completed)')
          .not('status', 'in', '("Complete","Abandoned")')
          .order('start_datetime', { ascending: true, nullsFirst: false })
          .limit(200)
        const managerProds = (allManagerProds as any) || []
        setManagerProductions(managerProds)

        const soonProdIds = managerProds
          .filter((p: Production) => {
            const days = dayDiffFromToday(p.start_datetime)
            return days !== null && days >= 0 && days <= 7
          })
          .map((p: Production) => p.id)

        const todayIso = new Date().toISOString().split('T')[0]
        const [unassignedRes, blockedRes, overdueRes, overdueOwnerRes] = await Promise.all([
          supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'complete').is('assigned_to', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'complete').not('blocked_by', 'is', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'complete').lt('due_date', todayIso),
          supabase.from('tasks').select('assigned_to,due_date').neq('status', 'complete').not('assigned_to', 'is', null).lt('due_date', todayIso).limit(3000),
        ])
        setManagerRiskCounts({
          unassigned: unassignedRes.count || 0,
          blocked: blockedRes.count || 0,
          overdue: overdueRes.count || 0,
        })
        setOverdueOwnerRows((overdueOwnerRes.data as OverdueOwnerRow[]) || [])

        if (soonProdIds.length > 0) {
          const { data: crewRows, error: crewErr } = await supabase
            .from('production_crew')
            .select('id')
            .in('production_id', soonProdIds)
          const crewIds = (crewRows || []).map(c => c.id)
          if (crewErr || crewIds.length === 0) {
            setCrewSlotsTotal(0)
            setCrewSlotsFilled(0)
          } else {
            const { data: slotRows, error: slotErr } = await supabase
              .from('crew_role_slots')
              .select('id, capacity')
              .in('production_crew_id', crewIds)
            if (slotErr) {
              setCrewSlotsTotal(0)
              setCrewSlotsFilled(0)
            } else {
              const slots = slotRows || []
              const totalSpots = slots.reduce((s, r) => s + (Number((r as { capacity?: number }).capacity) || 0), 0)
              const slotIds = slots.map(s => (s as { id: string }).id)
              let filled = 0
              const CHUNK = 120
              for (let i = 0; i < slotIds.length; i += CHUNK) {
                const chunk = slotIds.slice(i, i + CHUNK)
                const { count } = await supabase
                  .from('crew_signups')
                  .select('id', { count: 'exact', head: true })
                  .in('crew_role_slot_id', chunk)
                filled += count || 0
              }
              setCrewSlotsTotal(totalSpots)
              setCrewSlotsFilled(filled)
            }
          }
        } else {
          setCrewSlotsTotal(0)
          setCrewSlotsFilled(0)
        }
      } else {
        setManagerProductions([])
        setCrewSlotsTotal(0)
        setCrewSlotsFilled(0)
        setManagerRiskCounts({ unassigned: 0, blocked: 0, overdue: 0 })
        setOverdueOwnerRows([])
      }
      setDashboardUpdatedAt(new Date().toISOString())
    } catch (err) {
      console.error('Failed to load dashboard', err)
      setLoadError('Failed to load dashboard data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    const timer = setInterval(() => setClockTickMs(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const getMorningBriefing = () => {
    const parts: string[] = []
    const todayTasks = myTasks.filter(t => dayDiffFromToday(t.due_date) === 0)
    const overdueTasks = myTasks.filter(t => {
      const d = dayDiffFromToday(t.due_date)
      return d !== null && d < 0
    })
    if (todayProductions.length > 0) parts.push(`${todayProductions.length} production${todayProductions.length > 1 ? 's' : ''} happening today`)
    if (overdueTasks.length > 0) parts.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} need attention`)
    else if (todayTasks.length > 0) parts.push(`${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today`)
    if (parts.length === 0 && myTasks.length === 0) return "You're all caught up — no open tasks."
    if (parts.length === 0) return `You have ${myTasks.length} open task${myTasks.length > 1 ? 's' : ''}.`
    return parts.join(' · ') + '.'
  }

  const formatDate = (d: string | null): { label: string; color: string } | null => {
    if (!d) return null
    const date = new Date(d)
    const diff = dayDiffFromToday(d)
    if (diff === null) return null
    if (diff < 0) return { label: 'Overdue', color: danger }
    if (diff === 0) return { label: 'Today', color: warning }
    if (diff === 1) return { label: 'Tomorrow', color: warning }
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
  const dueSoonCount = myTasks.filter(t => {
    if (!t.due_date) return false
    const days = dayDiffFromToday(t.due_date)
    return days !== null && days >= 0 && days <= 2
  }).length
  const blockedCount = myTasks.filter(t => Boolean(t.blocked_by)).length
  const atRiskProductions = myProductions.filter(prod => {
    const progress = getProgress(prod)
    const startsSoon = (() => {
      const days = dayDiffFromToday(prod.start_datetime)
      return days !== null && days >= 0 && days <= 2
    })()
    const checklistMissing = !progress || progress.total === 0
    const lowProgress = !!progress && progress.pct < 60
    return startsSoon && (checklistMissing || lowProgress)
  }).slice(0, 4)
  const isManager = (currentUser?.role || '').toLowerCase() === 'manager'
  const startsSoonManager = managerProductions.filter(p => {
    const days = dayDiffFromToday(p.start_datetime)
    return days !== null && days >= 0 && days <= 2
  })
  const unstaffedProductions = startsSoonManager.filter(p => (p.production_members || []).length === 0)
  const understaffedProductions = startsSoonManager.filter(p => {
    const members = p.production_members || []
    return members.length > 0 && members.length < 2
  })
  const missingProdMetadata = managerProductions.filter(p => !p.start_datetime || !(p.filming_location || p.school_department))
  const crewFillPct = crewSlotsTotal > 0 ? Math.round((crewSlotsFilled / crewSlotsTotal) * 100) : 0

  const queueItems: QueueItem[] = [
    ...myTasks.map(task => {
      const dueDays = dayDiffFromToday(task.due_date)
      const overdue = dueDays !== null && dueDays < 0
      const due48h = dueDays !== null && dueDays >= 0 && dueDays <= 2
      const score =
        (overdue ? 40 : 0) +
        (due48h ? 25 : 0) +
        (task.blocked_by ? 30 : 0) +
        ((task.priority === 'high' || task.priority === 'day of') ? 20 : 0) +
        (!task.assigned_to ? 10 : 0)
      return {
        id: task.id,
        type: 'task' as const,
        title: task.title,
        subtitle: task.productions?.title || 'Task',
        reason: [overdue ? 'Overdue' : null, task.blocked_by ? 'Blocked' : null, due48h ? 'Due soon' : null].filter(Boolean).join(' + ') || 'Open task',
        href: '/dashboard/tasks',
        score,
      }
    }),
    ...atRiskProductions.map(prod => {
      const progress = getProgress(prod)
      const dueDays = dayDiffFromToday(prod.start_datetime) ?? 999
      const score =
        (dueDays >= 0 && dueDays <= 2 ? 35 : 0) +
        ((!progress || progress.pct < 60) ? 20 : 0) +
        (((prod.production_members || []).length === 0) ? 10 : 0)
      return {
        id: prod.id,
        type: 'production_risk' as const,
        title: `#${prod.production_number} ${prod.title}`,
        subtitle: 'Production risk',
        reason: dueDays < 0 ? 'Past due' : dueDays === 0 ? 'Starts today' : `Starts in ${dueDays}d`,
        href: `/dashboard/productions/${prod.production_number}`,
        score,
      }
    }),
  ].sort((a, b) => b.score - a.score).slice(0, 8)

  const overdueByOwner = teamMembers
    .map(member => {
      const mine = overdueOwnerRows.filter(t => t.assigned_to === member.id)
      if (mine.length === 0) return null
      const now = Date.now()
      const aging = mine.reduce((acc, t) => {
        if (!t.due_date) return acc
        const days = Math.max(1, Math.ceil((now - new Date(t.due_date).getTime()) / DAY_MS))
        if (days <= 2) acc.a += 1
        else if (days <= 7) acc.b += 1
        else acc.c += 1
        return acc
      }, { a: 0, b: 0, c: 0 })
      return { member, total: mine.length, aging }
    })
    .filter(Boolean)
    .sort((a, b) => (b!.total - a!.total))
    .slice(0, 6) as { member: TeamMember; total: number; aging: { a: number; b: number; c: number } }[]

  const completeTask = async (taskId: string) => {
    setCompleting(prev => new Set(prev).add(taskId))
    await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', taskId)
    setTimeout(() => {
      setMyTasks(prev => prev.filter(t => t.id !== taskId))
      setCompleting(prev => { const n = new Set(prev); n.delete(taskId); return n })
    }, 400)
  }
  const nextDue = myTasks.find(t => t.due_date) || null
  const nextDueInfo = nextDue ? formatDate(nextDue.due_date) : null
  const lastUpdatedLabel = dashboardUpdatedAt
    ? `${Math.max(0, Math.floor((clockTickMs - new Date(dashboardUpdatedAt).getTime()) / 60000))}m ago`
    : 'just now'

  const taskStatusBadge = (status: string) => {
    const s = status?.toLowerCase()
    const st = { 'in progress': { bg: warningBg, color: warning }, 'pending': { bg: 'var(--surface-2)', color: muted }, 'complete': { bg: successBg, color: success } }[s] || { bg: 'var(--surface-2)', color: muted }
    return <span style={{ fontSize: '12px', fontWeight: 500, padding: '3px 9px', borderRadius: '20px', background: st.bg, color: st.color, whiteSpace: 'nowrap' as const }}>{status}</span>
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  const QUICK_ACTIONS = [
    { href: '/dashboard/tasks', label: 'New task', desc: 'Create a task', color: 'var(--brand-primary)', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
    { href: '/dashboard/productions', label: 'Productions', desc: `${totalProductions} total`, color: warning, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> },
    { href: '/dashboard/schedule', label: 'My schedule', desc: 'Set your hours', color: success, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { href: '/dashboard/knowledge', label: 'Knowledge base', desc: 'Guides & docs', color: review, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> },
  ]

  return (
    <div style={{ maxWidth: '1760px', margin: '0 auto' }}>
      {/* ============== HEADER ============== */}
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{greeting()}, {currentUser?.name?.split(' ')[0]}</h1>
        <p style={{ fontSize: '14px', color: muted, margin: '0 0 6px' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p style={{ fontSize: '14px', color: urgentCount > 0 || overdueCount > 0 ? warning : muted, margin: 0 }}>{getMorningBriefing()}</p>
        {loadError && <p style={{ margin: '8px 0 0', fontSize: '13px', color: danger }}>{loadError}</p>}
      </header>

      {/* Glance chips */}
      <div className="dashboard-glance-row" style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 13px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: '13px', color: todayHours ? text : muted, fontWeight: todayHours ? 500 : 400 }}>
            {todayHours || 'No hours set'}
          </span>
        </div>
        {myTasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: warningBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={warning} strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            <span style={{ fontSize: '13px', color: warning, fontWeight: 500 }}>
              {myTasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()).length} due today
            </span>
          </div>
        )}
        {overdueCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: dangerBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={danger} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: '13px', color: danger, fontWeight: 500 }}>{overdueCount} overdue</span>
          </div>
        )}
        {todayProductions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: infoBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={info} strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            <span style={{ fontSize: '13px', color: info, fontWeight: 500 }}>{todayProductions.length} production{todayProductions.length > 1 ? 's' : ''} today</span>
          </div>
        )}
      </div>

      {/* ============== ZONE: TODAY ============== */}
      {todayProductions.length > 0 && (
        <section style={uiStyles.zoneSection}>
          <ZoneHeader
            label="Today"
            hint={`${todayProductions.length} production${todayProductions.length > 1 ? 's' : ''} on the schedule`}
            accent={info}
          />
          <div className="today-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '12px' }}>
            {todayProductions.map(p => {
              const d = p.start_datetime ? new Date(p.start_datetime) : null
              const time = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
              const loc = getSchoolName(p.filming_location) || getSchoolName(p.school_department) || p.filming_location || ''
              const members = (p.production_members || []).map(m => m.team).filter(Boolean)
              const isExpanded = expandedTodayProd === p.id
              const items = (p.checklist_items || []).sort((a, b) => (a as any).sort_order - (b as any).sort_order)
              const doneCount = items.filter(c => c.completed).length
              return (
                <div key={p.id} onClick={() => setExpandedTodayProd(isExpanded ? null : p.id)} style={{ padding: '14px 16px', borderRadius: '14px', background: cardBg, border: `1px solid ${isExpanded ? 'var(--border-strong)' : border}`, cursor: 'pointer', boxShadow: 'var(--shadow-soft)', transition: 'border-color var(--motion-fast) var(--ease-standard)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '4px', height: '44px', borderRadius: '2px', background: info, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.title}</p>
                      <p style={{ fontSize: '13px', color: muted, margin: '3px 0 0' }}>
                        {time && <span style={{ fontWeight: 500, color: info }}>{time}</span>}
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
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
                      {items.length > 0 ? items.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${item.completed ? success : border}`, background: item.completed ? success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {item.completed && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                          <span style={{ fontSize: '13px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none' }}>{item.title}</span>
                        </div>
                      )) : <p style={{ fontSize: '13px', color: muted, margin: 0 }}>No checklist items</p>}
                      <Link href={`/dashboard/productions/${p.production_number}`} style={{ ...uiStyles.actionLink, display: 'inline-block', fontSize: '12px', marginTop: '10px', fontWeight: 500 }}>Open production →</Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ============== ZONE: OPERATE ============== */}
      <section style={uiStyles.zoneSection}>
        <ZoneHeader
          label="Operate"
          hint={`Updated ${lastUpdatedLabel}`}
          action={<Link href="/dashboard/tasks" style={{ ...uiStyles.actionLink, fontSize: '12px' }}>Open task center →</Link>}
        />

        {/* Personal metric strip — 4 metrics */}
        <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: 'Open tasks', value: String(myTasks.length), sub: 'assigned to you', hi: false, color: info, href: '/dashboard/tasks' },
            { label: 'Overdue', value: String(overdueCount), sub: overdueCount === 0 ? 'all on track' : 'need attention', hi: overdueCount > 0, color: danger, href: '/dashboard/tasks' },
            { label: 'High priority', value: String(urgentCount), sub: urgentCount === 0 ? 'nothing urgent' : 'urgent now', hi: urgentCount > 0, color: warning, href: '/dashboard/tasks' },
            { label: 'Next due', value: nextDueInfo?.label || '—', sub: nextDue?.title || 'no tasks due', hi: false, color: muted, valueColor: nextDueInfo?.color, href: '/dashboard/tasks' },
          ].map(({ label, value, sub, hi, color, valueColor, href }) => (
            <Link key={label} href={href} style={{ textDecoration: 'none' }}>
              <div style={{ ...uiStyles.metricCard, padding: '16px 18px', background: hi ? `${color}10` : surface2, border: `1px solid ${hi ? `${color}40` : border}` }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'}
              >
                <p style={{ fontSize: '11px', fontWeight: 700, color: hi ? color : muted, margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>{label}</p>
                <p style={{ fontSize: '32px', fontWeight: 800, color: valueColor || (hi ? color : text), margin: '0 0 4px', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</p>
                <p style={{ fontSize: '13px', color: muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Focus queue — single source of truth */}
        <div style={{ ...uiStyles.card, marginBottom: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: text, margin: 0 }}>Focus queue</h2>
              <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>Ranked by operational risk</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '11px', color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{overdueCount + blockedCount} at risk · {dueSoonCount} due 48h</span>
              <Link href="/dashboard/tasks" style={uiStyles.panelLink}>Open task center →</Link>
            </div>
          </div>
          <div>
            {queueItems.length === 0 ? (
              <p style={{ padding: '24px 20px', fontSize: '14px', color: muted, margin: 0, textAlign: 'center' as const }}>Nothing in your queue right now.</p>
            ) : queueItems.map((item, i) => (
              <Link key={`${item.type}-${item.id}`} href={item.href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 18px', borderBottom: i < queueItems.length - 1 ? `1px solid ${border}` : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = rowHover}
                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '14px', color: text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.subtitle}</p>
                </div>
                <span style={{ ...statusBadge(item.type === 'task' ? 'warning' : 'review', true), fontSize: '11px', flexShrink: 0 }}>{item.reason}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* My tasks + My productions */}
        <div className="operate-panels" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div style={{ ...uiStyles.card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: text, margin: 0 }}>My tasks</h2>
              <Link href="/dashboard/tasks" style={uiStyles.panelLink}>View all →</Link>
            </div>
            <div style={{ flex: 1 }}>
              {myTasks.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center' as const }}>
                  <p style={{ fontSize: '14px', color: muted, margin: '0 0 8px' }}>No open tasks</p>
                  <Link href="/dashboard/tasks" style={uiStyles.panelLink}>Create a task →</Link>
                </div>
              ) : myTasks.slice(0, 8).map((task, i, arr) => {
                const dateInfo = formatDate(task.due_date)
                const isCompleting = completing.has(task.id)
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none', transition: 'all 0.3s', opacity: isCompleting ? 0.4 : 1, background: isCompleting ? successBg : 'transparent' }}
                    onMouseEnter={e => { if (!isCompleting) (e.currentTarget as HTMLDivElement).style.background = rowHover }}
                    onMouseLeave={e => { if (!isCompleting) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <button onClick={() => !isCompleting && completeTask(task.id)} style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${isCompleting ? success : task.status === 'in progress' ? warning : border}`, flexShrink: 0, background: isCompleting ? success : task.status === 'in progress' ? warningBg : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      {isCompleting && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    <Link href="/dashboard/tasks" style={{ flex: 1, minWidth: 0, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{task.title}</p>
                        {task.productions && <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{task.productions.title}</p>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                        {taskStatusBadge(task.status)}
                        {dateInfo && <span style={{ fontSize: '12px', color: dateInfo.color, fontWeight: 700 }}>{dateInfo.label}</span>}
                      </div>
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...uiStyles.card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: text, margin: 0 }}>My productions</h2>
              <Link href="/dashboard/productions" style={uiStyles.panelLink}>View all →</Link>
            </div>
            <div style={{ flex: 1 }}>
              {myProductions.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center' as const }}>
                  <p style={{ fontSize: '14px', color: muted, margin: '0 0 8px' }}>No active productions</p>
                  <Link href="/dashboard/productions" style={uiStyles.panelLink}>Browse productions →</Link>
                </div>
              ) : myProductions.slice(0, 8).map((prod, i, arr) => {
                const progress = getProgress(prod)
                const typeLabel = prod.request_type_label || prod.type || 'Unknown'
                return (
                  <Link key={prod.id} href={`/dashboard/productions/${prod.production_number}`} style={{ textDecoration: 'none', display: 'block', padding: '12px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = rowHover}
                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, paddingRight: '10px' }}>{prod.title}</p>
                      <span style={{ fontSize: '13px', color: muted, flexShrink: 0, fontWeight: 500 }}>{progress ? `${progress.pct}%` : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '4px', background: surface2, borderRadius: '3px', overflow: 'hidden' }}>
                        {progress && <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? success : 'var(--brand-primary)', borderRadius: '3px' }} />}
                      </div>
                      <span style={{ fontSize: '12px', color: muted, flexShrink: 0, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{typeLabel}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        {/* Quick actions — compact strip */}
        <div className="quick-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {QUICK_ACTIONS.map(({ href, label, desc, color, icon }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{ background: surface2, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '64px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = color; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = border; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: text, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============== ZONE: MANAGER OPS ============== */}
      {isManager && (
        <section style={uiStyles.zoneSection}>
          <ZoneHeader
            label="Manager ops"
            hint="Exceptions and intervention queues"
            accent={review}
            action={
              <button
                onClick={() => setManagerOpen(v => !v)}
                aria-expanded={managerOpen}
                aria-controls="manager-ops-content"
                style={{ background: 'transparent', border: 'none', color: muted, fontSize: '12px', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {managerOpen ? 'Collapse' : 'Expand'}
              </button>
            }
          />
          {managerOpen && (
            <div id="manager-ops-content">
              {/* 4 KPIs only */}
              <div className="manager-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '14px' }}>
                {[
                  { label: 'Unstaffed', value: String(unstaffedProductions.length), sub: 'starts within 48h', tone: 'danger' as const },
                  { label: 'Understaffed', value: String(understaffedProductions.length), sub: 'need added coverage', tone: 'warning' as const },
                  { label: 'Crew fill', value: `${crewFillPct}%`, sub: `${crewSlotsFilled}/${crewSlotsTotal} spots filled`, tone: crewFillPct < 70 ? 'danger' as const : crewFillPct < 90 ? 'warning' as const : 'success' as const },
                  { label: 'Unassigned tasks', value: String(managerRiskCounts.unassigned), sub: 'owner missing', tone: 'review' as const },
                ].map(kpi => (
                  <div key={kpi.label} style={{ ...uiStyles.cardSoft, padding: '14px 16px' }}>
                    <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.8px', textTransform: 'uppercase' as const, color: statusTone[kpi.tone].color, fontWeight: 700 }}>{kpi.label}</p>
                    <p style={{ margin: '6px 0 0', fontSize: '28px', color: text, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>{kpi.value}</p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: muted }}>{kpi.sub}</p>
                  </div>
                ))}
              </div>

              <div className="manager-panels" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '12px' }}>
                <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', color: text, fontWeight: 700 }}>Ownership risks</h3>
                    <span style={{ fontSize: '11px', color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{managerRiskCounts.overdue} overdue · {managerRiskCounts.blocked} blocked</span>
                  </div>
                  <div>
                    {overdueByOwner.length === 0 ? (
                      <p style={{ padding: '20px 16px', margin: 0, fontSize: '13px', color: muted, textAlign: 'center' as const }}>No overdue tasks across team.</p>
                    ) : overdueByOwner.map((row, i) => (
                      <div key={row.member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < overdueByOwner.length - 1 ? `1px solid ${border}` : 'none' }}>
                        <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>{row.member.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: muted }}>{row.total}</span>
                          <span style={{ fontSize: '11px', color: muted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{row.aging.a}/{row.aging.b}/{row.aging.c}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', color: text, fontWeight: 700 }}>Coverage risks</h3>
                    <span style={{ fontSize: '11px', color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{missingProdMetadata.length} data gaps</span>
                  </div>
                  <div>
                    {[...unstaffedProductions, ...understaffedProductions].slice(0, 6).map((prod, i, arr) => (
                      <Link key={prod.id} href={`/dashboard/productions/${prod.production_number}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = rowHover}
                        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'}
                      >
                        <span style={{ fontSize: '13px', color: text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, minWidth: 0, paddingRight: '10px' }}>#{prod.production_number} {prod.title}</span>
                        <span style={{ ...statusBadge((prod.production_members || []).length === 0 ? 'danger' : 'warning', true), fontSize: '10px', flexShrink: 0 }}>
                          {(prod.production_members || []).length === 0 ? 'Unstaffed' : 'Understaffed'}
                        </span>
                      </Link>
                    ))}
                    {unstaffedProductions.length + understaffedProductions.length === 0 && (
                      <p style={{ padding: '20px 16px', margin: 0, fontSize: '13px', color: muted, textAlign: 'center' as const }}>No staffing exceptions in next 48h.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============== ZONE: INSIGHTS ============== */}
      <section style={{ ...uiStyles.zoneSection, marginBottom: '16px' }}>
        <ZoneHeader
          label="Insights"
          hint="Pulse and recent activity"
          action={
            <button
              onClick={() => setInsightsOpen(v => !v)}
              aria-expanded={insightsOpen}
              aria-controls="insights-content"
              style={{ background: 'transparent', border: 'none', color: muted, fontSize: '12px', cursor: 'pointer', fontWeight: 600, padding: 0 }}
            >
              {insightsOpen ? 'Collapse' : 'Expand'}
            </button>
          }
        />
        {insightsOpen && (
          <div id="insights-content">
            <div className="stats-pulse" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {[
                { label: 'This week', items: [`${weekStats.prodsCompleted} productions`, `${weekStats.tasksCompleted} tasks`, `${weekStats.videosPublished} videos`], color: info },
                { label: 'This month', items: [`${monthStats.prodsCompleted} productions`, `${monthStats.tasksCompleted} tasks`, `${monthStats.videosPublished} videos`], color: review },
                { label: 'Year pace', items: [`${yearProdCount} completed`, `${Math.round(yearProdCount / Math.max(1, new Date().getMonth() + 1) * 12)} projected/yr`], color: success },
                ...(totalVidsProduced > 0 || totalYtViews > 0 ? [{ label: 'Output', items: [`${totalVidsProduced} videos produced`, ...(totalYtViews > 0 ? [`${totalYtViews.toLocaleString()} YT views`] : [])], color: danger }] : []),
              ].map(s => (
                <div key={s.label} style={{ ...uiStyles.cardSoft, padding: '12px 14px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: s.color, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>{s.label}</p>
                  {s.items.map((item, i) => <p key={i} style={{ fontSize: '13px', color: i === 0 ? text : muted, margin: '2px 0', fontWeight: i === 0 ? 600 : 400 }}>{item}</p>)}
                </div>
              ))}
            </div>

            {ytEmailPendingCount > 0 && (
              <div style={{ ...uiStyles.card, padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const }}>
                <div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: text }}>YouTube link emails</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: muted }}>
                    {ytEmailPendingCount} completed production{ytEmailPendingCount !== 1 ? 's' : ''} have a synced livestream/video link but no logged send yet.
                  </p>
                </div>
                <Link href="/dashboard/productions?ytPending=1" style={{ fontSize: '13px', fontWeight: 600, color: info, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                  View list →
                </Link>
              </div>
            )}

            <div style={{ ...uiStyles.card, overflow: 'hidden' as const }}>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${border}` }}>
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: text, margin: 0 }}>Recent activity</h2>
              </div>
              {recentActivity.length === 0 ? (
                <p style={{ padding: '20px', color: muted, fontSize: '13px', margin: 0, textAlign: 'center' as const }}>No recent activity</p>
              ) : recentActivity.map((a, i) => {
                  const time = new Date(a.created_at)
                  const diff = Date.now() - time.getTime()
                  const mins = Math.floor(diff / 60000)
                  const hrs = Math.floor(mins / 60)
                  const days = Math.floor(hrs / 24)
                  const ago = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : mins > 0 ? `${mins}m ago` : 'just now'
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 18px', borderBottom: i < recentActivity.length - 1 ? `1px solid ${border}` : 'none', fontSize: '13px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: info, marginTop: '6px', flexShrink: 0 }} />
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
        )}
      </section>

      <style>{`
        .dashboard-glance-row > div { min-height: 38px; }
        @media (min-width: 640px) {
          .metric-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .quick-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .manager-kpis { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .dashboard-glance-row { gap: 6px !important; margin-bottom: 18px !important; }
          .today-grid { gap: 10px !important; }
          .operate-panels, .manager-panels { gap: 12px !important; }
        }
      `}</style>
    </div>
  )
}
