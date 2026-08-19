import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { timingSafeEqualStr } from '@/lib/server/security'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { broadcastGraphicsChange } from '@/lib/graphics/realtime'
import { runPanelCommand, isPanelAction, PANEL_ACTIONS } from '@/lib/graphics/panel'

export const dynamic = 'force-dynamic'

/**
 * Hardware panel control: Bitfocus Companion, a Stream Deck, a foot pedal
 * wired to an HTTP key.
 *
 * A panel cannot hold a browser session, so it carries the channel's control
 * token. That token is separate from the output token pasted into OBS, which
 * is read-only by design and must never be able to take a graphic.
 *
 *   POST /api/gfx/van-1/cmd
 *   Authorization: Bearer <control_token>
 *   { "action": "take_next" }
 *
 * GET is accepted with ?k= and ?a= for panels that can only fire a URL. It is
 * the same gate and the same limiter.
 */
async function handle(request: Request, slug: string, action: unknown, arg: unknown, token: string | null) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  // Limit before the token is even looked at, so guessing costs the same as
  // being right.
  const limit = await checkRateLimit(request, {
    scope: 'gfx_panel', max: 120, windowMs: 60_000, keySuffix: slug,
  })
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Slow down' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  const { data: channel } = await service
    .from('graphics_channels')
    .select('id, slug, name, control_token, panel_enabled')
    .eq('slug', slug)
    .maybeSingle()
  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!channel.panel_enabled) {
    return NextResponse.json({ error: 'Panel control is off for this rig' }, { status: 403 })
  }
  if (!timingSafeEqualStr(token, channel.control_token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isPanelAction(action)) {
    return NextResponse.json({ error: 'Unknown action', actions: PANEL_ACTIONS }, { status: 400 })
  }

  const result = await runPanelCommand(
    service, channel.id, action,
    typeof arg === 'string' ? arg.slice(0, 40) : arg === undefined || arg === null ? null : String(arg).slice(0, 40),
  )

  if (result.ok && action !== 'status') {
    try {
      await broadcastGraphicsChange(channel.slug)
    } catch {
      /* the polling ladder catches it */
    }
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const url = new URL(request.url)
  const token = bearer(request) || url.searchParams.get('k')
  return handle(request, channel, body.action ?? url.searchParams.get('a'), body.arg ?? url.searchParams.get('n'), token)
}

export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params
  const url = new URL(request.url)
  const token = bearer(request) || url.searchParams.get('k')
  return handle(request, channel, url.searchParams.get('a'), url.searchParams.get('n'), token)
}
