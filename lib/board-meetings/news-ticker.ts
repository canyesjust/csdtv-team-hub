// District news headlines for the board-meeting preroll ticker.
// Pulls the district RSS feed and returns the latest titles. No external deps —
// the feed is RSS 2.0, so a light parse of <item><title> is enough.

const FEED_URL = 'https://rss.app/feeds/hR9Of3ZD4b0Rw2Bg.xml'

export type NewsHeadline = { title: string; link: string | null }

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function pickTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? decodeEntities(m[1]) : null
}

/** Latest district headlines for the preroll ticker. Cached ~10 min; never throws. */
export async function fetchDistrictNews(limit = 12): Promise<NewsHeadline[]> {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate: 600 } })
    if (!res.ok) return []
    const xml = await res.text()
    const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || []
    const headlines: NewsHeadline[] = []
    for (const block of blocks) {
      const title = pickTag(block, 'title')
      if (!title) continue
      headlines.push({ title, link: pickTag(block, 'link') })
      if (headlines.length >= limit) break
    }
    return headlines
  } catch {
    return []
  }
}
