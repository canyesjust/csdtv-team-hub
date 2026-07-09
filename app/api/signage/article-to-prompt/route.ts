import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

// Distills a pasted article into a short, glanceable brief that Create with AI
// can generate a signage slide from. Reuses the signage generation edge function
// (which just returns the model completion) with a summarization system prompt.
async function callGenerator(system: string, user: string): Promise<{ text?: string; error?: string }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return { error: 'Server not configured' }
  try {
    const res = await fetch(`${base}/functions/v1/generate-signage-slide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        'x-signage-generate-secret': process.env.SIGNAGE_GENERATE_SECRET || '',
      },
      body: JSON.stringify({ system, user }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: typeof data.error === 'string' ? data.error : 'Generation failed' }
    return { text: typeof data.html === 'string' ? data.html : '' }
  } catch {
    return { error: 'Could not reach the generator' }
  }
}

function cleanBrief(raw: string): string {
  return (raw || '')
    .replace(/```[\s\S]*?```/g, ' ')       // stray code fences
    .replace(/<[^>]+>/g, ' ')               // stray HTML
    .replace(/^\s*(prompt|brief|slide)\s*:\s*/i, '') // leading label
    .replace(/^["'“”]+|["'“”]+$/g, '')      // wrapping quotes
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => ({}))
  const article = String(body.article ?? '').trim()
  if (article.length < 40) {
    return NextResponse.json({ error: 'Paste a bit more of the article first.' }, { status: 400 })
  }

  const system = [
    'You turn a news article into a SHORT creative brief for an AI that designs ONE digital-signage slide shown on TVs around a school district.',
    'Return ONLY 1–2 plain sentences (no markdown, no quotes, no preamble, no label) describing the single most glanceable, on-brand takeaway to put on screen: a clear headline idea plus one supporting detail if useful.',
    'Be concrete and specific to THIS article. Keep it positive and community-facing. Do not exceed 40 words. Do not invent facts that are not in the article.',
  ].join('\n')

  const user = `Article:\n\n${article.slice(0, 9000)}`

  const result = await callGenerator(system, user)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })
  const prompt = cleanBrief(result.text || '')
  if (!prompt) return NextResponse.json({ error: 'Could not summarize that — try pasting the key paragraphs.' }, { status: 422 })

  return NextResponse.json({ prompt })
}
