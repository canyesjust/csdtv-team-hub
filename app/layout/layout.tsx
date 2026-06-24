import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Classroom Planner',
  description: 'Top-down classroom layout & spacing planner — desks, arrangements, ADA spacing.',
}

export default function ClassroomPlannerSegmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
