import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public list of productions that are open for student crew sign-up.
// Read-only, served via the service-role client (same pattern as the
// single-event route). Only upcoming, crew-enabled, configured events show.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const supabase = createClient(url, key)
  const nowIso = new Date().toISOString()

  // Upcoming crew-enabled productions (undated events are treated as upcoming).
  const { data: prods } = await supabase
    .from('productions')
    .select('id, production_number, title, start_datetime, filming_location')
    .eq('has_student_crew', true)
    .or(`start_datetime.gte.${nowIso},start_datetime.is.null`)
    .order('start_datetime', { ascending: true, nullsFirst: false })

  if (!prods || prods.length === 0) {
    return NextResponse.json({ events: [] })
  }

  const prodIds = prods.map(p => p.id)

  const { data: crews } = await supabase
    .from('production_crew')
    .select('id, production_id, display_title, meeting_location')
    .in('production_id', prodIds)

  const crewByProd = new Map<string, { id: string; display_title: string | null; meeting_location: string | null }>()
  const crewIds: string[] = []
  for (const c of crews || []) {
    crewByProd.set(c.production_id, { id: c.id, display_title: c.display_title, meeting_location: c.meeting_location })
    crewIds.push(c.id)
  }

  // Capacity per crew, and the slot ids we need signup counts for.
  const capacityByCrew = new Map<string, number>()
  const crewBySlot = new Map<string, string>()
  if (crewIds.length > 0) {
    const { data: slots } = await supabase
      .from('crew_role_slots')
      .select('id, production_crew_id, capacity')
      .in('production_crew_id', crewIds)
    for (const s of slots || []) {
      capacityByCrew.set(s.production_crew_id, (capacityByCrew.get(s.production_crew_id) || 0) + (s.capacity || 0))
      crewBySlot.set(s.id, s.production_crew_id)
    }
  }

  // Filled count per crew.
  const filledByCrew = new Map<string, number>()
  const slotIds = Array.from(crewBySlot.keys())
  if (slotIds.length > 0) {
    const { data: signups } = await supabase
      .from('crew_signups')
      .select('crew_role_slot_id')
      .in('crew_role_slot_id', slotIds)
    for (const su of signups || []) {
      const crewId = crewBySlot.get(su.crew_role_slot_id)
      if (crewId) filledByCrew.set(crewId, (filledByCrew.get(crewId) || 0) + 1)
    }
  }

  const events = prods
    .map(p => {
      const crew = crewByProd.get(p.id)
      if (!crew) return null // crew enabled but not yet configured — hide it
      const capacity = capacityByCrew.get(crew.id) || 0
      const filled = filledByCrew.get(crew.id) || 0
      return {
        production_number: p.production_number,
        title: crew.display_title || p.title,
        start_datetime: p.start_datetime,
        location: crew.meeting_location || p.filming_location || null,
        total_capacity: capacity,
        total_filled: filled,
        open_spots: Math.max(0, capacity - filled),
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  return NextResponse.json({ events })
}
