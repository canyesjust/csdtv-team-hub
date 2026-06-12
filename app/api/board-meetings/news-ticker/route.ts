import { NextResponse } from 'next/server'
import { fetchDistrictNews } from '@/lib/board-meetings/news-ticker'

// Cached at the route level so many board screens hitting this don't each fetch
// the upstream RSS feed.
export const revalidate = 600

export async function GET() {
  const headlines = await fetchDistrictNews(12)
  return NextResponse.json({ headlines })
}
