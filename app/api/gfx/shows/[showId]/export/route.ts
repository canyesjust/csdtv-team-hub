import { NextResponse } from 'next/server'
import { withGraphicsControl } from '@/lib/graphics/control'
import { buildChapters, buildSponsorReport } from '@/lib/graphics/as-run'

export const dynamic = 'force-dynamic'

/**
 * Everything that falls out of the as-run log for free.
 *   ?kind=chapters   YouTube chapters, paste straight into the description
 *   ?kind=sponsors   takes and on-screen seconds per sponsor
 */
export async function GET(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const kind = new URL(request.url).searchParams.get('kind') || 'chapters'

    if (kind === 'sponsors') {
      return NextResponse.json({ sponsors: await buildSponsorReport(ctx.service, ctx.showId) })
    }
    const chapters = await buildChapters(ctx.service, ctx.showId)
    return NextResponse.json({
      chapters,
      text: chapters.map(c => `${c.stamp} ${c.title}`).join('\n'),
    })
  })
}
