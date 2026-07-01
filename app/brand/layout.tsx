import type { ReactNode } from 'react'
import { hasBrandSiteAccess } from '@/lib/server/brand-access'
import BrandAccessGate from './BrandAccessGate'

// Server-side gate for the whole /brand library. Runs per request; if the visitor
// has not unlocked the site (and is not signed-in staff or on a review link), the
// password gate is shown instead of the page. Disabled automatically when no
// password is configured.
export const dynamic = 'force-dynamic'

export default async function BrandLayout({ children }: { children: ReactNode }) {
  if (await hasBrandSiteAccess()) return <>{children}</>
  return <BrandAccessGate />
}
