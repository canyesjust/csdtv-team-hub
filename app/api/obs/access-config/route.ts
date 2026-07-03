import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants'
import { clearObsPassword, getObsAccessStatus, setObsPassword } from '@/lib/server/obs-access'

// Manager-only management of the /obs page's shared password.
export const dynamic = 'force-dynamic'

async function requireManager() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return null
  return teamUser
}

export async function GET() {
  if (!(await requireManager())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const status = await getObsAccessStatus()
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { password?: string }
  const password = String(body.password || '')
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 })
  }
  if (password.length > 200) {
    return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
  }

  const { error } = await setObsPassword(password, manager.id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await clearObsPassword()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ success: true })
}
