import { readFile } from 'fs/promises'
import path from 'path'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadSigVersions } from '@/lib/server/sig-versions'
import {
  SIG_ASSET_FILENAMES,
  SIG_BUCKET,
  contentTypeForSigFile,
  sigEtag,
} from '@/lib/sig-assets'

export const dynamic = 'force-dynamic'

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
} as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  if (!SIG_ASSET_FILENAMES.has(filename)) {
    return new Response('Not found', { status: 404 })
  }

  const service = getServiceSupabaseClient()
  const versions = service ? await loadSigVersions(service) : {}
  const version = versions[filename] ?? null
  const etag = sigEtag(filename, version)
  const ifNoneMatch = request.headers.get('if-none-match')

  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ...CACHE_HEADERS, ETag: etag } })
  }

  if (service) {
    const { data, error } = await service.storage.from(SIG_BUCKET).download(filename)
    if (data && !error) {
      const buf = Buffer.from(await data.arrayBuffer())
      return new Response(buf, {
        headers: {
          ...CACHE_HEADERS,
          ETag: etag,
          'Content-Type': contentTypeForSigFile(filename),
        },
      })
    }
  }

  try {
    const filePath = path.join(process.cwd(), 'assets', 'sig-defaults', filename)
    const buf = await readFile(filePath)
    const bundledEtag = sigEtag(filename, null)
    if (ifNoneMatch === bundledEtag) {
      return new Response(null, { status: 304, headers: { ...CACHE_HEADERS, ETag: bundledEtag } })
    }
    return new Response(buf, {
      headers: {
        ...CACHE_HEADERS,
        ETag: bundledEtag,
        'Content-Type': contentTypeForSigFile(filename),
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
