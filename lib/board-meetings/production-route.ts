import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isStaffOrManagerRole, type TeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'

export type ProductionRouteContext<P extends { production_id: string }> = {
  service: SupabaseClient
  teamUser: TeamUser
  /** Resolved production UUID (validated as a board-meeting production). */
  productionId: string
  /** All awaited route params (e.g. item_id on nested routes). */
  routeParams: P
}

type ProductionRouteOptions = {
  /**
   * When true (default), the caller must be hub staff or a manager.
   * Set false for read-only routes that any authenticated team user may hit.
   */
  requireStaff?: boolean
}

/**
 * Shared preamble for /api/board-meetings/[production_id]/* routes:
 * authenticates the team user, enforces the staff/manager role, resolves the
 * service client, and validates that the production is a board meeting.
 *
 * Counterpart to withControlContext (control-route.ts), minus the
 * board-meeting-row lookup and output notification — agenda-level routes
 * differ in what (if anything) they need from board_meetings.
 */
export async function withBoardMeetingProduction<P extends { production_id: string }>(
  params: Promise<P>,
  handler: (ctx: ProductionRouteContext<P>) => Promise<NextResponse>,
  options: ProductionRouteOptions = {},
): Promise<NextResponse> {
  const requireStaff = options.requireStaff !== false

  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (requireStaff && !isStaffOrManagerRole(teamUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const routeParams = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, routeParams.production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  return handler({ service, teamUser, productionId: prodCheck.productionId, routeParams })
}
