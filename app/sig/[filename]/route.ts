import { readFile } from 'fs/promises'
import path from 'path'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { SIG_ASSET_FILENAMES, SIG_BUCKET, contentTypeForSigFile } from '@/lib/sig-assets'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  if (!SIG_ASSET_FILENAMES.has(filename)) {
    return new Response('Not found', { status: 404 })
  }

  const service = getServiceSupabaseClient()
  if (service) {
    const { data, error } = await service.storage.from(SIG_BUCKET).download(filename)
    if (data && !error) {
      const buf = Buffer.from(await data.arrayBuffer())
      return new Response(buf, {
        headers: {
          'Content-Type': contentTypeForSigFile(filename),
          'Cache-Control': 'public, max-age=300',
        },
      })
    }
  }

  try {
    const filePath = path.join(process.cwd(), 'assets', 'sig-defaults', filename)
    const buf = await readFile(filePath)
    return new Response(buf, {
      headers: {
        'Content-Type': contentTypeForSigFile(filename),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
