import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { composeDigestForMember, type DigestTeamMember } from '@/lib/daily-staff-digest'
import { loadDailyDigestContext } from '@/lib/load-daily-digest-context'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/**
 * Returns the daily digest email (subject + body) for the signed-in user — does not send mail.
 */
export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, key)

  const { data: me, error: meErr } = await supabase
    .from('team')
    .select('id, name, email, role')
    .eq('id', teamUser.id)
    .single()

  if (meErr || !me) {
    return NextResponse.json({ error: 'Team profile not found' }, { status: 404 })
  }

  const loaded = await loadDailyDigestContext(supabase)
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 })
  }

  const member: DigestTeamMember = {
    id: me.id,
    name: me.name,
    email: String(me.email || '').trim(),
    role: me.role || '',
  }

  const { subject, body, html } = composeDigestForMember(member, loaded.ctx)

  return NextResponse.json({
    subject,
    body,
    html,
    timezone: loaded.ctx.tz,
    todayKey: loaded.ctx.todayKey,
    longDateLabel: loaded.ctx.longDateLabel,
  })
}
