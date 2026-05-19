import { NextRequest, NextResponse } from 'next/server'
import { dismissResult } from '@/lib/board-meetings/motion-api'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    await dismissResult(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
