import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

const CHANNEL_HANDLE = '@canyonsdistricttv'
// 50 videos per page. 40 pages = 2000 videos, well above the channel size.
const MAX_PAGES = 40

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

// Convert a UTC ISO instant to a Mountain-time calendar date (YYYY-MM-DD).
// Uses the IANA zone so DST is handled correctly (MDT in summer, MST in winter).
function localDateFromIso(iso: string | undefined | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

async function readYoutubeError(
  res: Response,
): Promise<{ message?: string; reason?: string }> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> }
    }
    return {
      message: body.error?.message,
      reason: body.error?.errors?.[0]?.reason,
    }
  } catch {
    return {}
  }
}

const QUOTA_MESSAGE =
  'YouTube API daily quota exceeded. Sync will work again after the quota resets (midnight Pacific).'

export async function GET() {
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
      const { message, reason } = await readYoutubeError(chRes)
      if (reason === 'quotaExceeded') return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 })
      return NextResponse.json({ error: message || 'Failed to fetch channel from YouTube' }, { status: 502 })
    }
    const chData = await chRes.json()
    if (!chData.items?.length) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

    const channel = chData.items[0]
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylistId) {
      return NextResponse.json({ error: 'Channel uploads playlist not found' }, { status: 502 })
    }
    const channelTitle = channel.snippet.title

    // Step 2: Page through the uploads playlist.
    // `complete` is true only if we reached the end of the playlist. If we stop
    // early (page cap or a failed page), the caller must NOT treat any stored
    // video as "missing" — the fetched set is incomplete.
    const allVideoIds: string[] = []
    let nextPageToken = ''
    let pages = 0
    let complete = false
    let warning: string | null = null

    do {
      const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=contentDetails&maxResults=50&pageToken=${nextPageToken}&key=${apiKey}`)
      if (!plRes.ok) {
        const { message, reason } = await readYoutubeError(plRes)
        if (reason === 'quotaExceeded') return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 })
        warning = message || 'Stopped early: a channel page failed to load.'
        break
      }
      const plData = await plRes.json()
      const ids = (plData.items || []).map((item: any) => item.contentDetails.videoId)
      allVideoIds.push(...ids)
      nextPageToken = plData.nextPageToken || ''
      pages++
      if (!nextPageToken) {
        complete = true
        break
      }
    } while (pages < MAX_PAGES)

    if (!complete && !warning) {
      warning = `Stopped at the ${MAX_PAGES * 50}-video limit. Missing-video check skipped.`
    }

    // Step 3: Fetch full details for all videos (in batches of 50)
    const videos: any[] = []
    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batch = allVideoIds.slice(i, i + 50)
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${batch.join(',')}&part=snippet,statistics,contentDetails,liveStreamingDetails&key=${apiKey}`)
      if (!vRes.ok) {
        const { reason } = await readYoutubeError(vRes)
        if (reason === 'quotaExceeded') return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 })
        continue
      }
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
      complete,
      warning,
      videos,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Channel sync failed'
    console.error('YouTube channel sync error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
