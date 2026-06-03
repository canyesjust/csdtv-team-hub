import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'

function normalizeOptionalHex(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  const h = s.startsWith('#') ? s : `#${s}`
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) throw new Error('invalid_hex')
  return h.toLowerCase()
}

function normalizeTeamEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address')
  return email
}

function normalizeTeamName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) throw new Error('Name is required')
  return name
}

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

    if (action === 'update_team_member') {
      const { memberId, name: rawName, email: rawEmail } = payload || {}
      if (!memberId) return NextResponse.json({ error: 'Missing team member id' }, { status: 400 })

      let name: string
      let email: string
      try {
        name = normalizeTeamName(rawName)
        email = normalizeTeamEmail(rawEmail)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid name or email' },
          { status: 400 },
        )
      }

      const { data: member, error: memberErr } = await supabase
        .from('team')
        .select('id, email, supabase_user_id')
        .eq('id', memberId)
        .maybeSingle()
      if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 400 })
      if (!member) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })

      const emailChanged = member.email.trim().toLowerCase() !== email

      if (emailChanged) {
        const { data: conflict } = await supabase
          .from('team')
          .select('id')
          .eq('email', email)
          .neq('id', memberId)
          .maybeSingle()
        if (conflict) {
          return NextResponse.json(
            { error: 'Another team member already uses that email' },
            { status: 400 },
          )
        }
      }

      if (emailChanged && member.supabase_user_id) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(member.supabase_user_id, {
          email,
          email_confirm: true,
        })
        if (authErr) {
          return NextResponse.json(
            { error: authErr.message || 'Could not update sign-in email' },
            { status: 400 },
          )
        }
      }

      const { error: teamErr } = await supabase
        .from('team')
        .update({ name, email })
        .eq('id', memberId)
      if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 400 })

      return NextResponse.json({
        success: true,
        authEmailUpdated: emailChanged && !!member.supabase_user_id,
      })
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
      const p = payload || {}
      const { id, name, primary_color, secondary_color, accent_color, text_color, mascot } = p
      if (!id) return NextResponse.json({ error: 'Missing school id' }, { status: 400 })
      const patch: Record<string, string | null> = {}
      if (typeof name === 'string') patch.name = String(name || '').trim()
      try {
        if ('primary_color' in p) patch.primary_color = normalizeOptionalHex(primary_color)
        if ('secondary_color' in p) patch.secondary_color = normalizeOptionalHex(secondary_color)
        if ('accent_color' in p) patch.accent_color = normalizeOptionalHex(accent_color)
        if ('text_color' in p) patch.text_color = normalizeOptionalHex(text_color)
      } catch {
        return NextResponse.json({ error: 'Invalid color (use #RGB or #RRGGBB, or leave blank)' }, { status: 400 })
      }
      if ('mascot' in p) {
        const m = typeof mascot === 'string' ? mascot.trim() : ''
        patch.mascot = m || null
      }
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      const { error } = await supabase.from('schools').update(patch).eq('id', id)
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
