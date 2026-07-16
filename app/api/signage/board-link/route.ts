import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { signageAbsoluteHubUrl } from '@/lib/signage/constants'

export const dynamic = 'force-dynamic'

// The public /signage broadcast board is gated by a shared token stored in
// app_settings. This endpoint lets signage admins read the current board link
// and rotate the token (invalidating old links) — so the token never has to be
// copied out of the database by hand.
const KEY = 'signage_board_token'

function urlFor(token: string): string {
  return signageAbsoluteHubUrl(`/signage?k=${encodeURIComponent(token)}`)
}

export async function GET() {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { data } = await auth.service.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  const token = ((data?.value as string | undefined) || '').trim()
  return NextResponse.json({ token: token || null, url: token ? urlFor(token) : null })
}

export async function POST() {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const token = randomBytes(16).toString('hex')
  const { error } = await auth.service
    .from('app_settings')
    .upsert({ key: KEY, value: token, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token, url: urlFor(token) })
}
