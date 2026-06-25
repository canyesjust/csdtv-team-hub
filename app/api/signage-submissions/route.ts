import { NextRequest, NextResponse } from 'next/server'
import { sanitizeEmailSubject } from '@/lib/escape-html'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { SIGNAGE_REVIEW_URL } from '@/lib/signage-submissions'
import { checkRateLimit } from '@/lib/server/rate-limit'

export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX_PER_WINDOW = 8
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function extFromMime(mime: string): string | null {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/jpeg') return 'jpg'
  return null
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(request, { scope: 'signage_submissions', max: RATE_MAX_PER_WINDOW, windowMs: RATE_WINDOW_MS })
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many submissions. Please wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const service = getServiceSupabaseClient()
    if (!service) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const form = await request.formData()
    const submitterName = String(form.get('submitter_name') ?? '').trim()
    const submitterEmail = String(form.get('submitter_email') ?? '').trim().toLowerCase()
    const department = String(form.get('department') ?? '').trim()
    const caption = String(form.get('caption') ?? '').trim()
    const startDate = String(form.get('start_date') ?? '').trim()
    const endDate = String(form.get('end_date') ?? '').trim()
    const notes = String(form.get('notes') ?? '').trim()
    const termsAccepted = String(form.get('terms_accepted') ?? '')
    const image = form.get('image')

    if (!submitterName || !submitterEmail || !startDate || !endDate) {
      return NextResponse.json({ error: 'Name, email, and run dates are required.' }, { status: 400 })
    }
    if (!isValidEmail(submitterEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    if (termsAccepted !== 'true') {
      return NextResponse.json({ error: 'You must accept the terms before submitting.' }, { status: 400 })
    }
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'Use valid start and end dates.' }, { status: 400 })
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'Start date must be on or before the end date.' }, { status: 400 })
    }
    if (endDate < todayUtc()) {
      return NextResponse.json({ error: 'End date must be today or later.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(image.type)) {
      return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP.' }, { status: 400 })
    }
    if (image.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 10 MB or smaller.' }, { status: 400 })
    }

    const ext = extFromMime(image.type)
    if (!ext) {
      return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP.' }, { status: 400 })
    }

    const path = `${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await image.arrayBuffer())
    const { error: uploadError } = await service.storage
      .from('signage-submissions')
      .upload(path, buffer, { contentType: image.type, upsert: false })

    if (uploadError) {
      console.error('signage upload error:', uploadError)
      return NextResponse.json({ error: 'Could not upload image. Please try again.' }, { status: 500 })
    }

    const { error: insertError } = await service.from('signage_submissions').insert({
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      department: department || null,
      caption: caption || null,
      image_path: path,
      start_date: startDate,
      end_date: endDate,
      notes: notes || null,
      status: 'pending',
      terms_accepted_at: new Date().toISOString(),
    })

    if (insertError) {
      await service.storage.from('signage-submissions').remove([path]).catch(() => {})
      console.error('signage insert error:', insertError)
      return NextResponse.json({ error: 'Could not save submission. Please try again.' }, { status: 500 })
    }

    try {
      const { data: managers } = await service
        .from('team')
        .select('email, name')
        .eq('role', 'Manager')
        .eq('active', true)

      const bodyLines = [
        'A new image was submitted for the CSDtv office digital signage.',
        '',
        `Submitter: ${submitterName}`,
        `Email: ${submitterEmail}`,
        department ? `Department: ${department}` : null,
        caption ? `Caption: ${caption}` : null,
        `Run window: ${startDate} to ${endDate}`,
        '',
        `Review it: ${SIGNAGE_REVIEW_URL}`,
      ].filter((line): line is string => line != null)

      for (const manager of managers ?? []) {
        if (!manager.email?.trim()) continue
        const firstName = manager.name?.trim().split(/\s+/)[0] || 'there'
        fetch(`${url}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            type: 'signage_submission_new',
            recipientEmail: manager.email.trim(),
            recipientName: firstName,
            subject: sanitizeEmailSubject('New signage image awaiting review'),
            body: bodyLines.join('\n'),
          }),
        }).catch(() => {})
      }
    } catch {
      /* email failures do not block */
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('signage submit error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
