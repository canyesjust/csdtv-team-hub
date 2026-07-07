import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

// Verify that stored YouTube IDs still exist on YouTube.
//
// The channel sync only reads the public uploads playlist, which does NOT list
// unlisted videos. So "not in the uploads playlist" does not mean "deleted".
// videos.list?id=... returns both public AND unlisted videos, and omits only
// deleted or private ones. Calling it per ID is the reliable existence test.
//
// Returns the subset of the requested IDs that still exist. Anything requested
// but not returned is genuinely gone (deleted or made private).

const ID_RE = /^[a-zA-Z0-9_-]{11}$/
const MAX_IDS = 300

const QUOTA_MESSAGE =
  'YouTube API daily quota exceeded. Try again after the quota resets (midnight Pacific).'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawIds = (body as { ids?: unknown })?.ids
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'Missing ids array' }, { status: 400 })
  }

  // Validate and bound input server-side.
  const ids = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && ID_RE.test(id)))].slice(0, MAX_IDS)
  if (ids.length === 0) {
    return NextResponse.json({ existing: [], checked: 0 })
  }

  const existing: string[] = []
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${batch.join(',')}&part=id&key=${apiKey}`)
      if (!res.ok) {
        try {
          const errBody = (await res.json()) as { error?: { errors?: Array<{ reason?: string }> } }
          if (errBody.error?.errors?.[0]?.reason === 'quotaExceeded') {
            return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 })
          }
        } catch {
          /* ignore */
        }
        return NextResponse.json({ error: 'YouTube verification failed' }, { status: 502 })
      }
      const data = await res.json()
      for (const item of data.items || []) {
        if (item?.id) existing.push(item.id)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'YouTube verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ existing, checked: ids.length })
}
