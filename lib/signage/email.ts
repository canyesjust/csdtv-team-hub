import { sanitizeEmailSubject } from '@/lib/escape-html'
import { CIC_REVIEW_URL, CIC_SUBMIT_URL } from '@/lib/signage/constants'

function notificationUrl(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url, key }
}

export async function emailSignageApprovers(body: string): Promise<void> {
  const cfg = notificationUrl()
  if (!cfg) return

  const { createClient } = await import('@supabase/supabase-js')
  const service = createClient(cfg.url, cfg.key)
  const { data: approvers } = await service
    .from('team')
    .select('email, name')
    .eq('signage_approver', true)
    .eq('active', true)

  for (const person of approvers ?? []) {
    if (!person.email?.trim()) continue
    const firstName = person.name?.trim().split(/\s+/)[0] || 'there'
    fetch(`${cfg.url}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        type: 'signage_submission_new',
        recipientEmail: person.email.trim(),
        recipientName: firstName,
        subject: sanitizeEmailSubject('New signage image awaiting review'),
        body,
      }),
    }).catch(() => {})
  }
}

export function buildNewSubmissionEmailBody(fields: {
  submitterName: string
  submitterEmail: string
  title: string | null
  startDate: string
  endDate: string
  requestedNote: string | null
  centerName?: string | null
}): string {
  const center = fields.centerName?.trim() || 'Canyons School District'
  return [
    `A new item was submitted for ${center} digital signage.`,
    '',
    `Submitter: ${fields.submitterName}`,
    `Email: ${fields.submitterEmail}`,
    fields.title ? `Title: ${fields.title}` : null,
    `Requested dates: ${fields.startDate} to ${fields.endDate}`,
    fields.requestedNote ? `Where/when note: ${fields.requestedNote}` : null,
    '',
    `Review it: ${CIC_REVIEW_URL}`,
  ].filter((line): line is string => line != null).join('\n')
}

export async function emailSignageSubmitterDecision(fields: {
  email: string
  name: string
  approved: boolean
  title: string | null
  rejectReason?: string | null
  centerName?: string | null
}): Promise<void> {
  const cfg = notificationUrl()
  if (!cfg || !fields.email.trim()) return

  const firstName = fields.name.trim().split(/\s+/)[0] || 'there'
  const center = fields.centerName?.trim() || 'Canyons School District'
  const type = fields.approved ? 'signage_decision_approved' : 'signage_decision_rejected'
  const subject = fields.approved
    ? 'Your signage submission was approved'
    : 'Your signage submission was not approved'
  const body = fields.approved
    ? [
        `Hi ${firstName},`,
        '',
        `Your signage submission${fields.title ? ` "${fields.title}"` : ''} was approved and will appear on the requested screens during its scheduled dates.`,
        '',
        `— ${center}`,
      ].join('\n')
    : [
        `Hi ${firstName},`,
        '',
        `Your signage submission${fields.title ? ` "${fields.title}"` : ''} was not approved.`,
        fields.rejectReason ? `\nReason: ${fields.rejectReason}` : '',
        '',
        `You may submit another item at ${CIC_SUBMIT_URL}`,
        '',
        `— ${center}`,
      ].join('\n')

  fetch(`${cfg.url}/functions/v1/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify({
      type,
      recipientEmail: fields.email.trim(),
      recipientName: firstName,
      subject: sanitizeEmailSubject(subject),
      body,
    }),
  }).catch(() => {})
}
