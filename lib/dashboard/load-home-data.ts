import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchWeekProductions } from '@/lib/dashboard/week-productions'
import { loadManagerOpsData, type ManagerOpsData } from '@/lib/dashboard/load-dashboard-sections'
import type { DashboardProduction } from '@/lib/dashboard/load-dashboard-sections'

export interface DashboardHomeTeamMember {
  id: string
  name: string
  role: string
  avatar_color: string
}

export interface DashboardHomeData {
  weekProductions: DashboardProduction[]
  teamMembers: DashboardHomeTeamMember[]
  managerOps: ManagerOpsData | null
}

export async function loadDashboardHomeData(
  supabase: SupabaseClient,
  options: { includeManagerOps: boolean },
): Promise<DashboardHomeData> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(todayStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  weekEnd.setHours(23, 59, 59, 999)

  const teamPromise = supabase
    .from('team')
    .select('id, name, role, avatar_color')
    .eq('active', true)

  const [teamRes, weekProductions, managerOps] = await Promise.all([
    teamPromise,
    fetchWeekProductions(supabase, todayStart, weekEnd),
    options.includeManagerOps ? loadManagerOpsData(supabase) : Promise.resolve(null),
  ])

  if (teamRes.error) throw teamRes.error

  return {
    weekProductions,
    teamMembers: (teamRes.data || []) as DashboardHomeTeamMember[],
    managerOps,
  }
}
