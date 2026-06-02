import { NextResponse } from 'next/server'
import { sortByBoardSeatOrder } from '@/lib/board-meetings/lower-third-board-order'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const PHOTO_BUCKET = 'lower-third-photos'

async function photoPlaybackUrl(
  service: NonNullable<ReturnType<typeof getServiceSupabaseClient>>,
  photoPath: string | null,
): Promise<string | null> {
  if (!photoPath) return null
  if (photoPath.startsWith('http')) return photoPath

  const { data, error } = await service.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photoPath, 3600)
  if (!error && data?.signedUrl) return data.signedUrl

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) return null
  const encoded = photoPath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${encoded}`
}

export async function GET() {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service
    .from('lower_third_people')
    .select('id, display_name, primary_title, officer_position, photo_path')
    .eq('category', 'board_member')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = await Promise.all(
    sortByBoardSeatOrder(data || []).map(async m => ({
      id: m.id,
      display_name: m.display_name,
      primary_title: m.primary_title,
      officer_position: m.officer_position,
      photo_path: m.photo_path,
      photo_url: await photoPlaybackUrl(service, m.photo_path),
    })),
  )

  const response = NextResponse.json({ members })
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}
