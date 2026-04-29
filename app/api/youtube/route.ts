import { NextResponse } from 'next/server'

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return iso
  const h = parseInt(m[1] || '0')
  const min = parseInt(m[2] || '0')
  const sec = parseInt(m[3] || '0')
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${min}:${String(sec).padStart(2, '0')}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })

  const videoId = extractVideoId(url)
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 })

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`)
    if (!res.ok) return NextResponse.json({ error: 'YouTube API error' }, { status: 502 })
    const data = await res.json()
    if (!data.items || data.items.length === 0) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const item = data.items[0]
    const pubDate = new Date(item.snippet.publishedAt)
    const mtDate = new Date(pubDate.getTime() - 7 * 60 * 60 * 1000)
    const localDate = `${mtDate.getUTCFullYear()}-${String(mtDate.getUTCMonth() + 1).padStart(2, '0')}-${String(mtDate.getUTCDate()).padStart(2, '0')}`

    return NextResponse.json({
      youtube_id: videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      published_at: item.snippet.publishedAt,
      local_date: localDate,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
      views: parseInt(item.statistics.viewCount || '0'),
      likes: parseInt(item.statistics.likeCount || '0'),
      duration: parseDuration(item.contentDetails.duration),
      channel: item.snippet.channelTitle,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch video data' }, { status: 500 })
  }
}
