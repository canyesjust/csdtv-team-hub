import { NextRequest, NextResponse } from 'next/server'
import { openMotion } from '@/lib/board-meetings/motion-api'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const result = await openMotion(id, body.agenda_item_id, body.mover_id || null)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
