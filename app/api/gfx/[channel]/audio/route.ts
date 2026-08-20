import { NextResponse } from 'next/server'
import { getChannelBySlug } from '@/lib/graphics/output-state'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { timingSafeEqualStr } from '@/lib/server/security'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { buildAudioState } from '@/lib/graphics/audio'
import { resolveGfxPollMs } from '@/lib/graphics/polling'

export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/

/** What the audio browser source should be playing on this channel. */
export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: slug } = await params
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const limit = await checkRateLimit(request, {
    scope: 'gfx_audio', max: 600, windowMs: 60_000, keySuffix: slug,
  })
  if (limit.limited) {
    return NextResponse.json({ error: 'Too many requests' }, {
      status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) },
    })
  }

  const channel = await getChannelBySlug(slug)
  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  if (!timingSafeEqualStr(url.searchParams.get('k'), channel.output_token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: show } = await service
    .from('graphics_shows')
    .select('id, state, updated_at')
    .eq('channel_id', channel.id)
    .in('state', ['rehearsal', 'live'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const playing = show ? await buildAudioState(service, show.id) : []
  const res = NextResponse.json({
    rev: Date.now(),
    playing,
    // Same ladder as the graphics output. Listening off means this page checks
    // back every two minutes instead of every second.
    poll_ms: resolveGfxPollMs({
      listening: channel.listening,
      hasShow: Boolean(show),
      live: show?.state === 'live',
      realtimeConnected: false,
    }),
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
