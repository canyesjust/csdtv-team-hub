import { NextRequest, NextResponse } from 'next/server'
import { AbleSignApiError } from '@/lib/server/ablesign'
import { syncHubScreenToAbleSign, writeAbleSignLog } from '@/lib/signage/ablesign-helpers'
import { getSiteAbleSignCreds } from '@/lib/signage/ablesign-creds'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const { id } = await context.params
  const { data: screen, error: loadError } = await service
    .from('signage_screens')
    .select('id, code, name, orientation, ablesign_screen_id, ablesign_webapp_id, site_id')
    .eq('id', id)
    .single()

  if (loadError || !screen) {
    return NextResponse.json({ error: loadError?.message || 'Screen not found' }, { status: 404 })
  }

  if (!screen.ablesign_screen_id) {
    return NextResponse.json(
      { error: 'Link this screen to AbleSign before syncing' },
      { status: 400 },
    )
  }

  try {
    const creds = await getSiteAbleSignCreds(service, screen.site_id)
    const result = await syncHubScreenToAbleSign(service, screen, creds)
    await writeAbleSignLog(service, {
      screen_id: screen.id,
      action: 'sync',
      status: 'ok',
      detail: `Synced web app ${result.webappId}`,
    })
    return NextResponse.json({
      ok: true,
      screen: {
        id: screen.id,
        ablesign_webapp_id: result.webappId,
        ablesign_synced_at: new Date().toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof AbleSignApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Sync failed'

    await writeAbleSignLog(service, {
      screen_id: screen.id,
      action: 'sync',
      status: 'error',
      detail: message,
    })

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
