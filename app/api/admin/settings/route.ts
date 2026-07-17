import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import {
  ensureAuthUserWithPassword,
  validateTeamPassword,
} from '@/lib/server/team-auth-provision'
import { startOnboardingAfterInviteIfNeeded } from '@/lib/onboarding/start-after-invite'
import { syncPrimaryPaletteFromSchoolColumns } from '@/lib/server/brand-palettes'

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
    if (action === 'set_member_password') {
      const { memberId, password: rawPassword } = payload || {}
      if (!memberId) return NextResponse.json({ error: 'Missing team member id' }, { status: 400 })

      let password: string
      try {
        password = validateTeamPassword(rawPassword)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid password' },
          { status: 400 },
        )
      }

      const { data: member, error: memberErr } = await supabase
        .from('team')
        .select('id, name, email, role, supabase_user_id, active')
        .eq('id', memberId)
        .maybeSingle()
      if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 400 })
      if (!member) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })

      const email = normalizeTeamEmail(member.email)
      let authUserId = member.supabase_user_id ?? undefined
      let authUserCreated = false

      try {
        const ensured = await ensureAuthUserWithPassword(supabase, email, password)
        authUserId = ensured.authUserId
        authUserCreated = ensured.created
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Could not set password' },
          { status: 400 },
        )
      }

      if (!member.supabase_user_id || !member.active) {
        const { error: linkErr } = await supabase
          .from('team')
          .update({ supabase_user_id: authUserId, active: true })
          .eq('id', memberId)
        if (linkErr) {
          return NextResponse.json({ error: linkErr.message }, { status: 400 })
        }
      }

      return NextResponse.json({
        success: true,
        authUserCreated,
        email,
        name: member.name,
      })
    }

    if (action === 'provision_team_member') {
      const {
        email: rawEmail,
        name: rawName,
        role,
        avatar_color,
        dashboard_profile,
        password: rawPassword,
      } = payload || {}

      let email: string
      let name: string
      let password: string
      try {
        email = normalizeTeamEmail(rawEmail)
        name = normalizeTeamName(rawName)
        password = validateTeamPassword(rawPassword)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid invite details' },
          { status: 400 },
        )
      }

      if (typeof role !== 'string' || !role.trim()) {
        return NextResponse.json({ error: 'Role is required' }, { status: 400 })
      }

      const { data: existingTeam } = await supabase
        .from('team')
        .select('id, email')
        .eq('email', email)
        .maybeSingle()
      if (existingTeam) {
        return NextResponse.json(
          { error: 'Another team member already uses that email' },
          { status: 400 },
        )
      }

      let authUserId: string
      try {
        const ensured = await ensureAuthUserWithPassword(supabase, email, password)
        authUserId = ensured.authUserId
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Could not create auth account' },
          { status: 400 },
        )
      }

      const profile =
        role === 'Production Focus' || dashboard_profile === 'production_focus'
          ? 'production_focus'
          : 'default'

      const { data: newTeam, error: teamError } = await supabase
        .from('team')
        .insert({
          name,
          email,
          role: role.trim(),
          avatar_color: typeof avatar_color === 'string' ? avatar_color : '#e8a020',
          supabase_user_id: authUserId,
          active: true,
          dashboard_profile: profile,
        })
        .select('id')
        .single()

      if (teamError) {
        return NextResponse.json({ error: teamError.message }, { status: 400 })
      }

      const ob = await startOnboardingAfterInviteIfNeeded(supabase, newTeam.id, role.trim())

      return NextResponse.json({
        success: true,
        teamId: newTeam.id,
        email,
        name,
        onboardingStarted: ob.started,
        onboardingError: ob.error,
      })
    }

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
      const { data: updated, error } = await supabase
        .from('schools')
        .update(patch)
        .eq('id', id)
        .select('code, primary_color, secondary_color, accent_color, text_color')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      // Keep the brand library's Primary palette (first 4 slots) in sync with these
      // columns, since the brand library reads/writes its own copy for its color editor.
      // Use the row's current (post-update) values, not just the patch, so untouched
      // color fields are not accidentally blanked out in the palette.
      const touchedColors = ['primary_color', 'secondary_color', 'accent_color', 'text_color'].some((k) => k in patch)
      if (touchedColors && updated?.code) {
        await syncPrimaryPaletteFromSchoolColumns(supabase, updated.code, {
          primary_color: updated.primary_color,
          secondary_color: updated.secondary_color,
          accent_color: updated.accent_color,
          text_color: updated.text_color,
        })
      }
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
