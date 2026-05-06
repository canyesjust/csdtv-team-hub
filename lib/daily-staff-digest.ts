import { escapeHtml, sanitizeEmailSubject } from '@/lib/escape-html'
import { getSchoolName } from '@/lib/schools'

export type DigestProduction = {
  id: string
  title: string
  production_number: number
  status: string | null
  start_datetime: string | null
  request_type_label: string | null
  filming_location: string | null
}

export type DigestTask = {
  id: string
  title: string
  due_date: string | null
  priority: string
  assigned_to: string | null
  productions?: { title: string; production_number: number } | null
}

export type DigestTeamMember = { id: string; name: string; email: string; role: string }

export type DigestContext = {
  tz: string
  todayKey: string
  weekEndKey: string
  longDateLabel: string
  productions: DigestProduction[]
  prodZonedDay: Map<string, string | null>
  userProductionIds: Map<string, Set<string>>
  tasksByAssignee: Map<string, DigestTask[]>
  unassignedTaskCount: number
  /** e.g. https://hub.example.com — if set, email shows full dashboard link */
  siteBase?: string
}

const SECTION_CAP = 18

export function zonedDateKeyForInstant(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function todayKeyInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Local clock hour 0–23 in `tz` for `now` (DST-aware). Used to fire cron at a local time. */
export function localHourInTimeZone(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const h = parts.find(p => p.type === 'hour')?.value
  return h !== undefined ? parseInt(h, 10) : 0
}

/** 0 = Sunday … 6 = Saturday, in `tz`. */
export function localWeekdayInTimeZone(now: Date, tz: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(now)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[short] ?? 0
}

/** Monday–Friday in `tz`. */
export function isWeekdayInTimeZone(now: Date, tz: string): boolean {
  const d = localWeekdayInTimeZone(now, tz)
  return d >= 1 && d <= 5
}

export function longDateInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now)
}

/** Calendar YYYY-MM-DD + days (UTC date math on the key, good for due_date comparisons). */
export function addCalendarDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function formatProdWhen(p: DigestProduction, tz: string): string {
  if (!p.start_datetime) return 'TBD'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(p.start_datetime))
}

function venueLine(p: DigestProduction): string {
  const v = getSchoolName(p.filming_location) || p.filming_location || ''
  return v ? ` @ ${v}` : ''
}

function productionSummaryLine(p: DigestProduction, tz: string): string {
  const type = p.request_type_label ? ` — ${p.request_type_label}` : ''
  const st = p.status ? ` [${p.status}]` : ''
  return `#${p.production_number} ${p.title}${type}${st}\n   ${formatProdWhen(p, tz)}${venueLine(p)}`
}

function productionBulletWithOptionalNote(
  p: DigestProduction,
  tz: string,
  note?: string
): string {
  const base = productionSummaryLine(p, tz)
  return note ? `• ${base}\n   ${note}` : `• ${base}`
}

function taskLine(t: DigestTask): string {
  const link = t.productions
    ? ` (prod #${t.productions.production_number})`
    : ''
  const pri = t.priority && t.priority !== 'normal' ? ` [${t.priority}]` : ''
  return `• ${t.title}${pri}${link}`
}

function capLines(lines: string[], cap: number): { text: string; rest: number } {
  if (lines.length <= cap) return { text: lines.join('\n'), rest: 0 }
  const rest = lines.length - cap
  return { text: [...lines.slice(0, cap), `…and ${rest} more in Team Hub`].join('\n'), rest }
}

function capArray<T>(items: T[], cap: number): { shown: T[]; rest: number } {
  if (items.length <= cap) return { shown: items, rest: 0 }
  return { shown: items.slice(0, cap), rest: items.length - cap }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there'
}

function dashboardHref(siteBase?: string): string {
  return siteBase && siteBase.trim()
    ? `${siteBase.replace(/\/$/, '')}/dashboard`
    : '/dashboard'
}

type DigestComputed = {
  tz: string
  longDateLabel: string
  siteBase?: string
  member: DigestTeamMember
  myProdIds: Set<string>
  teamToday: DigestProduction[]
  myToday: DigestProduction[]
  myUpcoming: DigestProduction[]
  overdue: DigestTask[]
  dueToday: DigestTask[]
  dueThisWeek: DigestTask[]
  noDue: DigestTask[]
  isManager: boolean
  unassignedTaskCount: number
}

function computeDigest(member: DigestTeamMember, ctx: DigestContext): DigestComputed {
  const {
    tz,
    todayKey,
    weekEndKey,
    longDateLabel,
    productions,
    prodZonedDay,
    userProductionIds,
    tasksByAssignee,
    unassignedTaskCount,
    siteBase,
  } = ctx
  const uid = member.id
  const myProdIds = userProductionIds.get(uid) ?? new Set<string>()

  const teamToday = productions.filter(p => {
    if (p.status === 'Abandoned') return false
    const day = prodZonedDay.get(p.id)
    return day === todayKey
  })

  const myToday = teamToday.filter(p => myProdIds.has(p.id))

  const myUpcoming = productions.filter(p => {
    if (p.status === 'Complete' || p.status === 'Abandoned') return false
    if (!myProdIds.has(p.id)) return false
    const day = prodZonedDay.get(p.id)
    if (!day) return false
    return day > todayKey && day <= weekEndKey
  })

  const tasks = tasksByAssignee.get(uid) ?? []
  const overdue = tasks.filter(t => t.due_date && t.due_date < todayKey)
  const dueToday = tasks.filter(t => t.due_date === todayKey)
  const dueThisWeek = tasks.filter(
    t => t.due_date && t.due_date > todayKey && t.due_date <= weekEndKey
  )
  const noDue = tasks.filter(t => !t.due_date)

  const isManager = (member.role || '').toLowerCase() === 'manager'

  return {
    tz,
    longDateLabel,
    siteBase,
    member,
    myProdIds,
    teamToday,
    myToday,
    myUpcoming,
    overdue,
    dueToday,
    dueThisWeek,
    noDue,
    isManager,
    unassignedTaskCount,
  }
}

function buildPlainDigest(d: DigestComputed): string {
  const { tz, longDateLabel, siteBase, member, myProdIds, teamToday, myToday, myUpcoming, overdue, dueToday, dueThisWeek, noDue, isManager, unassignedTaskCount } = d

  const sections: string[] = []
  sections.push(`CSDtv Team Hub — Daily brief for ${longDateLabel}`)
  sections.push('')
  sections.push(`Hi ${firstName(member.name)},`)
  sections.push('')
  sections.push(
    'Start with your assignments below, then scroll for everything on the team calendar today.'
  )
  sections.push('')

  sections.push('YOUR PRIORITIES (tasks & productions you\'re on)')
  sections.push('')

  sections.push('Tasks assigned to you')
  if (overdue.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0 && noDue.length === 0) {
    sections.push('• No open tasks assigned to you.')
  } else {
    if (overdue.length) {
      sections.push('Overdue:')
      const { text } = capLines(overdue.map(taskLine), SECTION_CAP)
      sections.push(text)
      sections.push('')
    }
    if (dueToday.length) {
      sections.push('Due today:')
      const { text } = capLines(dueToday.map(taskLine), SECTION_CAP)
      sections.push(text)
      sections.push('')
    }
    if (dueThisWeek.length) {
      sections.push('Due in the next 7 days:')
      const { text } = capLines(dueThisWeek.map(taskLine), SECTION_CAP)
      sections.push(text)
      sections.push('')
    }
    if (noDue.length) {
      sections.push('No due date (still open):')
      const { text } = capLines(noDue.map(taskLine), SECTION_CAP)
      sections.push(text)
      sections.push('')
    }
  }
  sections.push('')

  sections.push('Productions you\'re assigned to — today')
  if (myToday.length === 0) {
    sections.push('• None scheduled for you today.')
  } else {
    const lines = myToday.map(p => productionBulletWithOptionalNote(p, tz))
    const { text } = capLines(lines, SECTION_CAP)
    sections.push(text)
  }
  sections.push('')

  sections.push('EVERYTHING TODAY — full team calendar')
  sections.push(
    'All productions scheduled today (use this for context; your assignments are listed above).'
  )
  if (teamToday.length === 0) {
    sections.push('• Nothing on the shared calendar for today.')
  } else {
    const lines = teamToday.map(p =>
      productionBulletWithOptionalNote(
        p,
        tz,
        myProdIds.has(p.id) ? '(You\'re on this production — see Your priorities.)' : undefined
      )
    )
    const { text } = capLines(lines, SECTION_CAP)
    sections.push(text)
  }
  sections.push('')

  sections.push('YOUR UPCOMING PRODUCTIONS (next 7 days)')
  if (myUpcoming.length === 0) {
    sections.push('• None in this window.')
  } else {
    const lines = myUpcoming.map(p => `• ${productionSummaryLine(p, tz)}`)
    const { text } = capLines(lines, SECTION_CAP)
    sections.push(text)
  }
  sections.push('')

  if (isManager && unassignedTaskCount > 0) {
    sections.push('TEAM (managers)')
    sections.push(`• Open tasks with no assignee: ${unassignedTaskCount}`)
    sections.push('')
  }

  sections.push(`Open Team Hub: ${dashboardHref(siteBase)}`)
  sections.push('')
  sections.push('— CSDtv Team Hub')

  return sections.join('\n').trim()
}

function htmlTaskRow(t: DigestTask): string {
  const pri =
    t.priority && t.priority !== 'normal'
      ? ` <span style="font-size:12px;color:#b45309;font-weight:600;">${escapeHtml(t.priority)}</span>`
      : ''
  const link = t.productions
    ? ` <span style="font-size:12px;color:#64748b;">· Prod #${t.productions.production_number}</span>`
    : ''
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;line-height:1.45;">
    <span style="color:#1e6cb5;font-weight:700;">•</span>
    ${escapeHtml(t.title)}${pri}${link}
  </td></tr>`
}

function htmlTaskGroup(label: string, tasks: DigestTask[]): string {
  if (!tasks.length) return ''
  const { shown, rest } = capArray(tasks, SECTION_CAP)
  const rows = shown.map(htmlTaskRow).join('')
  const more =
    rest > 0
      ? `<tr><td style="padding:10px 0;font-size:13px;color:#64748b;font-style:italic;">…and ${rest} more in Team Hub</td></tr>`
      : ''
  return `<div style="margin-bottom:18px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">${escapeHtml(label)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}${more}</table>
  </div>`
}

function htmlProductionCard(p: DigestProduction, tz: string, note?: string): string {
  const type = p.request_type_label
    ? ` <span style="font-weight:500;color:#475569;">— ${escapeHtml(p.request_type_label)}</span>`
    : ''
  const st = p.status
    ? ` <span style="font-size:12px;color:#64748b;">${escapeHtml(p.status)}</span>`
    : ''
  const when = escapeHtml(formatProdWhen(p, tz))
  const venRaw = getSchoolName(p.filming_location) || p.filming_location || ''
  const ven = venRaw ? ` · ${escapeHtml(venRaw)}` : ''
  const noteHtml = note
    ? `<div style="font-size:12px;color:#155a99;margin-top:8px;padding:8px 10px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;">${escapeHtml(note)}</div>`
    : ''
  return `<div style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
    <div style="font-size:15px;font-weight:700;color:#0f172a;line-height:1.35;">#${p.production_number} ${escapeHtml(p.title)}${type}${st}</div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;line-height:1.4;">${when}${ven}</div>
    ${noteHtml}
  </div>`
}

function htmlProductionList(prods: DigestProduction[], tz: string, myProdIds: Set<string>): string {
  if (!prods.length) {
    return `<p style="margin:0;font-size:14px;color:#64748b;">Nothing on the shared calendar for today.</p>`
  }
  const { shown, rest } = capArray(prods, SECTION_CAP)
  const cards = shown
    .map(p =>
      htmlProductionCard(
        p,
        tz,
        myProdIds.has(p.id) ? "You're on this production — see Your priorities above." : undefined
      )
    )
    .join('')
  const more =
    rest > 0
      ? `<p style="margin:12px 0 0;font-size:13px;color:#64748b;font-style:italic;">…and ${rest} more in Team Hub</p>`
      : ''
  return cards + more
}

function buildHtmlDigest(d: DigestComputed): string {
  const {
    tz,
    longDateLabel,
    siteBase,
    member,
    myProdIds,
    teamToday,
    myToday,
    myUpcoming,
    overdue,
    dueToday,
    dueThisWeek,
    noDue,
    isManager,
    unassignedTaskCount,
  } = d
  const fn = firstName(member.name)
  const dash = dashboardHref(siteBase)

  const hasTasks = overdue.length || dueToday.length || dueThisWeek.length || noDue.length
  const tasksInner = hasTasks
    ? htmlTaskGroup('Overdue', overdue) +
      htmlTaskGroup('Due today', dueToday) +
      htmlTaskGroup('Due in the next 7 days', dueThisWeek) +
      htmlTaskGroup('No due date (still open)', noDue)
    : `<p style="margin:0;font-size:14px;color:#64748b;">No open tasks assigned to you.</p>`

  const myProdInner =
    myToday.length === 0
      ? `<p style="margin:0;font-size:14px;color:#64748b;">None scheduled for you today.</p>`
      : (() => {
          const { shown, rest } = capArray(myToday, SECTION_CAP)
          const body = shown.map(p => htmlProductionCard(p, tz)).join('')
          const more =
            rest > 0
              ? `<p style="margin:12px 0 0;font-size:13px;color:#64748b;font-style:italic;">…and ${rest} more in Team Hub</p>`
              : ''
          return body + more
        })()

  const upcomingInner =
    myUpcoming.length === 0
      ? `<p style="margin:0;font-size:14px;color:#64748b;">None in this window.</p>`
      : (() => {
          const { shown, rest } = capArray(myUpcoming, SECTION_CAP)
          const body = shown.map(p => htmlProductionCard(p, tz)).join('')
          const more =
            rest > 0
              ? `<p style="margin:12px 0 0;font-size:13px;color:#64748b;font-style:italic;">…and ${rest} more in Team Hub</p>`
              : ''
          return body + more
        })()

  const managerBlock =
    isManager && unassignedTaskCount > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#b45309;margin-bottom:6px;">Team (managers)</div>
        <div style="font-size:14px;color:#78350f;">Open tasks with no assignee: <strong>${unassignedTaskCount}</strong></div>
      </td></tr></table>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
<tr><td style="background:#1e6cb5;padding:24px 26px;">
  <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.88);">CSDtv Team Hub</div>
  <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:8px;line-height:1.2;">Daily brief</div>
  <div style="font-size:15px;color:rgba(255,255,255,0.92);margin-top:6px;">${escapeHtml(longDateLabel)}</div>
</td></tr>
<tr><td style="padding:26px 26px 8px;">
  <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#0f172a;">Hi ${escapeHtml(fn)},</p>
  <p style="margin:0 0 22px;font-size:14px;color:#64748b;line-height:1.55;">Start with <strong style="color:#0f172a;">your priorities</strong> in the highlighted section, then review the full team calendar for today.</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;"><tr><td style="background:#eff6ff;border-radius:12px;border-left:4px solid #1e6cb5;padding:20px 22px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1e6cb5;margin-bottom:14px;">Your priorities</div>
    <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:10px;">Tasks assigned to you</div>
    ${tasksInner}
    <div style="font-size:13px;font-weight:700;color:#0f172a;margin:22px 0 10px;">Productions you're assigned to — today</div>
    ${myProdInner}
  </td></tr></table>

  <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Everything today</div>
  <p style="margin:0 0 14px;font-size:13px;color:#64748b;line-height:1.5;">Full team calendar — your assignments are also summarized above.</p>
  ${htmlProductionList(teamToday, tz, myProdIds)}

  <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin:28px 0 6px;">Your upcoming productions</div>
  <p style="margin:0 0 14px;font-size:13px;color:#64748b;">Next 7 days</p>
  ${upcomingInner}

  ${managerBlock}

  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="border-radius:10px;background:#1e6cb5;">
    <a href="${escapeHtml(dash)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:inherit;">Open Team Hub</a>
  </td></tr></table>
  <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">CSDtv Team Hub · Canyons School District</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`
}

export function composeDigestForMember(
  member: DigestTeamMember,
  ctx: DigestContext
): { subject: string; body: string; html: string } {
  const d = computeDigest(member, ctx)
  const subject = sanitizeEmailSubject(`CSDtv daily brief — ${d.longDateLabel}`)
  const body = buildPlainDigest(d)
  const html = buildHtmlDigest(d)
  return { subject, body, html }
}
