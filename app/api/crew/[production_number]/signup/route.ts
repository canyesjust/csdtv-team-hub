import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SIGNUP_WINDOW_MS = 60 * 1000
const SIGNUP_MAX_PER_WINDOW = 8
const signupAttempts = new Map<string, number[]>()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SignupRpcResult = {
  success: boolean
  status: number
  code: string
  message: string
  signed_up_by: string | null
  student_name: string | null
  student_email: string | null
  parent_name: string | null
  parent_email: string | null
  role_name: string | null
  production_title: string | null
  production_start: string | null
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const prev = signupAttempts.get(key) || []
  const recent = prev.filter(ts => now - ts < SIGNUP_WINDOW_MS)
  recent.push(now)
  signupAttempts.set(key, recent)
  return recent.length > SIGNUP_MAX_PER_WINDOW
}

async function isRateLimitedPersistent(
  supabase: any,
  key: string
): Promise<boolean> {
  const windowStart = new Date(Date.now() - SIGNUP_WINDOW_MS).toISOString()
  const { error: insertError } = await supabase
    .from('api_rate_limits')
    .insert({ scope: 'crew_signup', rate_key: key })
  if (insertError) return false

  const { count, error: countError } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('scope', 'crew_signup')
    .eq('rate_key', key)
    .gte('created_at', windowStart)
  if (countError) return false
  return (count || 0) > SIGNUP_MAX_PER_WINDOW
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ production_number: string }> }
) {
  try {
    const { production_number } = await params
    const num = parseInt(production_number)
    if (isNaN(num)) {
      return NextResponse.json({ error: 'Invalid production number' }, { status: 400 })
    }

    const body = await request.json()
    const { slot_id, student_number, signed_up_by_self } = body
    if (!slot_id || !student_number) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!UUID_RE.test(String(slot_id))) {
      return NextResponse.json({ error: 'Invalid sign-up slot' }, { status: 400 })
    }
    const trimmedNum = String(student_number).trim()
    if (!/^\d{4,20}$/.test(trimmedNum)) {
      return NextResponse.json({ error: "We couldn't process that student number. Double-check it and try again." }, { status: 400 })
    }
    const ip = getClientIp(request)
    const rateKey = `${num}:${ip}`
    const persistentLimited = await isRateLimitedPersistent(supabase, rateKey)
    if (persistentLimited || isRateLimited(rateKey)) {
      return NextResponse.json({ error: 'Too many signup attempts. Please wait a minute and try again.' }, { status: 429 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const supabase = createClient(url, key)
    const { data: rpcData, error: rpcError } = await supabase.rpc('signup_student_crew_atomic', {
      p_production_number: num,
      p_slot_id: slot_id,
      p_student_number: trimmedNum,
      p_signed_up_by_self: !!signed_up_by_self,
    })
    if (rpcError) {
      console.error('signup_student_crew_atomic rpc error:', rpcError)
      return NextResponse.json({ error: 'Could not process sign-up. Please verify server setup and try again.' }, { status: 500 })
    }
    const result = rpcData as SignupRpcResult | null
    if (!result || !result.success) {
      const status = result?.status && result.status >= 400 && result.status < 600 ? result.status : 400
      return NextResponse.json({ error: result?.message || 'Could not save your sign-up. Please try again.' }, { status })
    }

    const eventDate = result.production_start
      ? new Date(result.production_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : 'TBD'
    const roleName = result.role_name || 'Crew member'
    const studentName = result.student_name || 'Student'
    const firstName = studentName.split(' ')[0]
    const productionTitle = result.production_title || 'CSDtv Event'
    const signedUpBy = (result.signed_up_by || (signed_up_by_self ? 'self' : 'staff')).toLowerCase()
    const signedUpBySelf = signedUpBy === 'self'

    if (result.student_email) {
      fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          type: 'crew_signup_confirmation',
          recipientEmail: result.student_email,
          recipientName: firstName,
          subject: `You're signed up: ${productionTitle}`,
          body: `Hi ${firstName},\n\nYou're signed up as ${roleName} for "${productionTitle}" on ${eventDate}.\n\nWe'll send a reminder closer to the event with all the details.\n\n— CSDtv`,
        }),
      }).catch(() => { /* email failures don't block signup */ })
    }

    if (result.parent_email) {
      fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          type: 'crew_signup_parent',
          recipientEmail: result.parent_email,
          recipientName: result.parent_name?.split(' ')[0] || 'there',
          subject: `${studentName} signed up: ${productionTitle}`,
          body: `Hi,\n\n${studentName} ${signedUpBySelf ? 'signed up' : 'has been signed up'} for a CSDtv crew position:\n\nEvent: ${productionTitle}\nDate: ${eventDate}\nRole: ${roleName}\n\nIf you have questions or your student needs to cancel, please reach out to the CSDtv office.\n\n— CSDtv`,
        }),
      }).catch(() => { /* email failures don't block signup */ })
    }

    return NextResponse.json({
      success: true,
      message: `${studentName} is signed up as ${roleName}!`,
    })
  } catch (e) {
    console.error('Signup error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
