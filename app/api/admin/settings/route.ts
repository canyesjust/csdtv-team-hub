import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action, payload } = await request.json()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const supabase = createClient(url, key)

  try {
    if (action === 'deactivate_member') {
      const { memberId } = payload || {}
      const { error } = await supabase.from('team').update({ active: false }).eq('id', memberId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'save_admin_email') {
      const { adminEmail } = payload || {}
      const { error } = await supabase.from('app_settings').upsert({ key: 'admin_assistant_email', value: String(adminEmail || '').trim(), updated_at: new Date().toISOString() })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'add_school') {
      const { code, name, type } = payload || {}
      const { data, error } = await supabase.from('schools').insert({ code: String(code || '').trim(), name: String(name || '').trim(), type: String(type || 'school') }).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, data })
    }

    if (action === 'update_school') {
      const { id, name } = payload || {}
      const { error } = await supabase.from('schools').update({ name: String(name || '').trim() }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'delete_school') {
      const { id } = payload || {}
      const { error } = await supabase.from('schools').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'toggle_school_type') {
      const { id, type } = payload || {}
      const { error } = await supabase.from('schools').update({ type }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'save_template') {
      const { id, label, subject, body } = payload || {}
      const { error } = await supabase.from('email_templates').update({ label, subject, body, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'create_template') {
      const { template_key, label, subject, body, sort_order } = payload || {}
      const { data, error } = await supabase.from('email_templates').insert({ template_key, label, subject, body, sort_order, active: true }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, data })
    }

    if (action === 'delete_template') {
      const { id } = payload || {}
      const { error } = await supabase.from('email_templates').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'swap_template_order') {
      const { aId, aSort, bId, bSort } = payload || {}
      const [aRes, bRes] = await Promise.all([
        supabase.from('email_templates').update({ sort_order: bSort }).eq('id', aId),
        supabase.from('email_templates').update({ sort_order: aSort }).eq('id', bId),
      ])
      if (aRes.error || bRes.error) return NextResponse.json({ error: aRes.error?.message || bRes.error?.message || 'Failed to reorder templates' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'save_tier') {
      const { id, cooldown_hours, monthly_event_cap, description } = payload || {}
      const { error } = await supabase.from('signup_tiers').update({ cooldown_hours, monthly_event_cap, description }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
