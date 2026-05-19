import { NextRequest, NextResponse } from 'next/server'
import { setSeconder } from '@/lib/board-meetings/motion-api'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { motionId } = await ctx.params
  try {
    const body = await req.json()
    await setSeconder(motionId, body.person_id || null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
