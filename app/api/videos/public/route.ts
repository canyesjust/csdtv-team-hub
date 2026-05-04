import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Optional ?days=N filter — returns videos published in the last N days
  // (today through today minus N-1 days, inclusive). Future-dated videos
  // are always excluded so scheduled livestreams don't appear early.
  const daysParam = req.nextUrl.searchParams.get('days')
  const days = daysParam ? parseInt(daysParam, 10) : null

  let query = supabase
    .from('videos')
    .select('id, title, video_type, status, date_published, youtube_url, youtube_id, youtube_views, youtube_likes, youtube_duration, youtube_thumbnail, description, school_department')
    .eq('status', 'Published')
    .not('youtube_id', 'is', null)
    .order('date_published', { ascending: false })

  if (days && !isNaN(days) && days > 0) {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() - (days - 1))
    const cutoffStr = cutoff.toISOString().split('T')[0]
    query = query
      .gte('date_published', cutoffStr)
      .lte('date_published', todayStr)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add CORS headers for embedding
  const response = NextResponse.json({ videos: data || [] })
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET')
  return response
}