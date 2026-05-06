import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addCalendarDaysToKey,
  longDateInTz,
  todayKeyInTz,
  zonedDateKeyForInstant,
  type DigestContext,
  type DigestProduction,
  type DigestTask,
  type DigestTeamMember,
} from '@/lib/daily-staff-digest'

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export type DailyDigestLoadResult =
  | { ok: true; ctx: DigestContext; team: DigestTeamMember[] }
  | { ok: false; error: string }

/** Shared data load for cron send and Settings preview (service-role client). */
export async function loadDailyDigestContext(
  supabase: SupabaseClient,
  options?: { now?: Date }
): Promise<DailyDigestLoadResult> {
  const tz = process.env.DAILY_DIGEST_TIMEZONE || 'America/Denver'
  const now = options?.now ?? new Date()
  const todayKey = todayKeyInTz(now, tz)
  const weekEndKey = addCalendarDaysToKey(todayKey, 7)
  const longDateLabel = longDateInTz(now, tz)

  const windowStart = new Date(now.getTime() - 2 * 86400000).toISOString()
  const windowEnd = new Date(now.getTime() + 16 * 86400000).toISOString()

  const { data: allActiveRows, error: teamErr } = await supabase
    .from('team')
    .select('id, name, email, role')
    .eq('active', true)

  if (teamErr) return { ok: false, error: teamErr.message }

  const team: DigestTeamMember[] = (allActiveRows || [])
    .filter((r: { email: string | null }) => String(r.email || '').trim())
    .map((r: { id: string; name: string; email: string; role: string | null }) => ({
      id: r.id,
      name: r.name,
      email: String(r.email).trim(),
      role: r.role || '',
    }))

  const taskUserIds = (allActiveRows || []).map((r: { id: string }) => r.id)

  const { data: prods, error: prodErr } = await supabase
    .from('productions')
    .select(
      'id, title, production_number, status, start_datetime, request_type_label, filming_location'
    )
    .not('status', 'eq', 'Abandoned')
    .gte('start_datetime', windowStart)
    .lte('start_datetime', windowEnd)
    .order('start_datetime', { ascending: true })

  if (prodErr) return { ok: false, error: prodErr.message }

  const productions = (prods || []) as DigestProduction[]
  const prodIds = productions.map(p => p.id)

  const prodZonedDay = new Map<string, string | null>()
  for (const p of productions) {
    prodZonedDay.set(p.id, p.start_datetime ? zonedDateKeyForInstant(p.start_datetime, tz) : null)
  }

  const userProductionIds = new Map<string, Set<string>>()
  if (prodIds.length > 0) {
    for (const part of chunk(prodIds, 120)) {
      const { data: pm, error: pmErr } = await supabase
        .from('production_members')
        .select('production_id, user_id')
        .in('production_id', part)
      if (pmErr) return { ok: false, error: pmErr.message }
      for (const row of pm || []) {
        const pid = row.production_id as string
        const uid = row.user_id as string
        if (!userProductionIds.has(uid)) userProductionIds.set(uid, new Set())
        userProductionIds.get(uid)!.add(pid)
      }
    }
  }

  const tasksByAssignee = new Map<string, DigestTask[]>()
  type RawTaskRow = {
    id: string
    title: string
    due_date: string | null
    priority: string
    assigned_to: string | null
    productions?: { title: string; production_number: number } | { title: string; production_number: number }[] | null
  }
  for (const part of chunk(taskUserIds, 80)) {
    const { data: taskRows, error: taskErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, status, assigned_to, productions(title, production_number)')
      .neq('status', 'complete')
      .in('assigned_to', part)
    if (taskErr) return { ok: false, error: taskErr.message }
    for (const row of (taskRows || []) as RawTaskRow[]) {
      const prod = Array.isArray(row.productions) ? row.productions[0] || null : row.productions || null
      const t: DigestTask = {
        id: row.id,
        title: row.title,
        due_date: row.due_date,
        priority: row.priority,
        assigned_to: row.assigned_to,
        productions: prod ? { title: prod.title, production_number: prod.production_number } : null,
      }
      const aid = t.assigned_to
      if (!aid) continue
      if (!tasksByAssignee.has(aid)) tasksByAssignee.set(aid, [])
      tasksByAssignee.get(aid)!.push(t)
    }
  }

  const { count: unassignedCount } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'complete')
    .is('assigned_to', null)

  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

  const ctx: DigestContext = {
    tz,
    todayKey,
    weekEndKey,
    longDateLabel,
    productions,
    prodZonedDay,
    userProductionIds,
    tasksByAssignee,
    unassignedTaskCount: unassignedCount || 0,
    siteBase,
  }

  return { ok: true, ctx, team }
}
