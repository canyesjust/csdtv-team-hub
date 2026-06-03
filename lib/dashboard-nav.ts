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

const MORE_BASE: DashboardNavItem[] = [
  { label: 'Contacts', href: '/dashboard/contacts', icon: 'contact' },
  { label: 'Onboarding', href: '/dashboard/onboarding', icon: 'star' },
  { label: 'Students', href: '/dashboard/students', icon: 'students' },
]

export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'Manager'
}

/** Primary sidebar + mobile more menu for staff (Manager, Staff, Intern). */
export function buildStaffDashboardNav(role: string | null | undefined): {
  navItems: DashboardNavSection[]
  bottomNav: DashboardNavItem[]
  moreItems: DashboardNavItem[]
} {
  const manager = isManagerRole(role)

  const workItems: DashboardNavItem[] = [
    ...WORK_BASE.slice(0, 2),
    ...(manager ? [BOARD_MEETINGS] : []),
    ...WORK_BASE.slice(2),
  ]

  const resourcesItems: DashboardNavItem[] = [
    { label: 'Library', href: '/dashboard/library', icon: 'book' },
    ...(manager ? [{ label: 'Reports', href: '/dashboard/reports', icon: 'chart' }] : []),
  ]

  const moreItems: DashboardNavItem[] = [
    ...(!manager ? [BOARD_MEETINGS] : []),
    ...MORE_BASE,
    { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
    { label: 'Video library', href: '/dashboard/videos', icon: 'film' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ]

  /** Demoted links: mobile “More” sheet + desktop sidebar (no desktop More button). */
  const sidebarMoreItems: DashboardNavItem[] = [
    ...(!manager ? [BOARD_MEETINGS] : []),
    ...MORE_BASE,
  ]

  return {
    navItems: [
      { section: 'Main', items: [{ label: 'Home', href: '/dashboard', icon: 'home' }] },
      { section: 'Work', items: workItems },
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
          { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
        ],
      },
      {
        section: 'Resources',
        items: [{ label: 'Library', href: '/dashboard/library', icon: 'book' }],
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
      { label: 'Equip', href: '/dashboard/equipment', icon: 'equipment' },
      { label: 'Library', href: '/dashboard/library', icon: 'book' },
      { label: 'More', href: '#more', icon: 'more' },
    ],
    moreItems: [
      BOARD_MEETINGS,
      { label: 'Equipment scan', href: '/dashboard/equipment/scan', icon: 'equipment' },
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
    navItems: [{ section: 'Main', items: main }],
    bottomNav: [
      { label: 'Home', href: '/dashboard', icon: 'home' },
      { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
      { label: 'Prods', href: '/dashboard/productions', icon: 'video' },
    ],
    moreItems: [],
  }
}
