import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { generateYouTubeChapters } from '@/lib/board-meetings/chapter-generation'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  const sp = new URL(request.url).searchParams
  const nudgeRaw = sp.get('nudge')
  const nudgeSeconds = nudgeRaw ? Number(nudgeRaw) : 0
  const welcomeRaw = sp.get('welcome')
  const welcomeOffsetSeconds = welcomeRaw != null && welcomeRaw !== '' && Number.isFinite(Number(welcomeRaw))
    ? Math.max(0, Number(welcomeRaw))
    : null
  return withControlContext(production_id, async ({ service, productionId }) => {
    try {
      const result = await generateYouTubeChapters(service, productionId, {
        nudgeSeconds: Number.isFinite(nudgeSeconds) ? nudgeSeconds : 0,
        welcomeOffsetSeconds,
      })
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Chapter generation failed' },
        { status: 400 },
      )
    }
  })
}
