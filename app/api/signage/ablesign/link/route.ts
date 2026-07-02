import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { writeAbleSignLog } from '@/lib/signage/ablesign-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const body = await request.json().catch(() => ({}))
  const hubScreenId = body.hubScreenId as string | undefined
  const ablesignScreenId = Number(body.ablesignScreenId)

  if (!hubScreenId) {
    return NextResponse.json({ error: 'hubScreenId required' }, { status: 400 })
  }
  if (!Number.isFinite(ablesignScreenId) || ablesignScreenId <= 0) {
    return NextResponse.json({ error: 'ablesignScreenId required' }, { status: 400 })
  }

  // No two Hub screens may point at the same AbleSign screen — a duplicate link
  // breaks online-status tracking and cross-contaminates HTML pushes between the
  // two screens (this is what happened with West Front / Front Office).
  const { data: clash } = await service
    .from('signage_screens')
    .select('id, name')
    .eq('ablesign_screen_id', ablesignScreenId)
    .neq('id', hubScreenId)
    .maybeSingle()
  if (clash) {
    return NextResponse.json(
      { error: `AbleSign screen ${ablesignScreenId} is already linked to "${clash.name}". Unlink it there first.` },
      { status: 409 },
    )
  }

  const { data, error } = await service
    .from('signage_screens')
    .update({ ablesign_screen_id: ablesignScreenId })
    .eq('id', hubScreenId)
    .select('id, name, ablesign_screen_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await writeAbleSignLog(service, {
    screen_id: hubScreenId,
    action: 'link',
    status: 'ok',
    detail: `Linked to AbleSign screen ${ablesignScreenId}`,
  })

  return NextResponse.json({ screen: data })
}
