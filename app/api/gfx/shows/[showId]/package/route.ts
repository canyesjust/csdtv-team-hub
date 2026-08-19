import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'
import { saveShowAsPackage, applyPackageToShow, packageReadyCheck } from '@/lib/graphics/packages'

export const dynamic = 'force-dynamic'

/** What the rundown asks for that the loaded package does not carry. */
export async function GET(_request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const { data: show } = await ctx.service
      .from('graphics_shows').select('package_id').eq('id', ctx.showId).maybeSingle()
    const check = await packageReadyCheck(ctx.service, ctx.showId, show?.package_id ?? null)
    return NextResponse.json({ package_id: show?.package_id ?? null, templates: check })
  })
}

/**
 *   { action: 'save', name }        save this show's look as a new package
 *   { action: 'apply', package_id } recall one onto this show
 */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    if (body.action === 'save') {
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
      if (!name) return controlError('name required')
      const result = await saveShowAsPackage(ctx.service, ctx.showId, name)
      if (!result.ok) return controlError(result.error, 500)
      return NextResponse.json({ success: true, id: result.id })
    }

    if (body.action === 'apply') {
      const packageId = typeof body.package_id === 'string' ? body.package_id : null
      if (!packageId) return controlError('package_id required')
      const result = await applyPackageToShow(ctx.service, ctx.showId, packageId)
      if (!result.ok) return controlError(result.error, 404)
      return NextResponse.json({ success: true })
    }

    return controlError('Unknown action')
  })
}
