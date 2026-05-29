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

  const staffCount = staffCards.length
  const hasInProgressStrip = inProgressProductions.length > 0
  const staffMaxTasks = Math.max(0, ...staffCards.map(c => c.personTasks.length))
  const unassignedCount = unassignedTasks.length
  const bg = '#070d18'
  const cardBg = '#0f1828'
  const text = '#eef2ff'
  const muted = '#8ea3c6'
  const border = 'rgba(255,255,255,0.12)'
  // Wall display: scale to viewport, but never shrink below readable signage sizes.
  const baseScale = Math.max(0.88, Math.min(1.25, Math.min(viewport.w / 1920, viewport.h / 1080)))
  const staffGridCols = staffCount <= 2 ? 1 : staffCount <= 4 ? 2 : viewport.w >= 1600 ? 3 : 2
  const inProgressGridCols = inProgressProductions.length <= 3 ? inProgressProductions.length : inProgressProductions.length <= 6 ? 3 : 4
  const densityPenalty = Math.max(0, staffMaxTasks - 6) * 0.6 + Math.max(0, unassignedCount - 8) * 0.4
  const fit = (max: number, min: number, penalty = 0) => Math.max(min, Math.round(max * baseScale - penalty))
  const fs = {
    title: fit(52, 36),
    subtitle: fit(20, 14),
    clock: fit(64, 40),
    kpiLabel: fit(18, 13),
    kpiValue: fit(68, 44),
    sectionTitle: fit(40, 28),
    empty: fit(28, 18),
    cardTitle: fit(32, 22),
    cardMeta: fit(22, 16),
    staffName: fit(38, 28),
    staffStat: fit(26, 18),
    taskLine: fit(28, 20, densityPenalty * 0.35),
    subLabel: fit(22, 16),
    prodLine: fit(26, 19, densityPenalty * 0.35),
    prodDate: fit(18, 14),
    prodTag: fit(14, 11),
    inProgressBannerLabel: fit(32, 24),
    inProgressBannerTitle: fit(28, 22),
    inProgressBannerMeta: fit(18, 14),
  }

  if (loading) {
    return (
      <div style={{ background: bg, color: muted, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        Loading task board...
      </div>
    )
  }

  return (
    <div style={{ background: bg, color: text, height: '100vh', padding: '12px 14px', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '14px', flexWrap: 'wrap' as const, flexShrink: 0 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: `${fs.title}px`, lineHeight: 1.05 }}>CSDtv Task Ops Board</h1>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: `${fs.subtitle}px` }}>Unassigned work, in-progress productions, and upcoming 14-day load</p>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '10px', marginBottom: '10px', flexShrink: 0 }}>
        {[
          { label: 'Unassigned', value: unassignedTasks.length, color: '#fbbf24' },
          { label: 'Overdue', value: overdueTasks.length, color: '#ef4444' },
          { label: 'Due today', value: dueTodayCount, color: '#60b8f0' },
          { label: 'Open tasks', value: displayTasks.length, color: '#34d399' },
          { label: 'In progress', value: inProgressProductions.length, color: '#f0b840' },
          { label: 'Checklist items', value: checklistOpenTotal, color: '#f472b6' },
          { label: 'Request queue', value: purchaseQueueCount, color: '#c084fc' },
        ].map(stat => (
          <div key={stat.label} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '10px 12px' }}>
            <p style={{ margin: 0, fontSize: `${fs.kpiLabel}px`, color: muted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>{stat.label}</p>
            <p style={{ margin: '8px 0 0', fontSize: `${fs.kpiValue}px`, color: stat.color, fontWeight: 800, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {hasInProgressStrip && (
        <div style={{ background: cardBg, border: '1px solid rgba(240,184,64,0.5)', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: `${fs.inProgressBannerLabel}px`, color: '#f0b840', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
            In progress productions
          </p>
          <div
            style={{
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: `repeat(${inProgressGridCols}, minmax(0, 1fr))`,
              gap: '10px',
            }}
          >
            {inProgressProductions.map(prod => {
              const tag = signageTypeTag(prod.request_type_label)
              const dateStr = formatProductionDateShort(prod.start_datetime)
              return (
                <div
                  key={prod.id}
                  style={{
                    border: '1px solid rgba(240,184,64,0.35)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    background: 'rgba(240,184,64,0.1)',
                    minWidth: 0,
                  }}
                >
                  <p style={{ margin: 0, fontSize: `${fs.inProgressBannerTitle}px`, fontWeight: 800, lineHeight: 1.2, color: text }}>
                    #{prod.production_number} {prod.title}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: `${fs.inProgressBannerMeta}px`, color: muted, fontWeight: 600, lineHeight: 1.3 }}>
                    Event {dateStr}{tag ? ` · ${tag.text}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3.75fr)', gap: '16px', overflow: 'hidden' }}>
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <h2 style={{ margin: 0, fontSize: `${fs.sectionTitle}px`, flexShrink: 0 }}>Unassigned Tasks</h2>
          <div style={{ marginTop: '10px', overflow: 'auto', display: 'grid', gap: '8px', minHeight: 0, flex: 1 }}>
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

        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <h2 style={{ margin: 0, fontSize: `${fs.sectionTitle}px`, flexShrink: 0 }}>Staff Workload</h2>
          <div
            style={{
              marginTop: '10px',
              overflow: 'auto',
              minHeight: 0,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: `repeat(${staffGridCols}, minmax(0, 1fr))`,
              gridAutoRows: 'minmax(0, 1fr)',
              gap: '14px',
              paddingRight: '4px',
              alignContent: 'stretch',
            }}
          >
            {staffCards.map(({ member, personTasks, personOverdue, personInProgressProds, personUpcomingProds, next5DayProds, checklistOpen }) => (
              <div key={member.id} style={{ border: `1px solid ${border}`, borderRadius: '12px', padding: '14px 16px', background: 'rgba(255,255,255,0.035)', boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexShrink: 0 }}>
                  <div style={{ width: `${fit(44, 34)}px`, height: `${fit(44, 34)}px`, borderRadius: '999px', background: member.avatar_color, color: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fit(16, 12)}px`, fontWeight: 800, flexShrink: 0 }}>
                    {initials(member.name)}
                  </div>
                  <p style={{ margin: 0, fontSize: `${fs.staffName}px`, fontWeight: 800, lineHeight: 1.15 }}>{member.name}</p>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: `${fs.staffStat}px`, color: text, fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>
                  {personTasks.length} open · {personOverdue} overdue · {personInProgressProds.length} in progress · {personUpcomingProds.length} upcoming · {checklistOpen} checklist
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px', alignItems: 'start', flex: 1, minHeight: 0 }}>
                  <div style={{ display: 'grid', gap: '6px', minWidth: 0, alignContent: 'start' }}>
                    <p style={{ margin: 0, fontSize: `${fs.subLabel}px`, color: '#8dc4ff', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>
                      Open tasks
                    </p>
                    {personTasks.slice(0, 8).map(t => {
                      const d = daysFromToday(t.due_date)
                      const dueLabel = d === null ? 'No due' : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Due today' : `${d}d`
                      return (
                        <p key={t.id} style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: '#d8e4ff', lineHeight: 1.35, padding: '3px 0' }}>
                          {t.title} · <span style={{ color: muted }}>{dueLabel}</span>
                        </p>
                      )
                    })}
                    {personTasks.length > 8 && (
                      <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: muted, padding: '3px 0' }}>+{personTasks.length - 8} more</p>
                    )}
                    {personTasks.length === 0 && (
                      <p style={{ margin: 0, fontSize: `${fs.taskLine}px`, color: muted, padding: '3px 0' }}>No open tasks assigned.</p>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: '6px', minWidth: 0, alignContent: 'start' }}>
                    <p style={{ margin: 0, fontSize: `${fs.subLabel}px`, color: '#8dc4ff', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>
                      Upcoming (next 5 days)
                    </p>
                    {next5DayProds.slice(0, 6).map((pm, idx) => {
                      const prod = pm.productions
                      const tag = signageTypeTag(prod?.request_type_label)
                      const dateStr = formatProductionDateShort(prod?.start_datetime ?? null)
                      const list = next5DayProds.slice(0, 6)
                      return (
                        <div
                          key={`${pm.production_id}-${pm.user_id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '4px 0',
                            borderBottom: idx < list.length - 1 ? `1px solid ${border}` : 'none',
                          }}
                        >
                          <span style={{ flex: '0 0 auto', fontSize: `${fs.prodDate}px`, color: muted, fontWeight: 600, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
                            {dateStr}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: `${fs.prodLine}px`, color: '#a7c4ee', fontWeight: 600, lineHeight: 1.3 }}>
                              #{prod?.production_number} {prod?.title}
                            </p>
                            {tag && (
                              <p style={{ margin: '3px 0 0', fontSize: `${fs.prodTag}px`, color: muted, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.03em' }}>
                                {tag.text}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {next5DayProds.length > 6 && (
                      <p style={{ margin: 0, fontSize: `${fs.prodLine}px`, color: muted, padding: '3px 0' }}>+{next5DayProds.length - 6} more</p>
                    )}
                    {next5DayProds.length === 0 && (
                      <p style={{ margin: 0, fontSize: `${fs.prodLine}px`, color: muted, padding: '6px 0' }}>No upcoming in next 5 days.</p>
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
