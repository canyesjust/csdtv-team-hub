'use client'

import AppLayout from './components/AppLayout'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
