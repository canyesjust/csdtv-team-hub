import DashboardShell from './DashboardShell'

/** Dashboard is auth-gated and uses Supabase in the shell — skip static prerender without env. */
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
