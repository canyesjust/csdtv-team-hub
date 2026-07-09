import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { renderSystemBlockHtml } from '@/lib/signage/build-screen-feed'

export const dynamic = 'force-dynamic'

// Renders a stock/system content block's live HTML for the dashboard preview.
export async function GET(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const id = (new URL(request.url).searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: row } = await service
    .from('signage_content')
    .select('system_kind, html_body, site_id')
    .eq('id', id)
    .maybeSingle()
  if (!row || !row.system_kind) {
    return NextResponse.json({ error: 'Not a stock block' }, { status: 404 })
  }

  const html = await renderSystemBlockHtml(service, {
    system_kind: row.system_kind as string | null,
    html_body: row.html_body as string | null,
    site_id: row.site_id as string | null,
  })
  if (!html) {
    return new NextResponse(
      '<!DOCTYPE html><html><body style="margin:0;background:#0b0e13;color:#8a99b5;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px">Nothing to show yet — this block has no current content (add a URL, or check that upcoming items exist).</body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
