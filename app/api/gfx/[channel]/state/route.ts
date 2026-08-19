import { NextResponse } from 'next/server'
import { timingSafeEqualStr } from '@/lib/server/security'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { buildChannelOutputState, getChannelBySlug } from '@/lib/graphics/output-state'

export const dynamic = 'force-dynamic'

/**
 * Read-only on-air state for one output channel.
 *
 * An OBS browser source cannot send an Authorization header, so this is the one
 * documented exception to the repo's no-tokens-in-query-strings rule. The token
 * is per channel, view-only, rotatable, and confers no ability to change
 * anything. The Authorization header is accepted and preferred for the dock.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel: slug } = await params

  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const limited = await checkRateLimit(request, {
    scope: 'gfx_state',
    max: 600,
    windowMs: 60_000,
    keySuffix: slug,
  })
  if (limited.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    )
  }

  const channel = await getChannelBySlug(slug)
  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const header = request.headers.get('authorization')
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  const queryToken = new URL(request.url).searchParams.get('k')
  const presented = bearer || queryToken

  if (!timingSafeEqualStr(presented, channel.output_token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const state = await buildChannelOutputState(channel.id)

  return NextResponse.json(
    { channel: { slug: channel.slug, name: channel.name, listening: channel.listening }, state },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
