/**
 * Public, no-login tools listed on /tools.
 * To add a tool, add an entry here. Keep `href` a public route (one that the
 * middleware matcher does not gate, e.g. /brand, /layout).
 */
export type PublicTool = {
  title: string
  description: string
  href: string
  accent: string
}

export const PUBLIC_TOOLS: PublicTool[] = [
  {
    title: 'School Brand Library',
    description: 'Browse every school and download official logos, plus copy brand color hex codes.',
    href: '/brand',
    accent: '#185fa5',
  },
  {
    title: 'Classroom Planner',
    description: 'Lay out a classroom, arrange desks and doors, and check ADA spacing. Export the plan as an image.',
    href: '/layout',
    accent: '#5C7762',
  },
]
