'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isStudentInternRole } from '@/lib/roles'

interface TaskRow {
  id: string
  title: string
  priority: string
  due_date: string | null
  assigned_to: string | null
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
  text: string
  muted: string
  emptyMuted: string
  maxListedTasks: number
}

function PersonCard({ card, fs, fit, cardBg, border, text, muted, emptyMuted, maxListedTasks }: PersonCardProps) {
  const { member, personTasks } = card
  const activeTasks = personTasks.filter(t => isActiveWorkTaskStatus(t.status))
  const openTasks = personTasks.filter(t => !isActiveWorkTaskStatus(t.status))
  const hasTasks = personTasks.length > 0
  const slots = Math.max(4, maxListedTasks)
  const shownActive = activeTasks.slice(0, slots)
  const openSlots = Math.max(0, slots - shownActive.length)
  const shownOpen = openTasks.slice(0, openSlots)
  const hiddenCount = personTasks.length - shownActive.length - shownOpen.length

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
            width: `${fit(46, 36)}px`,
            height: `${fit(46, 36)}px`,
            borderRadius: '999px',
            background: member.avatar_color,
            color: '#0a0f1e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${fit(17, 13)}px`,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials(member.name)}
        </div>
        <p style={{ margin: 0, fontSize: `${fs.staffName}px`, fontWeight: 800, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.name}
        </p>
      </div>

      {hasTasks ? (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
          <p style={{ margin: '0 0 10px', fontSize: `${fs.staffStat}px`, color: text, fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>
            {activeTasks.length} in progress · {openTasks.length} open
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: 0, overflow: 'hidden', flex: 1 }}>
            {shownActive.map(t => (
              <p
                key={t.id}
                style={{
                  margin: 0,
                  fontSize: `${fs.taskLine}px`,
                  color: '#d8e4ff',
                  lineHeight: 1.35,
                  padding: '3px 0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: '#f0c060', marginRight: '4px' }}>●</span>
                {t.title}
              </p>
            ))}
            {shownOpen.map(t => (
              <p
                key={t.id}
                style={{
                  margin: 0,
                  fontSize: `${fs.taskLine}px`,
                  color: '#b8c8e8',
                  lineHeight: 1.35,
                  padding: '3px 0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: muted, marginRight: '6px' }}>○</span>
                {t.title}
              </p>
            ))}
            {hiddenCount > 0 && (
              <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: muted, lineHeight: 1.35 }}>
                +{hiddenCount} more
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed rgba(255,255,255,0.12)',
            borderRadius: '6px',
            minHeight: `${fit(56, 44)}px`,
          }}
        >
          <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: emptyMuted, fontWeight: 500 }}>
            No tasks assigned
          </p>
        </div>
      )}
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
    () => displayTasks.filter(t => !t.assigned_to).sort((a, b) => (daysFromToday(a.due_date) ?? 9999) - (daysFromToday(b.due_date) ?? 9999)),
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
      if (!t.assigned_to) return
      if (!byPersonTasks.has(t.assigned_to)) byPersonTasks.set(t.assigned_to, [])
      byPersonTasks.get(t.assigned_to)!.push(t)
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
      const personProds = (byPersonProds.get(member.id) || [])
        .filter(p => p.productions?.start_datetime)
        .sort((a, b) => new Date(a.productions!.start_datetime!).getTime() - new Date(b.productions!.start_datetime!).getTime())
      const personInProgressProds = personProds.filter(
        p => normalizeProductionStatus(p.productions?.status) === 'In Progress'
      )
      const personUpcomingProds = personProds.filter(
        p => normalizeProductionStatus(p.productions?.status) !== 'In Progress'
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
  const baseScale = Math.max(0.88, Math.min(1.25, Math.min(viewport.w / 1920, viewport.h / 1080)))
  const densityPenalty = Math.max(0, staffMaxTasks - 8) * 0.35
  const fit = (max: number, min: number, penalty = 0) => Math.max(min, Math.round(max * baseScale - penalty))
  const fs = {
    title: fit(54, 42),
    subtitle: fit(22, 17),
    clock: fit(64, 42),
    kpiLabel: fit(18, 14),
    kpiValue: fit(70, 50),
    bandLabel: fit(24, 18),
    unassignedHeading: fit(32, 26),
    unassignedTask: fit(30, 24),
    unassignedMeta: fit(22, 17),
    staffName: fit(38, 30),
    staffStat: fit(26, 20),
    taskLine: fit(28, 22, densityPenalty * 0.15),
    railOverdue: fit(16, 12),
  }
  const qrSize = Math.min(140, Math.round(120 * (viewport.w / 1920)))

  const maxTasksPerCard = useMemo(() => {
    const mainH = viewport.h - fit(200, 170)
    const halfRow = mainH / 2
    const linePx = fit(28, 22) * 1.35 + 8
    return Math.max(6, Math.min(16, Math.floor((halfRow - 72) / linePx)))
  }, [viewport.h, baseScale])

  const railVisibleCount = useMemo(() => {
    const available = Math.max(160, viewport.h - fit(200, 170))
    const perRow = fit(34, 28)
    return Math.max(6, Math.floor(available / perRow))
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
        <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', fontSize: `${fit(18, 13)}px`, fontWeight: 600, flexShrink: 0 }}>
          <div>{loadError.message}</div>
          {loadError.hint && (
            <div style={{ marginTop: '6px', fontSize: `${fit(15, 11)}px`, fontWeight: 500, opacity: 0.95 }}>
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
              <p style={{ margin: 0, fontSize: `${fit(16, 11)}px`, color: muted, fontWeight: 700, letterSpacing: '0.04em' }}>Submit a task</p>
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
          { label: 'In progress', value: inProgressTaskCount, color: '#f0c060' },
          { label: 'Requests', value: purchaseQueueCount, color: '#c084fc' },
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              background: cardBg,
              border: `1px solid ${border}`,
              borderRadius: '10px',
              padding: '10px 12px',
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
                color: muted,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {stat.label}
            </span>
            <span style={{ fontSize: `${fs.kpiValue}px`, color: stat.color, fontWeight: 800, lineHeight: 1 }}>
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
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 240px)',
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
                  text={text}
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
                  text={text}
                  muted={muted}
                  emptyMuted={emptyMuted}
                  maxListedTasks={maxTasksPerCard}
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
              gap: '6px',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {unassignedCount === 0 ? (
              <p style={{ margin: 0, fontSize: `${fs.unassignedTask}px`, color: emptyMuted, fontWeight: 600 }}>Nothing unassigned</p>
            ) : (
              <>
                {railShown.map(task => {
                  const d = daysFromToday(task.due_date)
                  const overdue = d !== null && d < 0
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '8px',
                        minWidth: 0,
                        lineHeight: 1.25,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: `${fs.unassignedTask}px`,
                          color: text,
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.title}
                      </span>
                      {overdue && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: `${fs.railOverdue}px`,
                            fontWeight: 700,
                            color: '#ef4444',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {Math.abs(d!)}d overdue
                        </span>
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
