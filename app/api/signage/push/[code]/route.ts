/**
 * Manual "Regenerate & Push" for one screen (admin button). Renders the screen's
 * self-contained HTML and pushes it to AbleSign as an HTML web app, bypassing the
 * content-hash skip (force) so staff always get an immediate, fresh push.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { renderAndPushScreen } from '@/lib/signage/push-screen'
import { buildScreenHtml } from '@/lib/signage/build-screen-html'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const { code } = await context.params
  const result = await renderAndPushScreen(service, code, { trigger: 'manual', force: true })

  if (!result.ok) {
    return NextResponse.json({ error: result.error, bytes: result.bytes ?? null }, { status: 502 })
  }
  return NextResponse.json(result)
}

/**
 * Preview the exact self-contained HTML that would be pushed for this screen,
 * without pushing it. `?download=1` saves the file so staff can inspect it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const { code } = await context.params
  const built = await buildScreenHtml(service, code)
  if ('error' in built) {
    return NextResponse.json({ error: built.error }, { status: built.error === 'not_found' ? 404 : 500 })
  }

  const download = new URL(request.url).searchParams.get('download') === '1'
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Html-Bytes': String(built.bytes),
  }
  if (download) {
    headers['Content-Disposition'] = `attachment; filename="signage-${code}.html"`
  }
  return new NextResponse(built.html, { status: 200, headers })
}
