import { NextResponse } from 'next/server'
import { withMotionContext } from '@/lib/board-meetings/motion-route'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withMotionContext(production_id, async ({ service, productionId }) => {
    const bundle = await loadMotionScreenBundle(productionId, service)
    if (!bundle) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
    return NextResponse.json(bundle)
  })
}
