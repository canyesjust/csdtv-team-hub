import { NextResponse } from 'next/server'
import { getChannelBySlug } from '@/lib/graphics/output-state'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { timingSafeEqualStr } from '@/lib/server/security'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { resolveGfxPollMs } from '@/lib/graphics/polling'

export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/

/**
 * Prompter state for a channel. Same token as the graphics output: view only,
 * rotatable, and a bad token 404s rather than confirming the channel exists.
 */
export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: slug } = await params
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const limit = await checkRateLimit(request, {
    scope: 'gfx_prompter', max: 600, windowMs: 60_000, keySuffix: slug,
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
    .select('id, name, state, prompter_roll, prompter_speed, prompter_seek_n, prompter_seek_kind, prompter_seek_value, updated_at')
    .eq('channel_id', channel.id)
    .in('state', ['rehearsal', 'live'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const empty = {
    rev: 0, show_name: null, rehearsal: true, roll: false, speed: 1, rows: [] as unknown[],
    seek: { n: 0, kind: null, value: null },
    poll_ms: resolveGfxPollMs({ listening: channel.listening, hasShow: false, live: false, realtimeConnected: false }),
  }
  if (!show) {
    const res = NextResponse.json(empty)
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  const { data: rows } = await service
    .from('graphics_rows')
    .select('id, page, slug, script, ifb, started_at, ended_at, floated')
    .eq('show_id', show.id)
    .order('sort_order')

  const visible = (rows || []).filter(r => !r.floated && ((r.script || '').trim() || (r.ifb || '').trim()))
  const payload = {
    rev: Date.parse(show.updated_at || '') || Date.now(),
    show_name: show.name,
    rehearsal: show.state !== 'live',
    roll: Boolean((show as { prompter_roll?: boolean }).prompter_roll),
    speed: Number((show as { prompter_speed?: number }).prompter_speed ?? 1),
    seek: {
      n: Number((show as { prompter_seek_n?: number }).prompter_seek_n ?? 0),
      kind: (show as { prompter_seek_kind?: string | null }).prompter_seek_kind ?? null,
      value: (show as { prompter_seek_value?: string | null }).prompter_seek_value ?? null,
    },
    // Same ladder as the graphics output. A prompter page left open in an empty
    // trailer must not poll every four seconds for a fortnight.
    poll_ms: resolveGfxPollMs({
      listening: channel.listening,
      hasShow: true,
      live: show.state === 'live',
      realtimeConnected: false,
    }),
    rows: visible.map(r => ({
      id: r.id, page: r.page, slug: r.slug, script: r.script || '', ifb: r.ifb || '',
      on_air: Boolean(r.started_at && !r.ended_at),
    })),
  }

  const res = NextResponse.json(payload)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
