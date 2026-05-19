import { NextRequest, NextResponse } from 'next/server'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const bundle = await loadMotionScreenBundle(id)
    if (!bundle) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    return NextResponse.json(bundle)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
