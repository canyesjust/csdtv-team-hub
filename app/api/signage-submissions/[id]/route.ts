import { NextRequest, NextResponse } from 'next/server'
import { sanitizeEmailSubject } from '@/lib/escape-html'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ManagerContext =
  | { ok: false; response: NextResponse }
  | { ok: true; teamUser: NonNullable<Awaited<ReturnType<typeof getAuthenticatedTeamUser>>>; service: SupabaseClient }

async function getManagerContext(): Promise<ManagerContext> {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isManagerRole(teamUser.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const service = getServiceSupabaseClient()
  if (!service) {
    return { ok: false, response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }
  return { ok: true, teamUser, service }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getManagerContext()
  if (!ctx.ok) return ctx.response
  const { teamUser, service } = ctx

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid submission id' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action as string | undefined
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: teamUser.id,
    reviewed_at: now,
    updated_at: now,
  }

  if (action === 'reject') {
    const reason = typeof body.reject_reason === 'string' ? body.reject_reason.trim() : ''
    update.reject_reason = reason || null
  }

  if (action === 'approve') {
    if (typeof body.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
      update.start_date = body.start_date
    }
    if (typeof body.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
      update.end_date = body.end_date
    }
  }

  const { data: row, error } = await service
    .from('signage_submissions')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: error?.message || 'Submission not found' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key && row.submitter_email) {
    try {
      const firstName = String(row.submitter_name || '').trim().split(/\s+/)[0] || 'there'
      if (action === 'approve') {
        fetch(`${url}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            type: 'signage_decision_approved',
            recipientEmail: row.submitter_email,
            recipientName: firstName,
            subject: sanitizeEmailSubject('Your signage image was approved'),
            body: [
              `Hi ${firstName},`,
              '',
              'Your image was approved for the CSDtv office digital signage.',
              row.caption ? `Caption: ${row.caption}` : null,
              `It will run from ${row.start_date} through ${row.end_date}.`,
              '',
              '— CSDtv',
            ].filter(Boolean).join('\n'),
          }),
        }).catch(() => {})
      } else {
        const reason = row.reject_reason ? `\n\nReason: ${row.reject_reason}` : ''
        fetch(`${url}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            type: 'signage_decision_rejected',
            recipientEmail: row.submitter_email,
            recipientName: firstName,
            subject: sanitizeEmailSubject('Update on your signage image'),
            body: [
              `Hi ${firstName},`,
              '',
              'Thanks for submitting an image for the CSDtv office digital signage. It was not approved this time.',
              reason,
              '',
              'You are welcome to submit another image at https://www.csdtvstaff.org/signage/csdtv/submit',
              '',
              '— CSDtv',
            ].join('\n'),
          }),
        }).catch(() => {})
      }
    } catch {
      /* email failures do not block */
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getManagerContext()
  if (!ctx.ok) return ctx.response
  const { service } = ctx

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid submission id' }, { status: 400 })
  }

  const { data: row } = await service
    .from('signage_submissions')
    .select('image_path')
    .eq('id', id)
    .maybeSingle()

  const { error: deleteError } = await service.from('signage_submissions').delete().eq('id', id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  if (row?.image_path) {
    await service.storage.from('signage-submissions').remove([row.image_path]).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
