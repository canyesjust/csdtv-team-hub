import { NextRequest, NextResponse } from 'next/server'
import {
  assertCanAccessSignageSite,
  loadSignageRowSiteId,
  requireSignageEditorApi,
} from '@/lib/signage/server-auth'
import { resolveZoneConfig, isDefaultZoneConfig } from '@/lib/signage/zones'

export const dynamic = 'force-dynamic'

// Save a screen's layout-builder zone arrangement. Dedicated (not the general
// screens PATCH) so saving a layout can never clobber other screen fields.
export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const siteId = await loadSignageRowSiteId(auth.service, 'signage_screens', body.id)
  const siteCheck = await assertCanAccessSignageSite(auth.service, auth.user, siteId)
  if ('error' in siteCheck) return siteCheck.error

  // Validate through the shared resolver. Store NULL when the arrangement equals
  // the default, so a reset leaves no row-level override.
  let zone_config: unknown = null
  if (body.zone_config != null) {
    const resolved = resolveZoneConfig(body.zone_config)
    zone_config = isDefaultZoneConfig(resolved) ? null : resolved
  }

  const { error } = await auth.service
    .from('signage_screens')
    .update({ zone_config, ablesign_html_dirty_at: new Date().toISOString() })
    .eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, zone_config })
}
