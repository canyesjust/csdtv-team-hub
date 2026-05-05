import { NextResponse } from 'next/server'

const CHANNEL_HANDLE = '@canyonsdistricttv'

export async function GET(request: Request) {
  // Require auth
  const authCookie = request.headers.get('cookie')
  if (!authCookie || !authCookie.includes('sb-')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 })

  try {
    // Step 1: Resolve handle to channel ID + uploads playlist
    const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?forHandle=${CHANNEL_HANDLE}&part=contentDetails,snippet,statistics&key=${apiKey}`)
    if (!chRes.ok) return NextResponse.json({ error: 'Failed to fetch channel' }, { status: 502 })
    const chData = await chRes.json()
    if (!chData.items?.length) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

    const channel = chData.items[0]
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads
    const channelTitle = channel.snippet.title

    // Step 2: Fetch all videos from uploads playlist (paginated, max 500)
    const allVideoIds: string[] = []
    let nextPageToken = ''
    let pages = 0

    do {
      const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=contentDetails&maxResults=50&pageToken=${nextPageToken}&key=${apiKey}`)
      if (!plRes.ok) break
      const plData = await plRes.json()
      const ids = (plData.items || []).map((item: any) => item.contentDetails.videoId)
      allVideoIds.push(...ids)
      nextPageToken = plData.nextPageToken || ''
      pages++
    } while (nextPageToken && pages < 10) // Max 500 videos

    // Step 3: Fetch full details for all videos (in batches of 50)
    const videos: any[] = []
    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batch = allVideoIds.slice(i, i + 50)
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${batch.join(',')}&part=snippet,statistics,contentDetails,liveStreamingDetails&key=${apiKey}`)
      if (!vRes.ok) continue
      const vData = await vRes.json()
      for (const item of vData.items || []) {
        // Parse duration
        const durMatch = item.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
        const h = parseInt(durMatch?.[1] || '0')
        const m = parseInt(durMatch?.[2] || '0')
        const s = parseInt(durMatch?.[3] || '0')
        const duration = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`

        // Determine the best date:
        // 1. liveStreamingDetails.actualStartTime (for livestreams)
        // 2. Date extracted from video title (e.g. "Board Meeting 3/31/2026")
        // 3. publishedAt adjusted to Mountain Time
        // Date priority: livestream's broadcaster-set scheduledStartTime, then
        // the video's publishedAt for non-livestream uploads. actualStartTime and
        // title-regex parsing are intentionally not used — the former is missing for
        // upcoming livestreams and the latter only catches "M/D/YYYY" not "May 7, 2026".
        let bestDate: string
        const scheduled = item.liveStreamingDetails?.scheduledStartTime
        const dateSource = scheduled || item.snippet.publishedAt
        const d = new Date(dateSource)
        const mt = new Date(d.getTime() - 7 * 60 * 60 * 1000)
        bestDate = `${mt.getUTCFullYear()}-${String(mt.getUTCMonth() + 1).padStart(2, '0')}-${String(mt.getUTCDate()).padStart(2, '0')}`

        videos.push({
          youtube_id: item.id,
          title: item.snippet.title,
          description: item.snippet.description?.slice(0, 500) || '',
          published_at: item.snippet.publishedAt,
          local_date: bestDate,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
          views: parseInt(item.statistics.viewCount || '0'),
          likes: parseInt(item.statistics.likeCount || '0'),
          duration,
          tags: item.snippet.tags?.slice(0, 10) || [],
        })
      }
    }

    return NextResponse.json({
      channel: channelTitle,
      total: videos.length,
      videos,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Channel sync failed' }, { status: 500 })
  }
}
