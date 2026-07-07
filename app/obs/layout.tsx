import type { ReactNode } from 'react'
import { hasObsSiteAccess } from '@/lib/server/obs-access'
import ObsPasswordPrompt from './ObsPasswordPrompt'

// Server-side gate for the whole /obs area. Runs per request; if the visitor has not
// unlocked the site (and is not a signed-in team member), the password gate is shown
// instead of the page. Disabled automatically when no password is configured.
export const dynamic = 'force-dynamic'

export default async function ObsLayout({ children }: { children: ReactNode }) {
  if (await hasObsSiteAccess()) return <>{children}</>
  return <ObsPasswordPrompt />
}
