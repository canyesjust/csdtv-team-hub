import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeEmailSubject } from '@/lib/escape-html'

/** Minimal production fields for status request emails + updates. */
export type ProductionStatusWire = {
  id: string
  production_number: number
  title: string
  request_type_label: string | null
  type: string | null
  organizer_name: string | null
  start_datetime: string | null
}

function formatProdLongDate(startDatetime: string | null): string {
  if (!startDatetime) return 'N/A'
  return new Date(startDatetime).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

async function adminAssistantEmail(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_assistant_email').single()
  return String(data?.value || '').trim()
}

/**
 * Notify admin + user, set hub status to In Progress, log activity.
 * Used from productions list quick actions and production detail.
 */
export async function hubRequestProductionInProgress(opts: {
  supabase: SupabaseClient
  accessToken: string
  production: ProductionStatusWire
  currentUserEmail: string
  currentUserId: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, accessToken, production, currentUserEmail, currentUserId } = opts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return { ok: false, message: 'Missing NEXT_PUBLIC_SUPABASE_URL' }

  const adminEmail = await adminAssistantEmail(supabase)
  const recipients = [currentUserEmail, adminEmail].filter(Boolean)
  const prodTitle = `#${production.production_number} ${production.title}`
  const body = `Production ${prodTitle} is now in progress in CSDtv Team Hub.\n\nPlease update this production's status to "In Progress" in the district productions system.\n\nType: ${production.request_type_label || 'Unknown'}\nOrganizer: ${production.organizer_name || 'N/A'}\nDate: ${formatProdLongDate(production.start_datetime)}\n\n— CSDtv Team Hub`

  try {
    for (const email of recipients) {
      await fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          type: 'production_in_progress',
          recipientEmail: email,
          subject: sanitizeEmailSubject(`Production in progress: ${prodTitle}`),
          body,
        }),
      })
    }
  } catch {
    return { ok: false, message: 'Failed to send notification email' }
  }

  const { error: upErr } = await supabase.from('productions').update({ status: 'In Progress' }).eq('id', production.id)
  if (upErr) return { ok: false, message: upErr.message }

  const { error: actErr } = await supabase.from('production_activity').insert({
    production_id: production.id,
    user_id: currentUserId,
    action: 'requested_in_progress',
    detail: 'Marked In Progress in Team Hub — email sent to admin',
  })
  if (actErr) return { ok: false, message: actErr.message }

  return { ok: true }
}

/**
 * Notify admin + user, set hub status to Complete Requested, log activity.
 */
export async function hubRequestProductionComplete(opts: {
  supabase: SupabaseClient
  accessToken: string
  production: ProductionStatusWire
  currentUserEmail: string
  currentUserId: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, accessToken, production, currentUserEmail, currentUserId } = opts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return { ok: false, message: 'Missing NEXT_PUBLIC_SUPABASE_URL' }

  const adminEmail = await adminAssistantEmail(supabase)
  const recipients = [currentUserEmail, adminEmail].filter(Boolean)
  const prodTitle = `#${production.production_number} ${production.title}`
  const body = `Production ${prodTitle} is marked as "Complete Requested" in CSDtv Team Hub.\n\nPlease mark this production as complete in the district productions system.\n\nType: ${production.request_type_label || 'Unknown'}\nOrganizer: ${production.organizer_name || 'N/A'}\nDate: ${formatProdLongDate(production.start_datetime)}\n\n— CSDtv Team Hub`

  try {
    for (const email of recipients) {
      await fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          type: 'production_complete',
          recipientEmail: email,
          subject: sanitizeEmailSubject(`Complete requested: ${prodTitle}`),
          body,
        }),
      })
    }
  } catch {
    return { ok: false, message: 'Failed to send notification email' }
  }

  const { error: statusErr } = await supabase.from('productions').update({ status: 'Complete Requested' }).eq('id', production.id)
  if (statusErr) return { ok: false, message: statusErr.message }

  const { error: actErr } = await supabase.from('production_activity').insert({
    production_id: production.id,
    user_id: currentUserId,
    action: 'requested_complete',
    detail: 'Requested completion — email sent to admin',
  })
  if (actErr) return { ok: false, message: actErr.message }

  return { ok: true }
}
