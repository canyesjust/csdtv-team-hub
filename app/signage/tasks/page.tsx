'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

interface TaskRow {
  id: string
  title: string
  priority: string
  due_date: string | null
  assigned_to: string | null
  production_id: string | null
  purchase_request: boolean
  productions?: { production_number: number; title: string } | null
}

interface TeamMember {
  id: string
  name: string
  avatar_color: string
  role?: string | null
}

interface InProgressProduction {
  id: string
  production_number: number
  title: string
  start_datetime: string | null
  request_type_label: string | null
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

/** Short label for wall display from `request_type_label`. */
function signageTypeTag(label: string | null | undefined): { text: string; bg: string } | null {
  const raw = (label || '').trim()
  if (!raw) return null
  const t = raw.toLowerCase()
  if (t.includes('livestream') || t.includes('live stream')) return { text: 'Livestream', bg: '#2563eb' }
  if (t.includes('board')) return { text: 'Board', bg: '#7c3aed' }
  if (t.includes('record') || t.includes('recording') || t.includes('studio') || t.includes('multi-cam')) {
    return { text: 'Recording', bg: '#059669' }
  }
  const short = raw.split('(')[0]?.trim() || raw
  const cap = short.length > 18 ? `${short.slice(0, 16)}…` : short
  return { text: cap, bg: 'rgba(100,116,139,0.55)' }
}

/** Compact wall display: MM/DD/YYYY in local time. */
function formatProductionDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
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

  const checklistOpenTotal = useMemo(() => {
    let n = checklistUnassignedOpen
    for (const v of Object.values(checklistOpenByUser)) n += v
    return n
  }, [checklistOpenByUser, checklistUnassignedOpen])

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

    const roleRank = (role: string | null | undefined): number => {
      const r = (role || '').toLowerCase()
      if (r === 'staff') return 0
      if (r.includes('intern')) return 1
      if (r === 'manager') return 2
      return 3
    }

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
    }).sort((a, b) => {
      const rankDiff = roleRank(a.member.role) - roleRank(b.member.role)
      if (rankDiff !== 0) return rankDiff
      return a.member.name.localeCompare(b.member.name)
    })
  }, [displayTasks, team, prodMembers, checklistOpenByUser])

  const bg = '#070d18'
  const cardBg = '#0f1828'
  const text = '#eef2ff'
  const muted = '#8ea3c6'
  const border = 'rgba(255,255,255,0.12)'
  const baseScale = Math.max(0.7, Math.min(1.6, Math.min(viewport.w / 1920, viewport.h / 1080)))
  const staffMaxTasks = Math.max(0, ...staffCards.map(c => c.personTasks.length))
  const unassignedCount = unassignedTasks.length
  const densityPenalty = Math.max(0, staffMaxTasks - 4) * 1.2 + Math.max(0, unassignedCount - 6) * 0.7
  const fit = (max: number, min: number, penalty = 0) => Math.max(min, Math.round(max * baseScale - penalty))
  const staffDensitySoft = Math.max(0, densityPenalty * 0.55)
  const fitStaff = (max: number, min: number, penalty = 0) => Math.max(min, Math.round(max * baseScale - penalty))
  const fs = {
    title: fit(56, 32, densityPenalty * 0.4),
    subtitle: fit(24, 16, densityPenalty * 0.3),
    clock: fit(68, 34, densityPenalty * 0.4),
    kpiLabel: fit(20, 12, densityPenalty * 0.3),
    kpiValue: fit(72, 34, densityPenalty * 0.5),
    sectionTitle: fit(44, 24, densityPenalty * 0.4),
    empty: fit(30, 18, densityPenalty * 0.2),
    cardTitle: fit(34, 18, densityPenalty * 0.6),
    cardMeta: fit(22, 16, densityPenalty * 0.5),
    staffName: fitStaff(40, 26, staffDensitySoft * 0.35),
    staffStat: fitStaff(30, 22, staffDensitySoft * 0.45),
    taskLine: fitStaff(28, 20, staffDensitySoft * 0.55),
    subLabel: fitStaff(22, 15, staffDensitySoft * 0.25),
    prodLine: fitStaff(26, 18, staffDensitySoft * 0.55),
    prodDate: fitStaff(17, 12, staffDensitySoft * 0.5),
    prodTag: fitStaff(12, 9, staffDensitySoft * 0.35),
  }

  if (loading) {
    return (
      <div style={{ background: bg, color: muted, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        Loading task board...
      </div>
    )
  }

  return (
    <div style={{ background: bg, color: text, height: '100vh', padding: '14px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      {loadError && (
        <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', fontSize: `${fit(18, 13)}px`, fontWeight: 600 }}>
          <div>{loadError.message}</div>
          {loadError.hint && (
            <div style={{ marginTop: '6px', fontSize: `${fit(15, 11)}px`, fontWeight: 500, opacity: 0.95 }}>
              {loadError.hint}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '16px', flexWrap: 'wrap' as const }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: `${fs.title}px`, lineHeight: 1.05 }}>CSDtv Task Ops Board</h1>
          <p style={{ margin: '6px 0 0', color: muted, fontSize: `${fs.subtitle}px` }}>Unassigned work, in-progress productions, and upcoming 14-day load</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
          {taskIntakeQrDataUrl && taskIntakeUrl && (
            <div style={{ textAlign: 'center' as const }}>
              <p style={{ margin: 0, fontSize: `${fit(16, 11)}px`, color: muted, fontWeight: 700, letterSpacing: '0.04em' }}>Submit a task</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={taskIntakeQrDataUrl} alt="" width={Math.min(140, Math.round(120 * (viewport.w / 1920)))} height={Math.min(140, Math.round(120 * (viewport.w / 1920)))} style={{ display: 'block', marginTop: '6px', borderRadius: '10px', border: `1px solid ${border}` }} />
            </div>
          )}
          <div style={{ fontSize: `${fs.clock}px`, fontWeight: 800, color: '#60b8f0', lineHeight: 1, alignSelf: 'center' }}>
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
        {[
          { label: 'Unassigned', value: unassignedTasks.length, color: '#fbbf24' },
          { label: 'Overdue', value: overdueTasks.length, color: '#ef4444' },
          { label: 'Due today', value: dueTodayCount, color: '#60b8f0' },
          { label: 'Open tasks', value: displayTasks.length, color: '#34d399' },
          { label: 'In progress', value: inProgressProductions.length, color: '#f0b840' },
          { label: 'Checklist items', value: checklistOpenTotal, color: '#f472b6' },
          { label: 'Request queue', value: purchaseQueueCount, color: '#c084fc' },
        ].map(stat => (
          <div key={stat.label} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px 14px' }}>
            <p style={{ margin: 0, fontSize: `${fs.kpiLabel}px`, color: muted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{stat.label}</p>
            <p style={{ margin: '8px 0 0', fontSize: `${fs.kpiValue}px`, color: stat.color, fontWeight: 800, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {inProgressProductions.length > 0 && (
        <div style={{ background: cardBg, border: '1px solid rgba(240,184,64,0.45)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: `${fit(28, 18, densityPenalty * 0.3)}px`, color: '#f0b840', fontWeight: 800, letterSpacing: '0.02em' }}>
            In progress productions
          </h2>
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {inProgressProductions.map(prod => {
              const tag = signageTypeTag(prod.request_type_label)
              const dateStr = formatProductionDateShort(prod.start_datetime)
              return (
                <div
                  key={prod.id}
                  style={{
                    flex: '0 0 auto',
                    minWidth: `${fit(280, 200)}px`,
                    maxWidth: `${fit(360, 260)}px`,
                    border: `1px solid rgba(240,184,64,0.35)`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    background: 'rgba(240,184,64,0.08)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: `${fit(22, 16)}px`, fontWeight: 800, lineHeight: 1.2, color: text }}>
                    #{prod.production_number} {prod.title}
                  </p>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: `${fit(16, 12)}px`, color: muted, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      Event {dateStr}
                    </span>
                    {tag && (
                      <span
                        style={{
                          fontSize: `${fit(12, 9)}px`,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: tag.bg,
                          color: '#ffffff',
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase' as const,
                        }}
                      >
                        {tag.text}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3.75fr)', gap: '22px' }}>
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h2 style={{ margin: 0, fontSize: `${fs.sectionTitle}px` }}>Unassigned Tasks</h2>
          <div style={{ marginTop: '10px', overflow: 'auto', display: 'grid', gap: '8px' }}>
            {unassignedTasks.length === 0 ? (
              <p style={{ color: muted, fontSize: `${fs.empty}px` }}>No unassigned tasks right now.</p>
            ) : unassignedTasks.slice(0, 10).map(task => {
              const d = daysFromToday(task.due_date)
              const dueLabel = d === null ? 'No due date' : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Due today' : `Due in ${d}d`
              return (
                <div key={task.id} style={{ border: `1px solid ${border}`, borderRadius: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
                  <p style={{ margin: 0, fontSize: `${fs.cardTitle}px`, fontWeight: 700, lineHeight: 1.15 }}>{task.title}</p>
                  <p style={{ margin: '6px 0 0', fontSize: `${fs.cardMeta}px`, color: muted }}>
                    {dueLabel}{task.productions ? ` · #${task.productions.production_number} ${task.productions.title}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h2 style={{ margin: 0, fontSize: `${fs.sectionTitle}px` }}>Staff Workload</h2>
          <div style={{ marginTop: '10px', overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr', gap: '22px', paddingRight: '6px' }}>
            {staffCards.map(({ member, personTasks, personOverdue, personInProgressProds, personUpcomingProds, next5DayProds, checklistOpen }) => (
              <div key={member.id} style={{ border: `1px solid ${border}`, borderRadius: '14px', padding: '18px 22px', background: 'rgba(255,255,255,0.035)', boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                  <div style={{ width: `${fitStaff(48, 32)}px`, height: `${fitStaff(48, 32)}px`, borderRadius: '999px', background: member.avatar_color, color: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fitStaff(18, 12)}px`, fontWeight: 800 }}>
                    {initials(member.name)}
                  </div>
                  <p style={{ margin: 0, fontSize: `${fs.staffName}px`, fontWeight: 800, lineHeight: 1.2 }}>{member.name}</p>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: `${fs.staffStat}px`, color: text, fontWeight: 700, lineHeight: 1.35 }}>
                  {personTasks.length} open · {personOverdue} overdue · {personInProgressProds.length} in progress · {personUpcomingProds.length} upcoming · {checklistOpen} checklist
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 36px', alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <p style={{ margin: 0, fontSize: `${fs.subLabel}px`, color: '#8dc4ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
                      Open tasks
                    </p>
                    {personTasks.slice(0, 10).map(t => {
                      const d = daysFromToday(t.due_date)
                      const dueLabel = d === null ? 'No due' : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Due today' : `${d}d`
                      return (
                        <p key={t.id} style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: '#d8e4ff', lineHeight: 1.4, padding: '4px 0' }}>
                          {t.title} · <span style={{ color: muted }}>{dueLabel}</span>
                        </p>
                      )
                    })}
                    {personTasks.length === 0 && (
                      <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: muted, padding: '4px 0' }}>No open tasks assigned.</p>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    {personInProgressProds.length > 0 && (
                      <>
                        <p style={{ margin: 0, fontSize: `${fs.subLabel}px`, color: '#f0b840', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
                          In progress
                        </p>
                        {personInProgressProds.slice(0, 6).map((pm, idx) => {
                          const prod = pm.productions
                          const tag = signageTypeTag(prod?.request_type_label)
                          const dateStr = formatProductionDateShort(prod?.start_datetime ?? null)
                          const list = personInProgressProds.slice(0, 6)
                          return (
                            <div
                              key={`ip-${pm.production_id}-${pm.user_id}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '20px',
                                padding: '10px 0',
                                borderBottom: idx < list.length - 1 ? `1px solid rgba(240,184,64,0.25)` : 'none',
                                minHeight: `${Math.round(fs.prodLine * 1.45)}px`,
                              }}
                            >
                              <span style={{ flex: '0 0 auto', fontSize: `${fs.prodDate}px`, color: muted, fontWeight: 600, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' }}>
                                {dateStr}
                              </span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: `${fs.prodLine}px`, color: '#f5d78e', fontWeight: 600, lineHeight: 1.35, paddingRight: '8px' }}>
                                #{prod?.production_number} {prod?.title}
                              </span>
                              {tag && (
                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize: `${fs.prodTag}px`,
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    background: tag.bg,
                                    color: '#ffffff',
                                    letterSpacing: '0.02em',
                                    textTransform: 'uppercase' as const,
                                  }}
                                >
                                  {tag.text}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}
                    <p style={{ margin: personInProgressProds.length > 0 ? '8px 0 0' : 0, fontSize: `${fs.subLabel}px`, color: '#8dc4ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
                      Upcoming (next 5 days)
                    </p>
                    {next5DayProds.slice(0, 10).map((pm, idx) => {
                      const prod = pm.productions
                      const tag = signageTypeTag(prod?.request_type_label)
                      const dateStr = formatProductionDateShort(prod?.start_datetime ?? null)
                      const list = next5DayProds.slice(0, 10)
                      return (
                        <div
                          key={`${pm.production_id}-${pm.user_id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            padding: '10px 0',
                            borderBottom: idx < list.length - 1 ? `1px solid ${border}` : 'none',
                            minHeight: `${Math.round(fs.prodLine * 1.45)}px`,
                          }}
                        >
                          <span style={{ flex: '0 0 auto', fontSize: `${fs.prodDate}px`, color: muted, fontWeight: 600, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' }}>
                            {dateStr}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: `${fs.prodLine}px`, color: '#a7c4ee', fontWeight: 600, lineHeight: 1.35, paddingRight: '8px' }}>
                            #{prod?.production_number} {prod?.title}
                          </span>
                          {tag && (
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: `${fs.prodTag}px`,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: tag.bg,
                                color: '#ffffff',
                                letterSpacing: '0.02em',
                                textTransform: 'uppercase' as const,
                              }}
                            >
                              {tag.text}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {next5DayProds.length === 0 && (
                      <p style={{ margin: 0, fontSize: `${fs.prodLine}px`, color: muted, padding: '8px 0' }}>No upcoming productions in next 5 days.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
