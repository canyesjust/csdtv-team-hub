import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ production_number: string }> }
) {
  const { production_number } = await params
  const num = parseInt(production_number)
  if (isNaN(num)) {
    return NextResponse.json({ error: 'Invalid production number' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const supabase = createClient(url, key)

  const { data: production } = await supabase
    .from('productions')
    .select('id, production_number, title, start_datetime, filming_location, school_department, has_student_crew')
    .eq('production_number', num)
    .maybeSingle()

  if (!production) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (!production.has_student_crew) {
    return NextResponse.json({ error: 'This event is not currently accepting sign-ups' }, { status: 404 })
  }

  const isPast = production.start_datetime
    ? new Date(production.start_datetime).getTime() < Date.now()
    : false

  const { data: crew } = await supabase
    .from('production_crew')
    .select('*')
    .eq('production_id', production.id)
    .maybeSingle()

  if (!crew) {
    return NextResponse.json({ error: 'Sign-ups not yet configured for this event' }, { status: 404 })
  }

  const { data: slotsRaw } = await supabase
    .from('crew_role_slots')
    .select('id, capacity, call_time, end_time, notes, sort_order, role_id, crew_roles(name)')
    .eq('production_crew_id', crew.id)
    .order('sort_order')

  const slots: Array<{
    id: string
    role_name: string
    capacity: number
    call_time: string | null
    end_time: string | null
    notes: string | null
    signups: Array<{ student_name: string | null; signed_up_by_self: boolean }>
  }> = []

  if (slotsRaw && slotsRaw.length > 0) {
    const slotIds = slotsRaw.map(s => s.id)
    const { data: signupsRaw } = await supabase
      .from('crew_signups')
      .select('crew_role_slot_id, signed_up_by_self, students(name)')
      .in('crew_role_slot_id', slotIds)
      .eq('cancelled', false)

    type SignupRow = { crew_role_slot_id: string; signed_up_by_self: boolean | null; students: { name: string } | { name: string }[] | null }
    type SlotRow = { id: string; capacity: number; call_time: string | null; end_time: string | null; notes: string | null; crew_roles: { name: string } | { name: string }[] | null }

    for (const slot of slotsRaw as unknown as SlotRow[]) {
      const slotSignups = ((signupsRaw || []) as unknown as SignupRow[])
        .filter(s => s.crew_role_slot_id === slot.id)
        .map(s => {
          const studentObj = Array.isArray(s.students) ? s.students[0] : s.students
          return {
            student_name: crew.hide_names_on_public ? null : (studentObj?.name || null),
            signed_up_by_self: !!s.signed_up_by_self,
          }
        })

      const roleObj = Array.isArray(slot.crew_roles) ? slot.crew_roles[0] : slot.crew_roles

      slots.push({
        id: slot.id,
        role_name: roleObj?.name || 'Crew',
        capacity: slot.capacity,
        call_time: slot.call_time,
        end_time: slot.end_time,
        notes: slot.notes,
        signups: slotSignups,
      })
    }
  }

  return NextResponse.json({
    production: {
      id: production.id,
      production_number: production.production_number,
      title: production.title,
      start_datetime: production.start_datetime,
      filming_location: production.filming_location,
      school_department: production.school_department,
    },
    crew: {
      display_title: crew.display_title,
      call_time: crew.call_time,
      event_start_time: crew.event_start_time,
      end_time: crew.end_time,
      meeting_location: crew.meeting_location,
      what_youll_do: crew.what_youll_do,
      food: crew.food,
      what_to_wear: crew.what_to_wear,
      transportation_note: crew.transportation_note,
      requirements: crew.requirements,
      hide_names_on_public: crew.hide_names_on_public,
    },
    slots,
    is_past: isPast,
    is_disabled: !production.has_student_crew,
  })
}
