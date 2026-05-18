import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabase, teamUserCanUpdateProduction } from '@/lib/server/production-access'

/** Sets productions.youtube_link_email_sent_at (service role) so RLS cannot block the mail-client workflow. */
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productionId } = await request.json()
  if (!productionId || typeof productionId !== 'string') {
    return NextResponse.json({ error: 'Missing productionId' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const allowed = await teamUserCanUpdateProduction(supabase, teamUser, productionId)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sentAt = new Date().toISOString()
  const { error } = await supabase
    .from('productions')
    .update({ youtube_link_email_sent_at: sentAt })
    .eq('id', productionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, sentAt })
}
