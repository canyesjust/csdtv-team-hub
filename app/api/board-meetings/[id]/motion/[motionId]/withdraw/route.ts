import { NextRequest, NextResponse } from 'next/server'
import { withdrawMotion } from '@/lib/board-meetings/motion-api'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { motionId } = await ctx.params
  try {
    await withdrawMotion(motionId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
