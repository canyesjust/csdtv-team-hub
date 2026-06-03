import { PRODUCTION_FOCUS_ROLE, isProductionFocusRole } from '@/lib/roles'

export type DashboardProfile = 'default' | 'production_focus'

export const PRODUCTION_FOCUS_TABS = [
  'checklist',
  'info',
  'team',
  'comments',
  'thumbnail',
  'studentcrew',
] as const

export type ProductionFocusTab = (typeof PRODUCTION_FOCUS_TABS)[number]

export function resolveDashboardProfile(
  role: string | null | undefined,
  dashboardProfile: string | null | undefined,
): DashboardProfile {
  if (isProductionFocusRole(role)) return 'production_focus'
  if (dashboardProfile === 'production_focus') return 'production_focus'
  return 'default'
}

export function hasProductionFocusDashboard(
  role: string | null | undefined,
  dashboardProfile?: string | null | undefined,
): boolean {
  return resolveDashboardProfile(role, dashboardProfile) === 'production_focus'
}

/** Routes allowed for productions-focus dashboard (prefix match). */
const PRODUCTION_FOCUS_PATH_PREFIXES = [
  '/dashboard',
  '/dashboard/tasks',
  '/dashboard/productions',
]

export function isDashboardPathAllowed(
  pathname: string,
  role: string | null | undefined,
  dashboardProfile?: string | null | undefined,
): boolean {
  if (!hasProductionFocusDashboard(role, dashboardProfile)) return true
  if (pathname === '/dashboard' || pathname === '/dashboard/') return true
  return PRODUCTION_FOCUS_PATH_PREFIXES.some(
    prefix => prefix !== '/dashboard' && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  )
}

export function isProductionFocusTab(tab: string): tab is ProductionFocusTab {
  return (PRODUCTION_FOCUS_TABS as readonly string[]).includes(tab)
}

export function isProductionTabVisible(
  tab: string,
  isBoardMeeting: boolean,
  role: string | null | undefined,
  dashboardProfile?: string | null | undefined,
): boolean {
  if (tab === 'boardmeeting' && !isBoardMeeting) return false
  if (!hasProductionFocusDashboard(role, dashboardProfile)) return true
  return isProductionFocusTab(tab)
}
