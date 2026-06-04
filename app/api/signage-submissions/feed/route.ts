import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { signageSubmissionPublicUrl } from '@/lib/signage-submissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await service
    .from('signage_submissions')
    .select('id, caption, image_path')
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('signage feed error:', error)
    return NextResponse.json({ error: 'Could not load slideshow feed.' }, { status: 500 })
  }

  const images = (data ?? []).map(row => ({
    id: row.id,
    caption: row.caption,
    public_url: signageSubmissionPublicUrl(row.image_path),
  }))

  return NextResponse.json(
    { images },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
