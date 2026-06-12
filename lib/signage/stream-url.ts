/** Normalize stream URL for CIC live takeover (HLS manifest or YouTube live/watch link). */
export function normalizeSignageStreamUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim()
  if (!url) return null
  return url
}

export function isSignageHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('application/vnd.apple.mpegurl')
}

const YOUTUBE_ID =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

export function youtubeVideoIdFromUrl(url: string): string | null {
  const match = url.match(YOUTUBE_ID)
  return match?.[1] ?? null
}

export function youtubeEmbedUrlFromStreamUrl(
  url: string,
  opts: { controls?: boolean; captions?: boolean; muted?: boolean } = {},
): string | null {
  const id = youtubeVideoIdFromUrl(url)
  if (!id) return null
  const { controls = false, captions = true, muted = true } = opts
  const params = new URLSearchParams({
    autoplay: '1',
    mute: muted ? '1' : '0',
    rel: '0',
    playsinline: '1',
    controls: controls ? '1' : '0',
  })
  if (captions) {
    params.set('cc_load_policy', '1')
    params.set('cc_lang_pref', 'en')
  }
  return `https://www.youtube.com/embed/${id}?${params.toString()}`
}

export function isSignageStreamUrl(url: string): boolean {
  return isSignageHlsUrl(url) || youtubeVideoIdFromUrl(url) != null
}
