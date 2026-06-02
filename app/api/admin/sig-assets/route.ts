import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  SIG_ASSETS,
  SIG_ASSETS_UPDATED_KEY,
  SIG_ASSET_BY_ID,
  SIG_BUCKET,
  parseSigVersions,
  sigAbsoluteUrl,
  sigPublicPath,
  validateSigUpload,
  type SigAssetId,
} from '@/lib/sig-assets'

export const dynamic = 'force-dynamic'

function siteBaseFromRequest(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  return ''
}

async function loadVersions(service: NonNullable<ReturnType<typeof getServiceSupabaseClient>>) {
  const { data } = await service
    .from('app_settings')
    .select('value')
    .eq('key', SIG_ASSETS_UPDATED_KEY)
    .maybeSingle()
  return parseSigVersions(data?.value ?? null)
}

async function saveVersion(
  service: NonNullable<ReturnType<typeof getServiceSupabaseClient>>,
  filename: string,
  at: string,
) {
  const versions = await loadVersions(service)
  versions[filename] = at
  await service.from('app_settings').upsert({
    key: SIG_ASSETS_UPDATED_KEY,
    value: JSON.stringify(versions),
    updated_at: at,
  })
}

export async function GET(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const versions = await loadVersions(service)
  const siteBase = siteBaseFromRequest(request)

  const assets = SIG_ASSETS.map(def => {
    const version = versions[def.filename] ?? null
    return {
      id: def.id,
      label: def.label,
      hint: def.hint,
      filename: def.filename,
      publicPath: sigPublicPath(def.filename),
      previewUrl: version
        ? `${sigPublicPath(def.filename)}?v=${encodeURIComponent(version)}`
        : sigPublicPath(def.filename),
      absoluteUrl: siteBase ? sigAbsoluteUrl(siteBase, def.filename, version) : null,
      updatedAt: version,
      source: version ? ('storage' as const) : ('bundled' as const),
    }
  })

  return NextResponse.json({ assets, siteBase: siteBase || null })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const form = await request.formData()
  const assetId = String(form.get('asset_id') || '') as SigAssetId
  const def = SIG_ASSET_BY_ID.get(assetId)
  if (!def) return NextResponse.json({ error: 'Invalid asset_id' }, { status: 400 })

  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const validation = validateSigUpload(file, buf)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })

  const contentType = file.type || 'image/png'
  const { error: upErr } = await service.storage
    .from(SIG_BUCKET)
    .upload(def.filename, buf, { contentType, upsert: true })

  if (upErr) {
    const msg = upErr.message.includes('Bucket not found')
      ? 'Storage bucket sig-assets is missing. Run db/sig_assets_storage.sql on Supabase.'
      : upErr.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const updatedAt = new Date().toISOString()
  await saveVersion(service, def.filename, updatedAt)

  const siteBase = siteBaseFromRequest(request)
  return NextResponse.json({
    ok: true,
    asset: {
      id: def.id,
      filename: def.filename,
      updatedAt,
      publicPath: sigPublicPath(def.filename),
      previewUrl: `${sigPublicPath(def.filename)}?v=${encodeURIComponent(updatedAt)}`,
      absoluteUrl: siteBase ? sigAbsoluteUrl(siteBase, def.filename, updatedAt) : null,
      source: 'storage',
    },
  })
}
