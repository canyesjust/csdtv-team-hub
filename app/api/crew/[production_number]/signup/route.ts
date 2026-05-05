import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const supabase = createClient(url, key)

    // 1. Verify production
    const { data: production } = await supabase
      .from('productions')
      .select('id, title, has_student_crew, start_datetime, production_number')
      .eq('production_number', num)
      .maybeSingle()

    if (!production || !production.has_student_crew) {
      return NextResponse.json({ error: 'Event not available' }, { status: 404 })
    }

    if (production.start_datetime && new Date(production.start_datetime).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This event has already happened' }, { status: 400 })
    }

    // 2. Verify slot exists and matches production
    const { data: slotRaw } = await supabase
      .from('crew_role_slots')
      .select('id, capacity, role_id, production_crew_id, crew_roles(name), production_crew(production_id)')
      .eq('id', slot_id)
      .maybeSingle()

    type SlotShape = {
      id: string
      capacity: number
      crew_roles: { name: string } | { name: string }[] | null
      production_crew: { production_id: string } | { production_id: string }[] | null
    }
    const slot = slotRaw as unknown as SlotShape | null
    const pcObj = slot?.production_crew && (Array.isArray(slot.production_crew) ? slot.production_crew[0] : slot.production_crew)
    const roleObj = slot?.crew_roles && (Array.isArray(slot.crew_roles) ? slot.crew_roles[0] : slot.crew_roles)

    if (!slot || pcObj?.production_id !== production.id) {
      return NextResponse.json({ error: 'Invalid sign-up slot' }, { status: 400 })
    }

    // 3. Verify student exists
    const trimmedNum = String(student_number).trim()
    const { data: student } = await supabase
      .from('students')
      .select('id, name, tier, parent_name, parent_email, email, active')
      .eq('student_number', trimmedNum)
      .maybeSingle()

    if (!student || !student.active) {
      return NextResponse.json({ error: "We couldn't find that student number. Double-check it or contact your teacher." }, { status: 404 })
    }

    // 4. Check if already signed up for this slot
    const { data: existing } = await supabase
      .from('crew_signups')
      .select('id')
      .eq('crew_role_slot_id', slot_id)
      .eq('student_id', student.id)
      .eq('cancelled', false)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `${student.name} is already signed up for this position.` }, { status: 400 })
    }

    // 5. Check slot capacity
    const { count: filled } = await supabase
      .from('crew_signups')
      .select('id', { count: 'exact', head: true })
      .eq('crew_role_slot_id', slot_id)
      .eq('cancelled', false)

    if ((filled || 0) >= slot.capacity) {
      return NextResponse.json({ error: 'This position is now full. Please refresh to see other open spots.' }, { status: 400 })
    }

    // 6. Get tier rules and check cooldown / monthly cap
    const { data: tier } = await supabase
      .from('signup_tiers')
      .select('cooldown_hours, monthly_event_cap')
      .eq('name', student.tier)
      .maybeSingle()

    if (tier) {
      if (tier.cooldown_hours > 0) {
        const cooldownAgo = new Date(Date.now() - tier.cooldown_hours * 3600 * 1000).toISOString()
        const { data: recent } = await supabase
          .from('crew_signups')
          .select('signed_up_at')
          .eq('student_id', student.id)
          .eq('cancelled', false)
          .gte('signed_up_at', cooldownAgo)
          .order('signed_up_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (recent) {
          const hoursSince = Math.round((Date.now() - new Date(recent.signed_up_at).getTime()) / 3600 / 1000)
          const hoursLeft = Math.max(1, tier.cooldown_hours - hoursSince)
          return NextResponse.json({ error: `You signed up recently. Please wait about ${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'} before signing up again.` }, { status: 400 })
        }
      }

      if (tier.monthly_event_cap !== null) {
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        const { count: monthCount } = await supabase
          .from('crew_signups')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', student.id)
          .eq('cancelled', false)
          .gte('signed_up_at', monthStart.toISOString())

        if ((monthCount || 0) >= tier.monthly_event_cap) {
          return NextResponse.json({ error: `You've reached your limit of ${tier.monthly_event_cap} event${tier.monthly_event_cap === 1 ? '' : 's'} this month.` }, { status: 400 })
        }
      }
    }

    // 7. Insert signup
    const { error: insertError } = await supabase
      .from('crew_signups')
      .insert({
        crew_role_slot_id: slot_id,
        student_id: student.id,
        signed_up_by_self: !!signed_up_by_self,
        cancelled: false,
      })

    if (insertError) {
      return NextResponse.json({ error: 'Could not save your sign-up. Please try again.' }, { status: 500 })
    }

    // 8. Send confirmation emails (non-blocking)
    const eventDate = production.start_datetime
      ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : 'TBD'
    const roleName = roleObj?.name || 'Crew member'

    if (student.email) {
      fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          type: 'crew_signup_confirmation',
          recipientEmail: student.email,
          recipientName: student.name.split(' ')[0],
          subject: `You're signed up: ${production.title}`,
          body: `Hi ${student.name.split(' ')[0]},\n\nYou're signed up as ${roleName} for "${production.title}" on ${eventDate}.\n\nWe'll send a reminder closer to the event with all the details.\n\n— CSDtv`,
        }),
      }).catch(() => { /* email failures don't block signup */ })
    }

    if (student.parent_email) {
      fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          type: 'crew_signup_parent',
          recipientEmail: student.parent_email,
          recipientName: student.parent_name?.split(' ')[0] || 'there',
          subject: `${student.name} signed up: ${production.title}`,
          body: `Hi,\n\n${student.name} ${signed_up_by_self ? 'signed up' : 'has been signed up'} for a CSDtv crew position:\n\nEvent: ${production.title}\nDate: ${eventDate}\nRole: ${roleName}\n\nIf you have questions or your student needs to cancel, please reach out to the CSDtv office.\n\n— CSDtv`,
        }),
      }).catch(() => { /* email failures don't block signup */ })
    }

    return NextResponse.json({
      success: true,
      message: `${student.name} is signed up as ${roleName}!`,
    })
  } catch (e) {
    console.error('Signup error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
