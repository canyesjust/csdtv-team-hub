import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { composeDigestForMember, type DigestTeamMember } from '@/lib/daily-staff-digest'
import { loadDailyDigestContext } from '@/lib/load-daily-digest-context'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/**
 * Sends the daily digest email immediately to the signed-in user only.
 */
export async function POST() {
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
  if (!String(me.email || '').trim()) {
    return NextResponse.json({ error: 'No email address on your profile' }, { status: 400 })
  }

  const loaded = await loadDailyDigestContext(supabase)
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 })
  }

  const member: DigestTeamMember = {
    id: me.id,
    name: me.name,
    email: String(me.email).trim(),
    role: me.role || '',
  }
  const { subject, body, html } = composeDigestForMember(member, loaded.ctx)

  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  const actionUrl =
    siteBase && siteBase.trim()
      ? `${siteBase.replace(/\/$/, '')}/dashboard`
      : '/dashboard'

  const sendRes = await fetch(`${url}/functions/v1/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      type: 'daily_staff_digest_manual',
      recipientEmail: member.email,
      recipientName: member.name.trim().split(/\s+/)[0] || 'there',
      subject,
      body,
      html,
      actionUrl,
      actionLabel: 'Open Team Hub',
    }),
  })

  if (!sendRes.ok) {
    const detail = await sendRes.text().catch(() => '')
    return NextResponse.json({ error: `Send failed: ${detail || sendRes.status}` }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    recipient: member.email,
    subject,
    timezone: loaded.ctx.tz,
    todayKey: loaded.ctx.todayKey,
  })
}
