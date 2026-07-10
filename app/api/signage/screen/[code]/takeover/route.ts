import { NextResponse } from 'next/server'
import { SIGNAGE_TAKEOVER_CACHE_HEADERS } from '@/lib/signage/public-api-cache'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { resolveScreenLive, resolveBoardTakeover } from '@/lib/signage/takeover'
import { youtubeEmbedUrlFromStreamUrl } from '@/lib/signage/stream-url'
import { signageAbsoluteHubUrl } from '@/lib/signage/constants'

export const dynamic = 'force-dynamic'

// Baked-HTML optimized takeover payload. The offline AbleSign document polls this
// endpoint best-effort; on any network error it keeps playing its baked content.
type Takeover =
  | { type: 'live'; mode: 'youtube' | 'hls'; src: string; label: string | null }
  | { type: 'board'; src: string; label: string | null }

// Public, read-only, cross-origin (the baked doc's origin is not the Hub).
const CORS = { 'Access-Control-Allow-Origin': '*' } as const

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500, headers: CORS })
  }

  const { data: screen, error: screenErr } = await service
    .from('signage_screens')
    .select('id, code, site_id, accepts_takeover, board_takeover_enabled, board_takeover_audio, area_id, building, active')
    .eq('code', code)
    .maybeSingle()

  if (screenErr || !screen || !screen.active) {
    return NextResponse.json({ error: 'Screen not found' }, { status: 404, headers: CORS })
  }

  const target = { id: screen.id, area_id: screen.area_id, building: screen.building }
  const siteId = (screen.site_id as string | null) ?? null

  const [liveRes, takeoverRes] = await Promise.all([
    siteId
      ? service.from('signage_live').select('*').eq('site_id', siteId).maybeSingle()
      : service.from('signage_live').select('*').eq('id', 1).maybeSingle(),
    service.from('signage_board_takeover').select('*').eq('id', 1).maybeSingle(),
  ])

  const live = resolveScreenLive(liveRes.data, screen, target)
  const board = resolveBoardTakeover(takeoverRes.data, screen)

  // Live wins over the board takeover (matches the React page).
  let takeover: Takeover | null = null
  if (live.live) {
    const embed = youtubeEmbedUrlFromStreamUrl(live.hls_url)
    takeover = embed
      ? { type: 'live', mode: 'youtube', src: embed, label: live.label }
      : { type: 'live', mode: 'hls', src: live.hls_url, label: live.label }
  } else if (board) {
    // board.url is Hub-relative (e.g. /board/3/stream); absolutize it because the
    // baked HTML plays from local storage on the stick, not from the Hub origin.
    takeover = { type: 'board', src: signageAbsoluteHubUrl(board.url), label: board.label }
  }

  return NextResponse.json(
    { takeover },
    { headers: { ...CORS, ...SIGNAGE_TAKEOVER_CACHE_HEADERS } },
  )
}
