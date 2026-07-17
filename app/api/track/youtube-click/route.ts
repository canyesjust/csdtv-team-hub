import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/server/rate-limit'

function isAllowedYoutubeHost(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === 'youtube.com'
    || h === 'www.youtube.com'
    || h === 'm.youtube.com'
    || h === 'music.youtube.com'
    || h === 'youtu.be'
    || h === 'www.youtu.be'
  )
}

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit(request, {
    scope: 'youtube_click',
    max: 60,
    windowMs: 60 * 1000,
  })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const productionId = request.nextUrl.searchParams.get('productionId')
  const rawTarget = request.nextUrl.searchParams.get('u')
  if (!productionId || !rawTarget) {
    return NextResponse.json({ error: 'Missing productionId or u' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawTarget)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
  }
  if (!isAllowedYoutubeHost(target.hostname)) {
    return NextResponse.json({ error: 'Invalid redirect host' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: prod, error: fetchErr } = await supabase
    .from('productions')
    .select('id, youtube_link_email_first_click_at, youtube_link_email_click_count')
    .eq('id', productionId)
    .maybeSingle()

  if (fetchErr || !prod) {
    return NextResponse.json({ error: 'Production not found' }, { status: 404 })
  }

  const prevCount = prod.youtube_link_email_click_count ?? 0
  const patch: Record<string, string | number> = {
    youtube_link_email_click_count: prevCount + 1,
  }
  if (!prod.youtube_link_email_first_click_at) {
    patch.youtube_link_email_first_click_at = new Date().toISOString()
  }

  await supabase.from('productions').update(patch).eq('id', productionId)

  return NextResponse.redirect(target.toString(), 302)
}
