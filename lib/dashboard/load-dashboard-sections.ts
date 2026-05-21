import type { SupabaseClient } from '@supabase/supabase-js'
import { dayDiffFromToday } from '@/lib/dashboard/day-diff'
import { SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES } from '@/lib/productions/status-filters'

export interface DashboardProduction {
  id: string
  title: string
  production_number: number
  request_type_label: string | null
  type: string | null
  status: string | null
  school_year?: string | null
  start_datetime: string | null
  filming_location: string | null
  school_department: string | null
  checklist_items?: { id: string; title: string; completed: boolean }[]
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
}

export interface DashboardActivity {
  id: string
  action: string
  detail: string | null
  created_at: string
  production_id: string
  user_id?: string | null
  team?: { name: string } | null
}

export interface OverdueOwnerRow {
  assigned_to: string | null
  due_date: string | null
}

export interface ManagerOpsData {
  managerProductions: DashboardProduction[]
  managerRiskCounts: { unassigned: number; blocked: number; overdue: number }
  overdueOwnerRows: OverdueOwnerRow[]
  crewSlotsTotal: number
  crewSlotsFilled: number
  ytEmailPendingCount: number
  ytMissingLinkCount: number
}

export interface InsightsData {
  recentActivity: DashboardActivity[]
  weekStats: { prodsCompleted: number; tasksCompleted: number; videosPublished: number }
  monthStats: { prodsCompleted: number; tasksCompleted: number; videosPublished: number }
  yearProdCount: number
  totalVidsProduced: number
  totalYtViews: number
}

export async function loadManagerOpsData(
  supabase: SupabaseClient,
): Promise<ManagerOpsData> {
  const { data: allManagerProds } = await supabase
    .from('productions')
    .select(
      'id, title, production_number, request_type_label, type, status, school_year, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(id, title, completed)',
    )
    .not('status', 'in', SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES)
    .order('start_datetime', { ascending: true, nullsFirst: false })
    .limit(200)

  const managerProds = (allManagerProds as unknown as DashboardProduction[]) || []

  const soonProdIds = managerProds
    .filter((p) => {
      const days = dayDiffFromToday(p.start_datetime)
      return days !== null && days >= 0 && days <= 7
    })
    .map((p) => p.id)

  const todayIso = new Date().toISOString().split('T')[0]
  const [unassignedRes, blockedRes, overdueRes, overdueOwnerRes, ytRes] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'complete').is('assigned_to', null),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'complete').not('blocked_by', 'is', null),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'complete').lt('due_date', todayIso),
    supabase.from('tasks').select('assigned_to,due_date').neq('status', 'complete').not('assigned_to', 'is', null).lt('due_date', todayIso).limit(3000),
    supabase
      .from('productions')
      .select('id, request_type_label, type, status, livestream_url, youtube_link_email_sent_at')
      .neq('status', 'Abandoned'),
  ])

  let crewSlotsTotal = 0
  let crewSlotsFilled = 0
  if (soonProdIds.length > 0) {
    const { data: crewRows, error: crewErr } = await supabase
      .from('production_crew')
      .select('id')
      .in('production_id', soonProdIds)
    const crewIds = (crewRows || []).map((c) => c.id)
    if (!crewErr && crewIds.length > 0) {
      const { data: slotRows, error: slotErr } = await supabase
        .from('crew_role_slots')
        .select('id, capacity')
        .in('production_crew_id', crewIds)
      if (!slotErr) {
        const slots = slotRows || []
        crewSlotsTotal = slots.reduce((s, r) => s + (Number((r as { capacity?: number }).capacity) || 0), 0)
        const slotIds = slots.map((s) => (s as { id: string }).id)
        const CHUNK = 120
        for (let i = 0; i < slotIds.length; i += CHUNK) {
          const chunk = slotIds.slice(i, i + CHUNK)
          const { count } = await supabase
            .from('crew_signups')
            .select('id', { count: 'exact', head: true })
            .in('crew_role_slot_id', chunk)
          crewSlotsFilled += count || 0
        }
      }
    }
  }

  let ytEmailPendingCount = 0
  let ytMissingLinkCount = 0
  if (!ytRes.error) {
    const relevant = (ytRes.data || []).filter((p: { request_type_label?: string | null; type?: string | null }) => {
      const t = `${p.request_type_label || ''} ${p.type || ''}`.toLowerCase()
      return t.includes('livestream') || t.includes('live stream') || t.includes('board')
    })
    const allowedStatus = (status: string | null | undefined): boolean => {
      const s = (status || '').toLowerCase()
      return s.includes('approved') || s.includes('in progress')
    }
    const activeRelevant = relevant.filter((p: { status?: string | null }) => allowedStatus(p.status))
    ytEmailPendingCount = activeRelevant.filter(
      (p: { livestream_url?: string | null; youtube_link_email_sent_at?: string | null }) =>
        !!(p.livestream_url || '').trim() && !p.youtube_link_email_sent_at,
    ).length
    ytMissingLinkCount = activeRelevant.filter(
      (p: { livestream_url?: string | null }) => !(p.livestream_url || '').trim(),
    ).length
  }

  return {
    managerProductions: managerProds,
    managerRiskCounts: {
      unassigned: unassignedRes.count || 0,
      blocked: blockedRes.count || 0,
      overdue: overdueRes.count || 0,
    },
    overdueOwnerRows: (overdueOwnerRes.data as OverdueOwnerRow[]) || [],
    crewSlotsTotal,
    crewSlotsFilled,
    ytEmailPendingCount,
    ytMissingLinkCount,
  }
}

export async function loadInsightsData(supabase: SupabaseClient): Promise<InsightsData> {
  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [activityRes, weekProds, monthProds, weekTasks, monthTasks, weekVids, monthVids, yearProds, delivAggRes, ytAggRes] =
    await Promise.all([
      supabase.from('production_activity').select('id, action, detail, created_at, production_id, user_id').order('created_at', { ascending: false }).limit(10),
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

  const activityRows = activityRes.error ? [] : activityRes.data || []
  const actUserIds = [...new Set(activityRows.map((a: { user_id: string | null }) => a.user_id).filter(Boolean))] as string[]
  let enrichedActivity: DashboardActivity[] = activityRows.map((a: DashboardActivity) => ({ ...a, team: null }))
  if (actUserIds.length > 0) {
    const { data: nameRows } = await supabase.from('team').select('id, name').in('id', actUserIds)
    const nameById = Object.fromEntries((nameRows || []).map((t: { id: string; name: string }) => [t.id, t.name]))
    enrichedActivity = activityRows.map((a: DashboardActivity & { user_id?: string | null }) => ({
      ...a,
      team: a.user_id && nameById[a.user_id] ? { name: nameById[a.user_id] } : null,
    }))
  }

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

  return {
    recentActivity: enrichedActivity,
    weekStats: {
      prodsCompleted: weekProds.count || 0,
      tasksCompleted: weekTasks.count || 0,
      videosPublished: weekVids.count || 0,
    },
    monthStats: {
      prodsCompleted: monthProds.count || 0,
      tasksCompleted: monthTasks.count || 0,
      videosPublished: monthVids.count || 0,
    },
    yearProdCount: yearProds.count || 0,
    totalVidsProduced: delivSum,
    totalYtViews: viewsSum,
  }
}
