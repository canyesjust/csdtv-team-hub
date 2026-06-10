import { NextRequest, NextResponse } from 'next/server'
import { AbleSignApiError, registerScreen } from '@/lib/server/ablesign'
import {
  hubOrientationToAbleSign,
  syncHubScreenToAbleSign,
  writeAbleSignLog,
} from '@/lib/signage/ablesign-helpers'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const body = await request.json().catch(() => ({}))
  const hubScreenId = body.hubScreenId as string | undefined
  const registrationCode = String(body.registrationCode || '').trim()
  const orientationOverride = body.orientation as string | undefined

  if (!hubScreenId) {
    return NextResponse.json({ error: 'hubScreenId required' }, { status: 400 })
  }
  if (!/^[A-Za-z0-9]{6}$/.test(registrationCode)) {
    return NextResponse.json({ error: 'registrationCode must be 6 characters' }, { status: 400 })
  }

  const { data: screen, error: loadError } = await service
    .from('signage_screens')
    .select('id, code, name, orientation, ablesign_screen_id, ablesign_webapp_id')
    .eq('id', hubScreenId)
    .single()

  if (loadError || !screen) {
    return NextResponse.json({ error: loadError?.message || 'Screen not found' }, { status: 404 })
  }

  try {
    const registered = await registerScreen({
      registrationCode,
      title: screen.name,
      orientation: hubOrientationToAbleSign(orientationOverride || screen.orientation),
    })

    await service
      .from('signage_screens')
      .update({ ablesign_screen_id: registered.id })
      .eq('id', hubScreenId)

    const synced = await syncHubScreenToAbleSign(service, {
      ...screen,
      ablesign_screen_id: registered.id,
    })

    await writeAbleSignLog(service, {
      screen_id: hubScreenId,
      action: 'register',
      status: 'ok',
      detail: `Registered AbleSign screen ${registered.id}`,
    })

    return NextResponse.json({
      screen: {
        id: screen.id,
        ablesign_screen_id: registered.id,
        ablesign_webapp_id: synced.webappId,
      },
    })
  } catch (err) {
    const message = err instanceof AbleSignApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Registration failed'

    await writeAbleSignLog(service, {
      screen_id: hubScreenId,
      action: 'register',
      status: 'error',
      detail: message,
    })

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
