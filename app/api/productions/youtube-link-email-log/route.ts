import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

/** Sets productions.youtube_link_email_sent_at (service role) so RLS cannot block the mail-client workflow. */
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productionId } = await request.json()
  if (!productionId || typeof productionId !== 'string') {
    return NextResponse.json({ error: 'Missing productionId' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const supabase = createClient(url, key)

  const sentAt = new Date().toISOString()
  const { error } = await supabase
    .from('productions')
    .update({ youtube_link_email_sent_at: sentAt })
    .eq('id', productionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, sentAt })
}
