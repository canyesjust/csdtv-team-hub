import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { IMAGE_BUCKET, imageUrl } from '@/lib/graphics/images'

export const dynamic = 'force-dynamic'

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/avif']
const MAX_BYTES = 20 * 1024 * 1024

async function requireStaff() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isStaffOrManagerRole(teamUser.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const service = getServiceSupabaseClient()
  if (!service) return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  return { service }
}

/** Everything already uploaded, newest first, so a card can reuse art. */
export async function GET() {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { data } = await gate.service.storage.from(IMAGE_BUCKET).list('', {
    limit: 200, sortBy: { column: 'created_at', order: 'desc' },
  })
  const images = (data || [])
    .filter(o => o.name && !o.name.startsWith('.'))
    .map(o => ({ name: o.name, url: imageUrl(gate.service, o.name) }))
  return NextResponse.json({ images })
}

/** Bounded on type and size server-side; the client cannot be trusted for either. */
export async function POST(request: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { service } = gate

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected a file upload' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That image is over 20 MB' }, { status: 400 })
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type || 'unknown'}` }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase()
  const path = `${crypto.randomUUID()}.${ext}`

  const { error } = await service.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: 'Could not store the image' }, { status: 500 })

  return NextResponse.json({ success: true, path, url: imageUrl(service, path) })
}
