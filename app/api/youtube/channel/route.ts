import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

const CHANNEL_HANDLE = '@canyonsdistricttv'

function parseIsoDuration(iso: string | undefined | null): string {
  if (!iso) return '0:00'
  const durMatch = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!durMatch) return '0:00'
  const h = parseInt(durMatch[1] || '0', 10)
  const m = parseInt(durMatch[2] || '0', 10)
  const s = parseInt(durMatch[3] || '0', 10)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function localDateFromIso(iso: string | undefined | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const mt = new Date(d.getTime() - 7 * 60 * 60 * 1000)
  return `${mt.getUTCFullYear()}-${String(mt.getUTCMonth() + 1).padStart(2, '0')}-${String(mt.getUTCDate()).padStart(2, '0')}`
}

async function youtubeErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    /* ignore */
  }
  return fallback
}

export async function GET(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 })

  try {
    // Step 1: Resolve handle to channel ID + uploads playlist
    const handleParam = encodeURIComponent(CHANNEL_HANDLE.replace(/^@/, ''))
    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?forHandle=${handleParam}&part=contentDetails,snippet,statistics&key=${apiKey}`,
    )
    if (!chRes.ok) {
      const message = await youtubeErrorMessage(chRes, 'Failed to fetch channel from YouTube')
      return NextResponse.json({ error: message }, { status: 502 })
    }
    const chData = await chRes.json()
    if (!chData.items?.length) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

    const channel = chData.items[0]
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylistId) {
      return NextResponse.json({ error: 'Channel uploads playlist not found' }, { status: 502 })
    }
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
        const duration = parseIsoDuration(item.contentDetails?.duration)
        const scheduled = item.liveStreamingDetails?.scheduledStartTime
        const dateSource = scheduled || item.snippet?.publishedAt
        const bestDate =
          localDateFromIso(dateSource) ||
          localDateFromIso(item.snippet?.publishedAt) ||
          null

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
    const message = err instanceof Error ? err.message : 'Channel sync failed'
    console.error('YouTube channel sync error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
