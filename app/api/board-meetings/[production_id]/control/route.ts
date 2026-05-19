import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { loadControlBundle } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  const full = new URL(request.url).searchParams.get('full') === '1'
  return withControlContext(production_id, async ({ service, productionId }) => {
    const bundle = await loadControlBundle(service, productionId, { slim: !full })
    if (!bundle) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
    return NextResponse.json(bundle)
  })
}
