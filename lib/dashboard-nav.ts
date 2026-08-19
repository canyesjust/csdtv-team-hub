export type DashboardNavItem = { label: string; href: string; icon: string }

export type DashboardNavSection = { section: string; items: DashboardNavItem[] }

const BOARD_MEETINGS: DashboardNavItem = {
  label: 'Board Meetings',
  href: '/dashboard/board-meetings',
  icon: 'board',
}

const WORK_BASE: DashboardNavItem[] = [
  { label: 'Productions', href: '/dashboard/productions', icon: 'video' },
  { label: 'Ideas', href: '/dashboard/ideas', icon: 'notes' },
  { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
  { label: 'Team hours', href: '/dashboard/schedule', icon: 'calendar' },
  { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
  { label: 'Video library', href: '/dashboard/videos', icon: 'film' },
]

// Live graphics runs outside the dashboard shell on purpose, so this link is
// the only way anyone finds it. Staff and Manager only, matching the gate on
// /gfx itself, so nobody clicks through to a 403.
const LIVE_GRAPHICS: DashboardNavItem = {
  label: 'Live graphics',
  href: '/gfx',
  icon: 'graphics',
}

const OBS_ASSETS: DashboardNavItem = {
  label: 'OBS assets',
  href: '/dashboard/obs-assets',
  icon: 'tv',
}

const MORE_BASE: DashboardNavItem[] = [
  { label: 'Contacts', href: '/dashboard/contacts', icon: 'contact' },
  { label: 'Onboarding', href: '/dashboard/onboarding', icon: 'star' },
  { label: 'Students', href: '/dashboard/students', icon: 'students' },
]

const SIGNAGE: DashboardNavItem = {
  label: 'Signage',
  href: '/dashboard/signage/overview',
  icon: 'tv',
}

const OFFICE_SIGNAGE: DashboardNavItem = {
  label: 'Office signage',
  href: '/dashboard/signage-submissions',
  icon: 'image',
}

const PARENTSQUARE: DashboardNavItem = {
  label: 'ParentSquare',
  href: '/dashboard/parentsquare',
  icon: 'mail',
}

const CALENDAR_OVERVIEW: DashboardNavItem = {
  label: 'Calendar',
  href: '/dashboard/calendar',
  icon: 'calview',
}

const CALENDAR_REVIEW: DashboardNavItem = {
  label: 'Review queue',
  href: '/dashboard/calendar/review',
  icon: 'check',
}

const CALENDAR_CONTENT: DashboardNavItem = {
  label: 'Content calendar',
  href: '/dashboard/calendar/content',
  icon: 'calendar',
}

const CALENDAR_CAPTURE: DashboardNavItem = {
  label: 'Capture planning',
  href: '/dashboard/calendar/capture',
  icon: 'notes',
}

const CALENDAR_FEEDS: DashboardNavItem = {
  label: 'Calendar feeds',
  href: '/dashboard/calendar/feeds',
  icon: 'link',
}

// Everyone can view the public brand library; managers go to the manage workspace.
const BRAND_LIBRARY_PUBLIC: DashboardNavItem = {
  label: 'Brand library',
  href: '/brand',
  icon: 'image',
}
const BRAND_LIBRARY_MANAGE: DashboardNavItem = {
  label: 'Brand library',
  href: '/dashboard/brand',
  icon: 'image',
}

export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'Manager'
}

/** Primary sidebar + mobile more menu for staff (Manager, Staff, Intern). */
export function buildStaffDashboardNav(
  role: string | null | undefined,
  parentsquareAccess?: boolean | null,
  calendarApprover?: boolean | null,
): {
  navItems: DashboardNavSection[]
  bottomNav: DashboardNavItem[]
  moreItems: DashboardNavItem[]
} {
  const manager = isManagerRole(role)
  const graphicsVisible = manager || role === 'Staff'
  const brandLibrary = manager ? BRAND_LIBRARY_MANAGE : BRAND_LIBRARY_PUBLIC
  // ParentSquare is an add-on grant — Managers always have it, others need the explicit flag.
  const parentSquareVisible = manager || !!parentsquareAccess
  // Calendar approver is an add-on grant — same pattern as ParentSquare.
  const calendarVisible = manager || !!calendarApprover
  // Overview, Content, and Capture are open to any staff member (matches RLS on
  // calendar_campaigns / calendar_capture_plans / calendar_school_events read access).
  // Review queue and Feeds are restricted to calendar approvers only.
  const calendarSectionItems: DashboardNavItem[] = [
    CALENDAR_OVERVIEW,
    ...(calendarVisible ? [CALENDAR_REVIEW] : []),
    CALENDAR_CONTENT,
    CALENDAR_CAPTURE,
    ...(calendarVisible ? [CALENDAR_FEEDS] : []),
  ]

  const workItems: DashboardNavItem[] = [
    ...WORK_BASE.slice(0, 2),
    ...(manager ? [BOARD_MEETINGS] : []),
    ...(graphicsVisible ? [LIVE_GRAPHICS] : []),
    ...WORK_BASE.slice(2),
  ]

  const resourcesItems: DashboardNavItem[] = [
    { label: 'Library', href: '/dashboard/library', icon: 'book' },
    brandLibrary,
    OBS_ASSETS,
    ...(manager ? [{ label: 'Reports', href: '/dashboard/reports', icon: 'chart' }] : []),
  ]

  const moreItems: DashboardNavItem[] = [
    ...(!manager ? [BOARD_MEETINGS] : []),
    ...(graphicsVisible ? [LIVE_GRAPHICS] : []),
    ...MORE_BASE,
    ...(manager ? [SIGNAGE, OFFICE_SIGNAGE] : []),
    ...(parentSquareVisible ? [PARENTSQUARE] : []),
    ...calendarSectionItems,
    brandLibrary,
    OBS_ASSETS,
    { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
    { label: 'Video library', href: '/dashboard/videos', icon: 'film' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ]

  /** Demoted links: mobile “More” sheet + desktop sidebar (no desktop More button). */
  const sidebarMoreItems: DashboardNavItem[] = [
    ...(!manager ? [BOARD_MEETINGS] : []),
    ...MORE_BASE,
    ...(manager ? [SIGNAGE, OFFICE_SIGNAGE] : []),
    ...(parentSquareVisible ? [PARENTSQUARE] : []),
  ]

  return {
    navItems: [
      { section: 'Main', items: [{ label: 'Home', href: '/dashboard', icon: 'home' }] },
      { section: 'Work', items: workItems },
      { section: 'Calendar', items: calendarSectionItems },
      { section: 'Resources', items: resourcesItems },
      { section: 'Team', items: sidebarMoreItems },
      { section: 'Account', items: [{ label: 'Settings', href: '/dashboard/settings', icon: 'settings' }] },
    ],
    bottomNav: [
      { label: 'Home', href: '/dashboard', icon: 'home' },
      { label: 'Prods', href: '/dashboard/productions', icon: 'video' },
      { label: 'Ideas', href: '/dashboard/ideas', icon: 'notes' },
      { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
      { label: 'Hours', href: '/dashboard/schedule', icon: 'calendar' },
      { label: 'More', href: '#more', icon: 'more' },
    ],
    moreItems,
  }
}

/** Reduced nav for student interns. */
export function buildStudentInternDashboardNav(): {
  navItems: DashboardNavSection[]
  bottomNav: DashboardNavItem[]
  moreItems: DashboardNavItem[]
} {
  return {
    navItems: [
      { section: 'Main', items: [{ label: 'Home', href: '/dashboard/student', icon: 'home' }] },
      {
        section: 'Work',
        items: [
          { label: 'Productions', href: '/dashboard/productions', icon: 'video' },
          { label: 'Ideas', href: '/dashboard/ideas', icon: 'notes' },
          { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
          { label: 'Team hours', href: '/dashboard/schedule', icon: 'calendar' },
          { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
          { label: 'Video library', href: '/dashboard/videos', icon: 'film' },
        ],
      },
      {
        section: 'Resources',
        items: [
          { label: 'Library', href: '/dashboard/library', icon: 'book' },
          BRAND_LIBRARY_PUBLIC,
          OBS_ASSETS,
        ],
      },
      {
        section: 'Team',
        items: [
          BOARD_MEETINGS,
          { label: 'Onboarding', href: '/dashboard/onboarding', icon: 'star' },
          { label: 'Contacts', href: '/dashboard/contacts', icon: 'contact' },
        ],
      },
      { section: 'Account', items: [{ label: 'Settings', href: '/dashboard/settings', icon: 'settings' }] },
    ],
    bottomNav: [
      { label: 'Home', href: '/dashboard/student', icon: 'home' },
      { label: 'Prods', href: '/dashboard/productions', icon: 'video' },
      { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
      { label: 'Hours', href: '/dashboard/schedule', icon: 'calendar' },
      { label: 'Videos', href: '/dashboard/videos', icon: 'film' },
      { label: 'More', href: '#more', icon: 'more' },
    ],
    moreItems: [
      BOARD_MEETINGS,
      { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
      { label: 'Equipment scan', href: '/dashboard/equipment/scan', icon: 'equipment' },
      { label: 'Library', href: '/dashboard/library', icon: 'book' },
      BRAND_LIBRARY_PUBLIC,
      { label: 'Onboarding', href: '/dashboard/onboarding', icon: 'star' },
      { label: 'Contacts', href: '/dashboard/contacts', icon: 'contact' },
      { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
    ],
  }
}

/** Reduced nav: dashboard home, tasks, and productions only. */
export function buildProductionFocusDashboardNav(): {
  navItems: DashboardNavSection[]
  bottomNav: DashboardNavItem[]
  moreItems: DashboardNavItem[]
} {
  const main: DashboardNavItem[] = [
    { label: 'Home', href: '/dashboard', icon: 'home' },
    { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
    { label: 'Productions', href: '/dashboard/productions', icon: 'video' },
  ]

  return {
    navItems: [
      { section: 'Main', items: main },
      { section: 'Resources', items: [BRAND_LIBRARY_PUBLIC] },
    ],
    bottomNav: [
      { label: 'Home', href: '/dashboard', icon: 'home' },
      { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
      { label: 'Prods', href: '/dashboard/productions', icon: 'video' },
    ],
    moreItems: [BRAND_LIBRARY_PUBLIC],
  }
}
