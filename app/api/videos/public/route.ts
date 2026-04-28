import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('videos')
    .select('id, title, video_type, status, date_published, youtube_url, youtube_id, youtube_views, youtube_likes, youtube_duration, youtube_thumbnail, description, school_department')
    .eq('status', 'Published')
    .not('youtube_id', 'is', null)
    .order('date_published', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add CORS headers for embedding
  const response = NextResponse.json({ videos: data || [] })
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET')
  return response
}
