import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'
import { verifySvixSignature } from '@/lib/server/svix'
import {
  deriveExternalContacts,
  htmlToText,
  parseOneAddress,
  type ParsedAddress,
} from '@/lib/contacts-inbound'

export const dynamic = 'force-dynamic'

/**
 * Inbound BCC capture webhook (Contact CRM, Phase 2).
 *
 * A team member BCCs the capture address when emailing an external contact. The
 * message reaches this endpoint, we identify the team sender, derive the external
 * recipients, and stage each as a pending interaction (and a pending_review
 * contact when new) via the service-role-only capture_inbound_contact() RPC. A
 * best-effort summarize-interaction call adds a one-line Claude summary, and
 * managers are emailed that items await review.
 *
 * Two inbound shapes are supported:
 *
 *   1. Resend inbound (primary). Resend sends a Svix-signed `email.received`
 *      event containing only METADATA. We verify the signature with
 *      RESEND_WEBHOOK_SECRET, then fetch the body via
 *      GET https://api.resend.com/emails/receiving/{id} using RESEND_API_KEY.
 *      Detected by the presence of the `svix-signature` header.
 *
 *   2. Generic forwarder (fallback / testing). Any caller that POSTs the
 *      normalized JSON below with `Authorization: Bearer <CONTACTS_INBOUND_SECRET>`
 *      (constant-time compared). Used for curl tests or a custom forwarder.
 *
 * Normalized JSON (generic path):
 *   { from, to, cc?, subject?, text?, html?, messageId?, receivedAt? }
 *
 * Security: public /api route, so it self-gates (Svix signature OR shared
 * secret), is rate-limited, bounds all input, and only captures mail whose From
 * is an active team member.
 *
 * Env:
 * - RESEND_WEBHOOK_SECRET        Svix signing secret for the inbound webhook (Resend path)
 * - RESEND_API_KEY               used to fetch the received email body (Resend path)
 * - CONTACTS_INBOUND_SECRET      shared secret for the generic path
 * - CONTACTS_INBOUND_ADDRESS     the capture inbox, excluded from captured contacts
 * - CONTACTS_BODY_RETENTION_DAYS days before body_raw is purged (default 90)
 * - NEXT_PUBLIC_SITE_URL         used to build the review link in the manager email
 */

type NormalizedEmail = {
  sender: ParsedAddress
  to: unknown
  cc: unknown
  subject: string
  text: string
  messageId: string | null
  occurredAt: string | null
}

const MAX_RECIPIENTS = 25
const MAX_BODY = 100_000
const MAX_SUBJECT = 998

function presentedSecret(request: Request): string | null {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim()
  const header = request.headers.get('x-webhook-secret')
  if (header) return header.trim()
  return null
}

function retentionDays(): number {
  const raw = parseInt(process.env.CONTACTS_BODY_RETENTION_DAYS ?? '90', 10)
  if (Number.isNaN(raw) || raw < 1 || raw > 3650) return 90
  return raw
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Resend: fetch the full received email (body) by id. Returns null on failure. */
async function fetchResendReceivedEmail(
  apiKey: string,
  id: string,
): Promise<{
  from?: string
  to?: string[]
  cc?: string[]
  subject?: string
  text?: string | null
  html?: string | null
  message_id?: string
} | null> {
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const rl = await checkRateLimit(request, { scope: 'contacts_inbound', max: 120, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // Read the RAW body once: Svix verification is byte-sensitive.
  const rawBody = await request.text()
  const isResend = !!request.headers.get('svix-signature')

  let email: NormalizedEmail

  if (isResend) {
    // ── Resend inbound path ──────────────────────────────────────────────
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    const apiKey = process.env.RESEND_API_KEY
    if (!webhookSecret || !apiKey) {
      return NextResponse.json({ error: 'Resend inbound is not configured' }, { status: 503 })
    }

    const valid = verifySvixSignature({
      secret: webhookSecret,
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signatureHeader: request.headers.get('svix-signature'),
      body: rawBody,
    })
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let event: { type?: string; data?: Record<string, unknown> }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (event?.type !== 'email.received') {
      return NextResponse.json({ ok: true, ignored: 'event_type' })
    }

    const data = event.data || {}
    const emailId = typeof data.email_id === 'string' ? data.email_id : ''
    if (!emailId) {
      return NextResponse.json({ error: 'Missing email_id' }, { status: 400 })
    }

    // Webhook is metadata-only; fetch the body. Sender/recipients come from the
    // metadata so capture still works even if the body fetch fails.
    const full = await fetchResendReceivedEmail(apiKey, emailId)

    const senderRaw = (typeof data.from === 'string' && data.from) || full?.from || ''
    const sender = parseOneAddress(senderRaw)
    if (!sender) {
      return NextResponse.json({ error: 'Missing or invalid From address' }, { status: 400 })
    }

    let text = (full?.text || '').toString()
    if (!text && full?.html) text = htmlToText(full.html)

    email = {
      sender,
      to: data.to ?? full?.to ?? [],
      cc: data.cc ?? full?.cc ?? [],
      subject: (typeof data.subject === 'string' ? data.subject : full?.subject || '').toString(),
      text,
      messageId:
        (typeof data.message_id === 'string' && data.message_id) ||
        full?.message_id ||
        emailId,
      occurredAt: toIsoOrNull(data.created_at),
    }
  } else {
    // ── Generic forwarder path (shared secret) ───────────────────────────
    const secret = process.env.CONTACTS_INBOUND_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Inbound capture is not configured' }, { status: 503 })
    }
    if (!timingSafeEqualStr(presentedSecret(request), secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: {
      from?: string
      to?: unknown
      cc?: unknown
      subject?: string | null
      text?: string | null
      html?: string | null
      messageId?: string | null
      receivedAt?: string | null
    }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const sender = parseOneAddress(typeof body.from === 'string' ? body.from : '')
    if (!sender) {
      return NextResponse.json({ error: 'Missing or invalid From address' }, { status: 400 })
    }

    let text = typeof body.text === 'string' ? body.text : ''
    if (!text && typeof body.html === 'string' && body.html) text = htmlToText(body.html)

    email = {
      sender,
      to: body.to,
      cc: body.cc,
      subject: typeof body.subject === 'string' ? body.subject : '',
      text,
      messageId: typeof body.messageId === 'string' ? body.messageId.trim() || null : null,
      occurredAt: toIsoOrNull(body.receivedAt),
    }
  }

  return processCapture(url, key, email)
}

/** Shared capture pipeline used by both inbound paths. */
async function processCapture(url: string, key: string, email: NormalizedEmail) {
  const subject = (email.subject || '').trim().slice(0, MAX_SUBJECT)
  const text = (email.text || '').slice(0, MAX_BODY)
  const messageId = email.messageId ? email.messageId.slice(0, 998) : null

  const supabase = createClient(url, key)

  // Only capture mail actually sent by a known, active team member.
  const { data: senderRow } = await supabase
    .from('team')
    .select('id')
    .eq('email', email.sender.email)
    .eq('active', true)
    .maybeSingle()

  if (!senderRow?.id) {
    return NextResponse.json({ ok: true, ignored: 'unknown_sender' })
  }

  // Exclude the sender, every team member, and the capture inbox from "contacts".
  const { data: teamRows } = await supabase.from('team').select('email')
  const exclude = new Set<string>()
  exclude.add(email.sender.email)
  const inboundAddr = (process.env.CONTACTS_INBOUND_ADDRESS || '').trim().toLowerCase()
  if (inboundAddr) exclude.add(inboundAddr)
  for (const r of teamRows || []) {
    const e = (r as { email: string | null }).email
    if (e) exclude.add(e.trim().toLowerCase())
  }

  const contacts = deriveExternalContacts(email.to, email.cc, exclude, MAX_RECIPIENTS)
  if (contacts.length === 0) {
    return NextResponse.json({ ok: true, captured: 0, ignored: 'no_external_recipients' })
  }

  const days = retentionDays()
  let captured = 0
  let created = 0
  let deduped = 0
  const toSummarize: string[] = []
  const newlyCaptured: { email: string; name: string | null; created: boolean }[] = []

  for (const contact of contacts) {
    const { data, error } = await supabase.rpc('capture_inbound_contact', {
      p_sender_team_id: senderRow.id,
      p_email: contact.email,
      p_name: contact.name,
      p_org: null,
      p_subject: subject || null,
      p_body: text || null,
      p_direction: 'outbound',
      p_occurred_at: email.occurredAt,
      p_message_id: messageId,
      p_retention_days: days,
    })
    if (error) continue
    const row = Array.isArray(data) ? data[0] : data
    if (!row) continue
    captured += 1
    if (row.contact_created) created += 1
    if (row.deduped) {
      deduped += 1
    } else {
      newlyCaptured.push({ email: contact.email, name: contact.name, created: !!row.contact_created })
      if (row.interaction_id && text) toSummarize.push(row.interaction_id as string)
    }
  }

  // Best-effort Claude summaries. Capture already succeeded regardless of outcome.
  if (toSummarize.length > 0) {
    await Promise.allSettled(
      toSummarize.map((interactionId) =>
        fetch(`${url}/functions/v1/summarize-interaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ interaction_id: interactionId, subject, text }),
        }),
      ),
    )
  }

  // Notify managers of genuinely new captures (best-effort; never blocks capture).
  if (newlyCaptured.length > 0) {
    await notifyManagers(supabase, url, key, email.sender, subject, newlyCaptured)
  }

  return NextResponse.json({ ok: true, captured, created, deduped })
}

/**
 * Email active managers that new contacts are awaiting review. Sent via the
 * existing send-notification edge function. Failures are swallowed so a flaky
 * notification can never fail the capture itself.
 */
async function notifyManagers(
  supabase: SupabaseClient,
  url: string,
  key: string,
  sender: { name: string | null; email: string },
  subject: string,
  items: { email: string; name: string | null; created: boolean }[],
): Promise<void> {
  try {
    const { data: managers } = await supabase
      .from('team')
      .select('name, email')
      .eq('role', 'Manager')
      .eq('active', true)
    const recipients = (managers || []).filter((m) => (m as { email: string | null }).email)
    if (recipients.length === 0) return

    const siteBase =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    const reviewUrl = siteBase ? `${siteBase.replace(/\/$/, '')}/dashboard/contacts/review` : '/dashboard/contacts/review'

    const count = items.length
    const lines = items
      .map((i) => `• ${i.name ? `${i.name} <${i.email}>` : i.email}${i.created ? ' (new contact)' : ''}`)
      .join('\n')
    const body =
      `${count} captured contact${count !== 1 ? 's are' : ' is'} awaiting review in Team Hub.\n\n` +
      `From: ${sender.name ? `${sender.name} <${sender.email}>` : sender.email}\n` +
      `Subject: ${subject || '(no subject)'}\n\n` +
      `${lines}\n\n` +
      `Review and approve:\n${reviewUrl}\n\n— CSDtv Team Hub`

    await Promise.allSettled(
      recipients.map((m) => {
        const member = m as { name: string | null; email: string }
        return fetch(`${url}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            type: 'contact_capture_review',
            recipientEmail: member.email,
            recipientName: (member.name || '').trim().split(/\s+/)[0] || 'there',
            subject: `New contact${count !== 1 ? 's' : ''} to review (${count})`,
            body,
            actionUrl: reviewUrl,
            actionLabel: 'Open review queue',
          }),
        })
      }),
    )
  } catch {
    /* notification failure must not affect capture */
  }
}
