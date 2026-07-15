import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { canPublishTaskSignageIntake } from '@/lib/equipment-access'

export const dynamic = 'force-dynamic'

/**
 * Returns task signage URL with `k` query param for signed-in staff.
 * Uses server-only `SIGNAGE_TASKS_KEY` — no `NEXT_PUBLIC_*` duplicate needed.
 */
export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canPublishTaskSignageIntake(teamUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const key = process.env.SIGNAGE_TASKS_KEY
  const taskSignagePath = key
    ? `/signage/tasks?k=${encodeURIComponent(key)}`
    : '/signage/tasks'

  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const absoluteTaskSignageUrl =
    siteBase && siteBase.trim()
      ? `${siteBase.replace(/\/$/, '')}${taskSignagePath}`
      : ''

  // Broadcast board (/signage) token lives in app_settings (rotatable), not env.
  let boardSignagePath = '/signage'
  let boardKeyConfigured = false
  const service = getServiceSupabaseClient()
  if (service) {
    const { data } = await service.from('app_settings').select('value').eq('key', 'signage_board_token').maybeSingle()
    const boardToken = ((data?.value as string | undefined) || '').trim()
    if (boardToken) {
      boardSignagePath = `/signage?k=${encodeURIComponent(boardToken)}`
      boardKeyConfigured = true
    }
  }
  const absoluteBoardSignageUrl =
    siteBase && siteBase.trim()
      ? `${siteBase.replace(/\/$/, '')}${boardSignagePath}`
      : ''

  return NextResponse.json({
    taskSignagePath,
    absoluteTaskSignageUrl,
    keyConfigured: Boolean(key),
    boardSignagePath,
    absoluteBoardSignageUrl,
    boardKeyConfigured,
  })
}
