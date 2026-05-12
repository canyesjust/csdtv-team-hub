import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  TASK_INTAKE_PRIORITIES,
  TASK_INTAKE_RECURRING,
  TASK_INTAKE_SOURCE_MAGIC_LINK,
  hashTaskIntakeToken,
  isValidIntakeEmail,
  isValidPurchaseRequestLink,
} from '@/lib/task-intake'
import { sanitizeEmailSubject } from '@/lib/escape-html'

export const dynamic = 'force-dynamic'

type Body = {
  t?: string
  submitter_name?: string
  submitter_email?: string
  title?: string
  description?: string | null
  priority?: string
  due_date?: string | null
  production_id?: string | null
  needs_equipment?: boolean
  purchase_request?: boolean
  purchase_request_link?: string | null
  recurring?: string | null
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.t === 'string' ? body.t.trim() : ''
  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 400 })
  }

  const submitterName = (body.submitter_name || '').trim()
  const submitterEmail = (body.submitter_email || '').trim()
  if (!submitterName || submitterName.length > 200) {
    return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })
  }
  if (!isValidIntakeEmail(submitterEmail)) {
    return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 })
  }

  const title = (body.title || '').trim()
  if (!title || title.length > 500) {
    return NextResponse.json({ error: 'Please enter a task title' }, { status: 400 })
  }

  const description = body.description != null ? String(body.description).trim() : ''
  if (description.length > 8000) {
    return NextResponse.json({ error: 'Description is too long' }, { status: 400 })
  }

  const priority = (body.priority || 'normal').trim()
  if (!TASK_INTAKE_PRIORITIES.includes(priority as (typeof TASK_INTAKE_PRIORITIES)[number])) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }

  let dueDate: string | null = null
  if (body.due_date != null && String(body.due_date).trim() !== '') {
    const d = String(body.due_date).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'Invalid due date' }, { status: 400 })
    }
    dueDate = d
  }

  const recurringRaw = body.recurring != null ? String(body.recurring).trim() : ''
  if (!TASK_INTAKE_RECURRING.includes(recurringRaw as (typeof TASK_INTAKE_RECURRING)[number])) {
    return NextResponse.json({ error: 'Invalid repeat option' }, { status: 400 })
  }
  const recurring = recurringRaw === '' ? null : recurringRaw
  if (recurring && !dueDate) {
    return NextResponse.json({ error: 'Due date is required when repeat is set' }, { status: 400 })
  }

  const needsEquipment = Boolean(body.needs_equipment)
  const purchaseRequest = Boolean(body.purchase_request)
  const purchaseLink = purchaseRequest ? (body.purchase_request_link || '').trim() || null : null
  if (purchaseRequest && !isValidPurchaseRequestLink(purchaseLink)) {
    return NextResponse.json({ error: 'Purchase link must start with http:// or https://' }, { status: 400 })
  }

  let productionId: string | null = null
  if (body.production_id != null && String(body.production_id).trim() !== '') {
    productionId = String(body.production_id).trim()
  }

  const supabase = createClient(url, key)
  const tokenHash = hashTaskIntakeToken(token)
  const nowIso = new Date().toISOString()

  const { data: tok, error: tokErr } = await supabase
    .from('task_intake_tokens')
    .select('id, team_user_id, revoked_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (tokErr || !tok) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }
  if (tok.revoked_at) {
    return NextResponse.json({ error: 'This link has been revoked' }, { status: 410 })
  }
  if (tok.expires_at && tok.expires_at < nowIso) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  if (productionId) {
    const { data: prod, error: pErr } = await supabase
      .from('productions')
      .select('id')
      .eq('id', productionId)
      .neq('status', 'Complete')
      .neq('status', 'Abandoned')
      .maybeSingle()
    if (pErr || !prod) {
      return NextResponse.json({ error: 'Invalid production' }, { status: 400 })
    }
  }

  const { data: owner, error: ownerErr } = await supabase
    .from('team')
    .select('id, name, email')
    .eq('id', tok.team_user_id)
    .eq('active', true)
    .maybeSingle()

  if (ownerErr || !owner?.email) {
    return NextResponse.json({ error: 'Intake owner is not available' }, { status: 500 })
  }

  const { data: inserted, error: insErr } = await supabase
    .from('tasks')
    .insert({
      title,
      description: description || null,
      priority,
      assigned_to: tok.team_user_id,
      due_date: dueDate,
      production_id: productionId,
      needs_equipment: needsEquipment,
      purchase_request: purchaseRequest,
      purchase_request_link: purchaseLink,
      hide_from_signage: false,
      recurring,
      recurring_interval: recurring ? 1 : null,
      status: 'pending',
      created_by: tok.team_user_id,
      intake_source: TASK_INTAKE_SOURCE_MAGIC_LINK,
      intake_submitter_name: submitterName,
      intake_submitter_email: submitterEmail,
      intake_token_id: tok.id,
    })
    .select('id')
    .single()

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: insErr?.message || 'Failed to create task' }, { status: 500 })
  }

  await supabase.from('task_intake_tokens').update({ last_used_at: nowIso }).eq('id', tok.id)

  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const tasksUrl = siteBase ? `${siteBase.replace(/\/$/, '')}/dashboard/tasks` : '/dashboard/tasks'

  const prodLine = productionId ? `\nProduction: linked in Team Hub` : ''
  const emailBody =
    `A new task was submitted through your magic intake link.\n\n` +
    `Title: ${title}\n` +
    `From: ${submitterName} <${submitterEmail}>\n` +
    `Priority: ${priority}${dueDate ? `\nDue: ${dueDate}` : ''}${prodLine}\n\n` +
    `Open Team Hub to review and reassign if needed:\n${tasksUrl}\n\n` +
    `— CSDtv Team Hub`

  try {
    await fetch(`${url}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        type: 'task_assigned',
        recipientEmail: owner.email,
        recipientName: owner.name.trim().split(/\s+/)[0] || 'there',
        subject: sanitizeEmailSubject(`New task request: ${title}`),
        body: emailBody,
        actionUrl: tasksUrl,
        actionLabel: 'Open tasks',
      }),
    })
  } catch {
    /* email failure — task still created */
  }

  return NextResponse.json({ ok: true, task_id: inserted.id })
}
