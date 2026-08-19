import { NextResponse } from 'next/server'
import { getStaffOrManagerUser } from '@/lib/server/auth'
import { loadShowBundle } from '@/lib/graphics/show-data'

export const dynamic = 'force-dynamic'

/**
 * The show as JSON.
 *
 * The control surface refreshes through this rather than through
 * router.refresh(). A full server re-render re-runs the page, re-serialises the
 * React tree and reconciles the whole screen, which on a keystroke cadence is
 * what made typing feel like wading. This is the same shape the board outputs
 * use: one small fetch, patch state, no re-render of anything that did not
 * change.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  const user = await getStaffOrManagerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bundle = await loadShowBundle(showId)
  if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(bundle, { headers: { 'cache-control': 'no-store' } })
}
