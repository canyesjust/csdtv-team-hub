import { NextRequest, NextResponse } from 'next/server'
import { assertCanAccessSignageSite, requireSignageEditorApi } from '@/lib/signage/server-auth'
import { renderAndPushScreen } from '@/lib/signage/push-screen'
import { buildScreenHtml } from '@/lib/signage/build-screen-html'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth

  const { code } = await context.params
  const { data: screen } = await service
    .from('signage_screens')
    .select('site_id')
    .eq('code', code)
    .maybeSingle()
  const siteCheck = await assertCanAccessSignageSite(service, user, screen?.site_id)
  if ('error' in siteCheck) return siteCheck.error

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
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth

  const { code } = await context.params
  const { data: screen } = await service
    .from('signage_screens')
    .select('site_id')
    .eq('code', code)
    .maybeSingle()
  const siteCheck = await assertCanAccessSignageSite(service, user, screen?.site_id)
  if ('error' in siteCheck) return siteCheck.error
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
