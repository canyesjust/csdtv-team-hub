import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { generateYouTubeChapters } from '@/lib/board-meetings/chapter-generation'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, productionId }) => {
    try {
      const result = await generateYouTubeChapters(service, productionId)
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Chapter generation failed' },
        { status: 400 },
      )
    }
  })
}
