'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { isStudentInternRole } from '@/lib/roles'
import { mergeAssigneeIds, taskIsUnassigned } from '@/lib/task-assignments'

interface TaskRow {
  id: string
  title: string
  priority: string
  due_date: string | null
  assigned_to: string | null
  assignee_ids: string[]
  production_id: string | null
  purchase_request: boolean
  status?: string | null
  productions?: { production_number: number; title: string } | null
}

interface TeamMember {
  id: string
  name: string
  avatar_color: string
  role?: string | null
}

function normalizeProductionStatus(status: string | null | undefined): string {
  return status ? status.replace(/^\d+\s*-\s*/, '') : ''
}

interface ProductionMemberRow {
  production_id: string
  user_id: string
  productions?: {
    production_number: number
    title: string
    start_datetime: string | null
    status: string | null
    request_type_label: string | null
  } | null
}

interface InProgressProduction {
  id: string
  production_number: number
  title: string
  start_datetime: string | null
  request_type_label: string | null
}

function daysFromToday(dateStr: string | null): number | null {
  if (!dateStr) return null
  const due = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ms = due.getTime() - today.getTime()
  return Math.round(ms / 86400000)
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return (parts[0] || '?').slice(0, 2).toUpperCase()
}

function normalizeTaskStatus(status: string | null | undefined): string {
  return (status || '').toLowerCase().trim()
}

/** Actively being worked — show with gold dot on person cards. */
function isActiveWorkTaskStatus(status: string | null | undefined): boolean {
  const s = normalizeTaskStatus(status)
  return s === 'in progress' || s === 'in review'
}

const STAFF_GRID_COLUMNS = 3
const STUDENT_INTERN_GRID_COLUMNS = 4

type PersonCardData = {
  member: TeamMember
  personTasks: TaskRow[]
  personOverdue: number
  personInProgressProds: ProductionMemberRow[]
  personUpcomingProds: ProductionMemberRow[]
  next5DayProds: ProductionMemberRow[]
  checklistOpen: number
}

interface PersonCardProps {
  card: PersonCardData
  fs: {
    staffName: number
    staffStat: number
    taskLine: number
  }
  fit: (max: number, min: number, penalty?: number) => number
  cardBg: string
  border: string
  muted: string
  emptyMuted: string
  maxListedTasks: number
  /** When true, also show upcoming (not-yet-in-progress) productions the person is on. */
  showUpcomingProds?: boolean
}

function PersonCard({ card, fs, fit, cardBg, border, muted, emptyMuted, maxListedTasks, showUpcomingProds = false }: PersonCardProps) {
  const { member, personTasks, personInProgressProds } = card
  const activeTasks = personTasks.filter(t => isActiveWorkTaskStatus(t.status))
  const openTasks = personTasks.filter(t => !isActiveWorkTaskStatus(t.status))
  const hasTasks = personTasks.length > 0
  const inProgressProds = personInProgressProds
  const upcomingProds = showUpcomingProds ? card.personUpcomingProds : []
  const prodEntries: { pm: ProductionMemberRow; upcoming: boolean }[] = [
    ...inProgressProds.map(pm => ({ pm, upcoming: false })),
    ...upcomingProds.map(pm => ({ pm, upcoming: true })),
  ]
  const hasProds = prodEntries.length > 0
  const slots = Math.max(4, maxListedTasks)
  const shownActive = activeTasks.slice(0, slots)
  const openSlots = Math.max(0, slots - shownActive.length)
  const shownOpen = openTasks.slice(0, openSlots)
  const hiddenTaskCount = personTasks.length - shownActive.length - shownOpen.length
  const prodSlots = Math.max(4, maxListedTasks)
  const shownProds = prodEntries.slice(0, prodSlots)
  const hiddenProdCount = prodEntries.length - shownProds.length

  const chipFs = fit(12, 10)
  const chip = (bg: string, color: string, bd: string): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 9px',
    borderRadius: '999px',
    background: bg,
    color,
    border: `1px solid ${bd}`,
    fontSize: `${chipFs}px`,
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  })

  const renderTaskRow = (t: TaskRow, active: boolean) => {
    const d = daysFromToday(t.due_date)
    const overdue = d !== null && d < 0
    const dueToday = d === 0
    const dueSoon = d !== null && d > 0 && d <= 2
    let dueBadge: { label: string; color: string; bg: string } | null = null
    if (overdue) dueBadge = { label: `${Math.abs(d!)}d`, color: '#fca5a5', bg: 'rgba(239,68,68,0.18)' }
    else if (dueToday) dueBadge = { label: 'today', color: '#fcd9a5', bg: 'rgba(240,160,60,0.18)' }
    else if (dueSoon) dueBadge = { label: `${d}d`, color: '#cfe0ff', bg: 'rgba(255,255,255,0.08)' }
    return (
      <div
        key={t.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 9px',
          borderRadius: '6px',
          background: active ? 'rgba(240,192,96,0.12)' : 'rgba(255,255,255,0.04)',
          borderLeft: `3px solid ${active ? '#f0c060' : 'rgba(255,255,255,0.14)'}`,
          minWidth: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: `${fs.taskLine}px`,
            color: active ? '#f5e2b0' : '#c3d2ee',
            fontWeight: active ? 700 : 500,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t.title}
        </span>
        {dueBadge && (
          <span
            style={{
              flexShrink: 0,
              fontSize: `${fit(14, 12)}px`,
              fontWeight: 800,
              color: dueBadge.color,
              background: dueBadge.bg,
              borderRadius: '5px',
              padding: '1px 6px',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
            }}
          >
            {dueBadge.label}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        borderRadius: '8px',
        padding: '12px 14px',
        background: cardBg,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexShrink: 0 }}>
        <div
          style={{
            width: `${fit(28, 24)}px`,
            height: `${fit(28, 24)}px`,
            borderRadius: '999px',
            background: member.avatar_color,
            color: '#0a0f1e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${fit(11, 10)}px`,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials(member.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: `${fs.staffName}px`, fontWeight: 800, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.name}
          </p>
          {hasTasks && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
              {activeTasks.length > 0 && (
                <span style={chip('rgba(240,192,96,0.18)', '#f5d78e', 'rgba(240,192,96,0.5)')}>
                  {activeTasks.length} active
                </span>
              )}
              {openTasks.length > 0 && (
                <span style={chip('rgba(255,255,255,0.06)', muted, border)}>
                  {openTasks.length} open
                </span>
              )}
              {card.personOverdue > 0 && (
                <span style={chip('rgba(239,68,68,0.16)', '#fca5a5', 'rgba(239,68,68,0.5)')}>
                  {card.personOverdue} overdue
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        {hasTasks ? (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: hasProds ? '0 1 auto' : 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minHeight: 0, overflow: 'hidden', flex: hasProds ? undefined : 1 }}>
              {shownActive.map(t => renderTaskRow(t, true))}
              {shownOpen.map(t => renderTaskRow(t, false))}
              {hiddenTaskCount > 0 && (
                <p style={{ margin: '2px 0 0', fontSize: `${fs.taskLine}px`, color: muted, lineHeight: 1.35 }}>
                  +{hiddenTaskCount} more
                </p>
              )}
            </div>
          </div>
        ) : !hasProds ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: '6px',
              minHeight: `${fit(40, 32)}px`,
            }}
          >
            <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: emptyMuted, fontWeight: 500 }}>
              No tasks assigned
            </p>
          </div>
        ) : null}

        {hasProds && (
          <div
            style={{
              marginTop: hasTasks ? '10px' : 0,
              paddingTop: hasTasks ? '10px' : 0,
              borderTop: hasTasks ? '1px solid rgba(240,192,96,0.25)' : 'none',
              flexShrink: 0,
              minHeight: 0,
              overflow: 'hidden',
              flex: hasTasks ? undefined : 1,
            }}
          >
            <p style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '7px', fontSize: `${fs.staffStat}px`, color: '#f0c060', fontWeight: 800, lineHeight: 1.2, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {inProgressProds.length > 0 && <span style={{ fontSize: '0.7em' }}>●</span>}
              {[
                inProgressProds.length > 0 ? `${inProgressProds.length} in progress` : null,
                upcomingProds.length > 0 ? `${upcomingProds.length} upcoming` : null,
              ].filter(Boolean).join(' · ')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
              {shownProds.map(({ pm, upcoming }) => {
                const dateLabel = upcoming ? shortDate(pm.productions?.start_datetime ?? null) : null
                return (
                <div
                  key={`prod-${pm.production_id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: `${fit(14, 12)}px`,
                      fontWeight: 800,
                      color: upcoming ? '#cfe0ff' : '#0a0f1e',
                      background: upcoming ? 'rgba(255,255,255,0.10)' : '#f0c060',
                      borderRadius: '5px',
                      padding: '1px 7px',
                      lineHeight: 1.3,
                    }}
                  >
                    #{pm.productions?.production_number ?? '—'}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: `${fs.taskLine}px`,
                      color: upcoming ? '#c3d2ee' : '#f5d78e',
                      fontWeight: 600,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pm.productions?.title || 'Untitled production'}
                  </span>
                  {dateLabel && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: `${fit(13, 11)}px`,
                        fontWeight: 700,
                        color: muted,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '5px',
                        padding: '1px 6px',
                        lineHeight: 1.25,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dateLabel}
                    </span>
                  )}
                </div>
                )
              })}
              {hiddenProdCount > 0 && (
                <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: muted, lineHeight: 1.35 }}>
                  +{hiddenProdCount} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TasksSignagePage() {
  const [now, setNow] = useState(new Date())
  const [viewport, setViewport] = useState({ w: 1920, h: 1080 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ message: string; hint: string | null } | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [prodMembers, setProdMembers] = useState<ProductionMemberRow[]>([])
  const [inProgressProductions, setInProgressProductions] = useState<InProgressProduction[]>([])
  const [checklistOpenByUser, setChecklistOpenByUser] = useState<Record<string, number>>({})
  const [checklistUnassignedOpen, setChecklistUnassignedOpen] = useState(0)
  const [taskIntakeUrl, setTaskIntakeUrl] = useState<string | null>(null)
  const [taskIntakeQrDataUrl, setTaskIntakeQrDataUrl] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoadError(null)
    const key = new URLSearchParams(window.location.search).get('k') || ''
    const res = await fetch(`/api/signage/tasks-data?k=${encodeURIComponent(key)}`, { cache: 'no-store' })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTasks([])
      setTeam([])
      setProdMembers([])
      setInProgressProductions([])
      setChecklistOpenByUser({})
      setChecklistUnassignedOpen(0)
      setTaskIntakeUrl(null)
      const message = (typeof payload?.error === 'string' && payload.error) || 'Failed to load signage data'
      let hint: string | null = null
      if (res.status === 401) {
        hint = key.trim()
          ? 'Unauthorized: this ?k= value does not match SIGNAGE_TASKS_KEY on the server. Copy the link from Settings → Signage.'
          : 'Unauthorized: add ?k=… to the URL, or copy the full link from Settings → Signage.'
      } else if (res.status === 500) {
        hint = 'Server error — this is usually a database or configuration issue on the API, not a bad URL key.'
      }
      setLoadError({ message, hint })
      setLoading(false)
      return
    }

    const normalizedTasks: TaskRow[] = ((payload.tasks || []) as Array<{
      id: string
      title: string
      priority: string
      due_date: string | null
      assigned_to: string | null
      assignee_ids?: string[] | null
      production_id: string | null
      purchase_request: boolean | null
      status?: string | null
      productions?: { production_number: number; title: string } | { production_number: number; title: string }[] | null
    }>).map(row => {
      const prod = Array.isArray(row.productions) ? row.productions[0] || null : row.productions || null
      return {
        id: row.id,
        title: row.title,
        priority: row.priority,
        due_date: row.due_date,
        assigned_to: row.assigned_to,
        assignee_ids: mergeAssigneeIds(row.assigned_to, Array.isArray(row.assignee_ids) ? row.assignee_ids : undefined),
        production_id: row.production_id,
        purchase_request: !!row.purchase_request,
        status: row.status ?? null,
        productions: prod ? { production_number: prod.production_number, title: prod.title } : null,
      }
    })
    setTasks(normalizedTasks)
    setTeam((payload.team as TeamMember[]) || [])
    setProdMembers((payload.prodMembers as ProductionMemberRow[]) || [])
    setInProgressProductions((payload.inProgressProductions as InProgressProduction[]) || [])
    setChecklistOpenByUser(
      payload.checklistOpenByUser && typeof payload.checklistOpenByUser === 'object' && !Array.isArray(payload.checklistOpenByUser)
        ? (payload.checklistOpenByUser as Record<string, number>)
        : {}
    )
      setChecklistUnassignedOpen(typeof payload.checklistUnassignedOpen === 'number' ? payload.checklistUnassignedOpen : 0)
      const rawUrl = typeof payload.taskIntakeUrl === 'string' && payload.taskIntakeUrl.trim() ? payload.taskIntakeUrl.trim() : null
      setTaskIntakeUrl(rawUrl)
      setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000)
    const refresh = setInterval(() => loadData(), 60000)
    return () => {
      clearInterval(clock)
      clearInterval(refresh)
    }
  }, [loadData])

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!taskIntakeUrl) {
      setTaskIntakeQrDataUrl(null)
      return
    }
    let target = taskIntakeUrl
    if (target.startsWith('/') && typeof window !== 'undefined') {
      target = `${window.location.origin}${target}`
    }
    if (!/^https?:\/\//i.test(target)) {
      setTaskIntakeQrDataUrl(null)
      return
    }
    let cancelled = false
    void import('qrcode').then(({ default: QR }) =>
      QR.toDataURL(target, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
        .then(dataUrl => {
          if (!cancelled) setTaskIntakeQrDataUrl(dataUrl)
        })
        .catch(() => {
          if (!cancelled) setTaskIntakeQrDataUrl(null)
        })
    )
    return () => {
      cancelled = true
    }
  }, [taskIntakeUrl])

  const displayTasks = useMemo(
    () => tasks.filter(t => !t.purchase_request),
    [tasks]
  )

  const purchaseQueueCount = useMemo(
    () => tasks.filter(t => t.purchase_request).length,
    [tasks]
  )

  const unassignedTasks = useMemo(
    () => displayTasks.filter(t => taskIsUnassigned(t.assignee_ids, t.assigned_to)).sort((a, b) => (daysFromToday(a.due_date) ?? 9999) - (daysFromToday(b.due_date) ?? 9999)),
    [displayTasks]
  )

  const overdueTasks = useMemo(
    () => displayTasks.filter(t => {
      const d = daysFromToday(t.due_date)
      return d !== null && d < 0
    }),
    [displayTasks]
  )

  const dueTodayCount = useMemo(
    () => displayTasks.filter(t => daysFromToday(t.due_date) === 0).length,
    [displayTasks]
  )

  const staffCards = useMemo(() => {
    const byPersonTasks = new Map<string, TaskRow[]>()
    displayTasks.forEach(t => {
      const ids = mergeAssigneeIds(t.assigned_to, t.assignee_ids)
      ids.forEach(id => {
        if (!byPersonTasks.has(id)) byPersonTasks.set(id, [])
        byPersonTasks.get(id)!.push(t)
      })
    })

    const byPersonProds = new Map<string, ProductionMemberRow[]>()
    prodMembers.forEach(pm => {
      if (!byPersonProds.has(pm.user_id)) byPersonProds.set(pm.user_id, [])
      byPersonProds.get(pm.user_id)!.push(pm)
    })

    return team.map(member => {
      const personTasks = (byPersonTasks.get(member.id) || []).sort(
        (a, b) => (daysFromToday(a.due_date) ?? 9999) - (daysFromToday(b.due_date) ?? 9999)
      )
      const personOverdue = personTasks.filter(t => {
        const d = daysFromToday(t.due_date)
        return d !== null && d < 0
      }).length
      const allPersonProds = byPersonProds.get(member.id) || []
      const personInProgressProds = allPersonProds.filter(
        p => normalizeProductionStatus(p.productions?.status) === 'In Progress',
      )
      const personProds = allPersonProds
        .filter(p => p.productions?.start_datetime)
        .sort((a, b) => new Date(a.productions!.start_datetime!).getTime() - new Date(b.productions!.start_datetime!).getTime())
      const personUpcomingProds = personProds.filter(
        p => normalizeProductionStatus(p.productions?.status) !== 'In Progress',
      )
      const next5DayProds = personUpcomingProds.filter(p => {
        const startIso = p.productions?.start_datetime
        if (!startIso) return false
        const ms = new Date(startIso).getTime() - Date.now()
        const days = ms / 86400000
        return days >= 0 && days <= 5
      })
      return { member, personTasks, personOverdue, personInProgressProds, personUpcomingProds, next5DayProds, checklistOpen: checklistOpenByUser[member.id] ?? 0 }
    })
  }, [displayTasks, team, prodMembers, checklistOpenByUser])

  const studentInternCards = useMemo(
    () => staffCards.filter(c => isStudentInternRole(c.member.role)).sort((a, b) => a.member.name.localeCompare(b.member.name)),
    [staffCards]
  )

  const staffRowCards = useMemo(
    () => staffCards.filter(c => !isStudentInternRole(c.member.role)).sort((a, b) => a.member.name.localeCompare(b.member.name)),
    [staffCards]
  )

  const inProgressTaskCount = displayTasks.filter(t => isActiveWorkTaskStatus(t.status)).length
  const staffMaxTasks = Math.max(0, ...staffCards.map(c => c.personTasks.length))
  const unassignedCount = unassignedTasks.length
  const bg = '#070d18'
  const cardBg = '#0f1828'
  const text = '#eef2ff'
  const muted = '#8ea3c6'
  const emptyMuted = '#6b7894'
  const border = 'rgba(255,255,255,0.12)'
  // Match production calendar signage scale (office closed: 18–24px in cells, 22px banner).
  const baseScale = Math.max(0.9, Math.min(1, Math.min(viewport.w / 1920, viewport.h / 1080)))
  const densityPenalty = Math.max(0, staffMaxTasks - 10) * 0.15
  const fit = (max: number, min: number, penalty = 0) => Math.max(min, Math.round(max * baseScale - penalty))
  const fs = {
    title: fit(26, 22),
    subtitle: fit(14, 12),
    clock: fit(32, 28),
    kpiLabel: fit(15, 13),
    kpiValue: fit(22, 18),
    bandLabel: fit(14, 12),
    unassignedHeading: fit(22, 18),
    unassignedMeta: fit(15, 13),
    staffName: fit(18, 16),
    staffStat: fit(14, 12),
    taskLine: fit(18, 16, densityPenalty),
    railOverdue: fit(14, 12),
  }
  const qrSize = Math.min(96, Math.round(88 * (viewport.w / 1920)))

  const maxTasksPerCard = useMemo(() => {
    const mainH = viewport.h - fit(150, 130)
    const halfRow = mainH / 2
    const linePx = fit(18, 16) * 1.35 + 8
    return Math.max(6, Math.min(20, Math.floor((halfRow - 56) / linePx)))
  }, [viewport.h, baseScale])

  const railWidthPx = Math.max(260, Math.min(340, Math.round(viewport.w * 0.22)))

  const railVisibleCount = useMemo(() => {
    const available = Math.max(160, viewport.h - fit(150, 130))
    const perRow = fit(28, 24)
    return Math.max(8, Math.floor(available / perRow))
  }, [viewport.h, baseScale])

  const railShown = unassignedTasks.slice(0, railVisibleCount)
  const railMore = unassignedCount - railShown.length

  if (loading) {
    return (
      <div style={{ background: bg, color: muted, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        Loading task board...
      </div>
    )
  }

  return (
    <div
      style={{
        background: bg,
        color: text,
        height: '100vh',
        padding: '12px 14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {loadError && (
        <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', fontSize: `${fit(15, 13)}px`, fontWeight: 600, flexShrink: 0 }}>
          <div>{loadError.message}</div>
          {loadError.hint && (
            <div style={{ marginTop: '6px', fontSize: `${fit(14, 12)}px`, fontWeight: 500, opacity: 0.95 }}>
              {loadError.hint}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '14px', flexShrink: 0 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: `${fs.title}px`, lineHeight: 1.05 }}>CSDtv Task Ops Board</h1>
          <p style={{ margin: '6px 0 0', fontSize: `${fs.subtitle}px`, color: muted, lineHeight: 1.25 }}>
            Who&apos;s assigned what — at a glance
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
          {taskIntakeQrDataUrl && taskIntakeUrl && (
            <div style={{ textAlign: 'center' as const, flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: `${fit(14, 12)}px`, color: muted, fontWeight: 700, letterSpacing: '0.04em' }}>Submit a task</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={taskIntakeQrDataUrl}
                alt=""
                width={qrSize}
                height={qrSize}
                style={{ display: 'block', marginTop: '6px', borderRadius: '10px', border: `1px solid ${border}` }}
              />
            </div>
          )}
          <div
            style={{
              fontSize: `${fs.clock}px`,
              fontWeight: 800,
              color: '#60b8f0',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* KPI strip — 6 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: '10px',
          marginBottom: '10px',
          flexShrink: 0,
        }}
      >
        {[
          { label: 'Unassigned', value: unassignedTasks.length, color: '#fbbf24' },
          { label: 'Open', value: displayTasks.length, color: '#34d399' },
          { label: 'Overdue', value: overdueTasks.length, color: '#ef4444' },
          { label: 'Due today', value: dueTodayCount, color: '#60b8f0' },
          { label: 'Active', value: inProgressTaskCount, color: '#f0c060' },
          { label: 'Requests', value: purchaseQueueCount, color: '#c084fc' },
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              background: '#15233a',
              border: `1px solid ${border}`,
              borderLeft: `5px solid ${stat.color}`,
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '10px',
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: `${fs.kpiLabel}px`,
                color: '#ffffff',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {stat.label}
            </span>
            <span style={{ fontSize: `${fs.kpiValue}px`, color: '#ffffff', fontWeight: 800, lineHeight: 1 }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Main body: people (72) + rail (28) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `minmax(0, 1fr) minmax(${railWidthPx}px, ${railWidthPx}px)`,
          gap: '11px',
          overflow: 'hidden',
        }}
      >
        {/* Left — staff + student interns */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: `${fs.bandLabel}px`,
                color: muted,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Staff
            </p>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${STAFF_GRID_COLUMNS}, minmax(0, 1fr))`,
                gap: '12px',
                overflow: 'hidden',
              }}
            >
              {staffRowCards.map(card => (
                <PersonCard
                  key={card.member.id}
                  card={card}
                  fs={fs}
                  fit={fit}
                  cardBg={cardBg}
                  border={border}
                  muted={muted}
                  emptyMuted={emptyMuted}
                  maxListedTasks={maxTasksPerCard}
                />
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: `${fs.bandLabel}px`,
                color: muted,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Student interns
            </p>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${STUDENT_INTERN_GRID_COLUMNS}, minmax(0, 1fr))`,
                gap: '12px',
                overflow: 'hidden',
              }}
            >
              {studentInternCards.map(card => (
                <PersonCard
                  key={card.member.id}
                  card={card}
                  fs={fs}
                  fit={fit}
                  cardBg={cardBg}
                  border={border}
                  muted={muted}
                  emptyMuted={emptyMuted}
                  maxListedTasks={maxTasksPerCard}
                  showUpcomingProds
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right — unassigned rail */}
        <div
          style={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: cardBg,
            border: `1px solid ${border}`,
            borderLeft: '3px solid #fbbf24',
            borderRadius: '10px',
            padding: '12px 14px',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: `${fs.unassignedHeading}px`,
              color: '#fbbf24',
              fontWeight: 800,
              letterSpacing: '0.03em',
              flexShrink: 0,
            }}
          >
            Up for grabs ({unassignedCount})
          </p>
          <div
            style={{
              marginTop: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {unassignedCount === 0 ? (
              <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: emptyMuted, fontWeight: 600 }}>Nothing unassigned</p>
            ) : (
              <>
                {railShown.map(task => {
                  const d = daysFromToday(task.due_date)
                  const overdue = d !== null && d < 0
                  return (
                    <div
                      key={task.id}
                      style={{
                        minWidth: 0,
                        padding: '2px 0',
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: `${fs.taskLine}px`,
                          color: text,
                          fontWeight: 700,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {task.title}
                      </p>
                      {overdue && (
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: `${fs.railOverdue}px`,
                            fontWeight: 700,
                            color: '#ef4444',
                            lineHeight: 1.2,
                          }}
                        >
                          {Math.abs(d!)}d overdue
                        </p>
                      )}
                    </div>
                  )
                })}
                {railMore > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: `${fs.unassignedMeta}px`, color: muted, fontWeight: 600 }}>
                    +{railMore} more
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
