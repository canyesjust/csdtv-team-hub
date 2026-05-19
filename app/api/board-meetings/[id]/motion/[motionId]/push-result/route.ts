import { NextRequest, NextResponse } from 'next/server'
import { pushResult } from '@/lib/board-meetings/motion-api'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { motionId } = await ctx.params
  try {
    const result = await pushResult(motionId)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
