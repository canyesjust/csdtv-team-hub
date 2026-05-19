import { NextRequest, NextResponse } from 'next/server'
import { proposeSubstitute } from '@/lib/board-meetings/motion-api'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { motionId } = await ctx.params
  try {
    const body = await req.json()
    const result = await proposeSubstitute(motionId, body.agenda_item_id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
