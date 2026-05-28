'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'
import Loader from './components/Loader'
import { ZoneHeader } from './components/ZoneHeader'
import { QuickAddTaskModal } from './components/QuickAddTaskModal'
import { ThisWeekZone, type WeekProduction } from './components/ThisWeekZone'
import { NeedsAttentionZone } from './components/NeedsAttentionZone'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'
import { isStudentInternRole, STUDENT_INTERN_HOME_PATH } from '@/lib/roles'
import {
  ALL_SCHOOL_YEARS,
  PLANNING_SCHOOL_YEARS,
  buildSchoolYearFilterOptions,
  matchesSchoolYearFilter,
  planningSchoolYearFilterLabel,
} from '@/lib/school-year'
import { dayDiffFromToday, DAY_MS } from '@/lib/dashboard/day-diff'
import { isLowPrepAttention, isUnderstaffed, startsWithinDays } from '@/lib/dashboard/production-attention'
import { loadManagerOpsData } from '@/lib/dashboard/load-dashboard-sections'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'

interface TeamMember { id: string; name: string; role: string; avatar_color: string }
interface CurrentUser { id: string; name: string; role: string }
interface OverdueOwnerRow { assigned_to: string | null; due_date: string | null }

const QUICK_LINKS = [
  { href: '/dashboard/productions', label: 'Productions' },
  { href: '/dashboard/schedule', label: 'Schedule' },
  { href: '/dashboard/equipment', label: 'Equipment' },
  { href: '/dashboard/videos', label: 'Videos' },
  { href: '/dashboard/knowledge', label: 'Knowledge base' },
]

export default function DashboardPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [weekProductions, setWeekProductions] = useState<WeekProduction[]>([])
  const [managerProductions, setManagerProductions] = useState<WeekProduction[]>([])
  const [crewSlotsTotal, setCrewSlotsTotal] = useState(0)
  const [crewSlotsFilled, setCrewSlotsFilled] = useState(0)
  const [ytEmailPendingCount, setYtEmailPendingCount] = useState(0)
  const [ytMissingLinkCount, setYtMissingLinkCount] = useState(0)
  const [managerRiskCounts, setManagerRiskCounts] = useState({ unassigned: 0, blocked: 0, overdue: 0 })
  const [overdueOwnerRows, setOverdueOwnerRows] = useState<OverdueOwnerRow[]>([])
  const [schoolYearFilter, setSchoolYearFilter] = useState(PLANNING_SCHOOL_YEARS)
  const [schoolYearOptions, setSchoolYearOptions] = useState<string[]>([])
  const [managerOpen, setManagerOpen] = useState(false)
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [managerDataLoaded, setManagerDataLoaded] = useState(false)
  const [managerOpsLoading, setManagerOpsLoading] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const rowHover = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'
  const review = statusTone.review.color
  const info = statusTone.info.color

  const loadData = useCallback(async () => {
    setLoadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const effective = await fetchEffectiveTeam()
      if (!effective?.team) return
      const user = effective.team
      if (isStudentInternRole(user.role)) {
        router.replace(STUDENT_INTERN_HOME_PATH)
        return
      }
      setCurrentUser({ id: user.id, name: user.name, role: user.role })

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(todayStart)
      weekEnd.setDate(weekEnd.getDate() + 7)
      weekEnd.setHours(23, 59, 59, 999)

      const [teamRes, weekProdsRes] = await Promise.all([
        supabase.from('team').select('id, name, role, avatar_color').eq('active', true),
        supabase
          .from('productions')
          .select(
            'id, title, production_number, request_type_label, type, status, school_year, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(id, title, completed)',
          )
          .gte('start_datetime', todayStart.toISOString())
          .lte('start_datetime', weekEnd.toISOString())
          .order('start_datetime', { ascending: true }),
      ])

      const weekData = (weekProdsRes.data as unknown as WeekProduction[]) ?? []
      setWeekProductions(weekData)
      setTeamMembers(teamRes.data || [])

      setSchoolYearOptions(buildSchoolYearFilterOptions(weekData))

      setManagerDataLoaded(false)
    } catch (err) {
      console.error('Failed to load dashboard', err)
      setLoadError('Failed to load dashboard data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [supabase, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const isManager = (currentUser?.role || '').toLowerCase() === 'manager'

  useEffect(() => {
    if (loading || !currentUser || !isManager || managerDataLoaded) return
    let cancelled = false
    setManagerOpsLoading(true)
    loadManagerOpsData(supabase)
      .then(data => {
        if (cancelled) return
        setManagerProductions(data.managerProductions as WeekProduction[])
        setManagerRiskCounts(data.managerRiskCounts)
        setOverdueOwnerRows(data.overdueOwnerRows)
        setCrewSlotsTotal(data.crewSlotsTotal)
        setCrewSlotsFilled(data.crewSlotsFilled)
        setYtEmailPendingCount(data.ytEmailPendingCount)
        setYtMissingLinkCount(data.ytMissingLinkCount)
        setManagerDataLoaded(true)

        setSchoolYearOptions(prev => {
          const merged = new Set([
            ...prev,
            ...buildSchoolYearFilterOptions(data.managerProductions as WeekProduction[]),
          ])
          return Array.from(merged).sort((a, b) => b.localeCompare(a))
        })
      })
      .catch(err => console.error('Failed to load manager ops', err))
      .finally(() => {
        if (!cancelled) setManagerOpsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loading, currentUser, isManager, managerDataLoaded, supabase])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // This-week query is already bounded by date; do not hide rows by school year.
  const filteredWeekProductions = weekProductions

  const getForwardBriefing = () => {
    const count = filteredWeekProductions.length
    if (count === 0) return 'No productions this week.'
    const nextProd = filteredWeekProductions[0]
    const daysToNext = dayDiffFromToday(nextProd.start_datetime)
    const inLabel =
      daysToNext === null
        ? 'upcoming'
        : daysToNext === 0
          ? 'today'
          : daysToNext === 1
            ? 'in 1 day'
            : `in ${daysToNext} days`
    return `${count} production${count > 1 ? 's' : ''} this week · ${nextProd.title} ${inLabel}.`
  }

  const filteredManagerProductions = useMemo(
    () =>
      managerProductions.filter(p =>
        matchesSchoolYearFilter(
          { school_year: p.school_year, start_datetime: p.start_datetime, status: p.status },
          schoolYearFilter,
        ),
      ),
    [managerProductions, schoolYearFilter],
  )

  const startsSoonManager = filteredManagerProductions.filter(p => startsWithinDays(p, 2))

  const understaffedProductions = startsSoonManager.filter(p => isUnderstaffed(p))

  const lowPrepProductions = filteredManagerProductions
    .filter(p => startsWithinDays(p, 2) && isLowPrepAttention(p))
    .slice(0, 4)

  const missingProdMetadata = filteredManagerProductions.filter(
    p => !p.start_datetime || !(p.filming_location || p.school_department),
  )

  const crewFillPct = crewSlotsTotal > 0 ? Math.round((crewSlotsFilled / crewSlotsTotal) * 100) : 0

  const overdueByOwner = teamMembers
    .map(member => {
      const mine = overdueOwnerRows.filter(t => t.assigned_to === member.id)
      if (mine.length === 0) return null
      const now = Date.now()
      const aging = mine.reduce(
        (acc, t) => {
          if (!t.due_date) return acc
          const days = Math.max(1, Math.ceil((now - new Date(t.due_date).getTime()) / DAY_MS))
          if (days <= 2) acc.a += 1
          else if (days <= 7) acc.b += 1
          else acc.c += 1
          return acc
        },
        { a: 0, b: 0, c: 0 },
      )
      return { member, total: mine.length, aging }
    })
    .filter(Boolean)
    .sort((a, b) => b!.total - a!.total)
    .slice(0, 6) as { member: TeamMember; total: number; aging: { a: number; b: number; c: number } }[]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  const attentionCount =
    understaffedProductions.length +
    lowPrepProductions.length +
    (crewSlotsTotal > 0 && crewSlotsFilled / crewSlotsTotal < 0.7 ? 1 : 0) +
    (ytMissingLinkCount > 0 ? 1 : 0) +
    (ytEmailPendingCount > 0 ? 1 : 0) +
    Math.min(missingProdMetadata.length, 3)

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <header
        style={{
          marginBottom: '20px',
          padding: '16px 18px',
          ...uiStyles.card,
          borderRadius: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap' as const,
            marginBottom: '10px',
          }}
        >
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: text,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {greeting()}, {currentUser?.name?.split(' ')[0]}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <select
              value={schoolYearFilter}
              onChange={e => setSchoolYearFilter(e.target.value)}
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${border}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '12px',
                color: text,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              <option value={PLANNING_SCHOOL_YEARS}>{planningSchoolYearFilterLabel()}</option>
              <option value={ALL_SCHOOL_YEARS}>All school years</option>
              {schoolYearOptions.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowQuickTaskModal(true)}
              style={{
                background: 'var(--brand-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + Task
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap' as const,
            marginBottom: '12px',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: muted,
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'var(--surface-2)',
              border: `1px solid ${border}`,
            }}
          >
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: filteredWeekProductions.length > 0 ? 'var(--brand-primary)' : muted,
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'var(--surface-2)',
              border: `1px solid ${filteredWeekProductions.length > 0 ? 'var(--brand-primary)' : border}`,
            }}
          >
            {filteredWeekProductions.length} this week
          </span>
          {attentionCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: statusTone.warning.color,
                padding: '4px 10px',
                borderRadius: '999px',
                background: statusTone.warning.background,
                border: `1px solid ${statusTone.warning.color}`,
              }}
            >
              {attentionCount} need attention
            </span>
          )}
          <span style={{ fontSize: '13px', color: muted, flex: '1 1 200px', minWidth: 0 }}>
            {getForwardBriefing()}
          </span>
        </div>

        <div
          className="dashboard-quick-links"
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'nowrap' as const,
            overflowX: 'auto' as const,
            paddingBottom: '2px',
          }}
        >
          {QUICK_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                textDecoration: 'none',
                background: 'var(--surface-2)',
                border: `1px solid ${border}`,
                borderRadius: '999px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: text,
                whiteSpace: 'nowrap' as const,
                flexShrink: 0,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--brand-primary)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLAnchorElement).style.borderColor = border
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {loadError && (
          <p style={{ margin: '10px 0 0', fontSize: '13px', color: statusTone.danger.color }}>
            {loadError}
          </p>
        )}
      </header>

      <div className="dashboard-main-grid" style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
        <div className="dashboard-week-span">
          <ThisWeekZone weekProductions={filteredWeekProductions} />
        </div>
        <div className="dashboard-attention-span">
        <NeedsAttentionZone
          understaffedProductions={understaffedProductions}
          lowPrepProductions={lowPrepProductions}
          missingProdMetadata={missingProdMetadata}
          ytEmailPendingCount={ytEmailPendingCount}
          ytMissingLinkCount={ytMissingLinkCount}
          crewSlotsTotal={crewSlotsTotal}
          crewSlotsFilled={crewSlotsFilled}
        />
        </div>
      </div>

      {isManager && (
        <section style={uiStyles.zoneSection}>
          <ZoneHeader
            label="Manager ops"
            hint="Exceptions and intervention queues"
            accent={review}
            action={
              <button
                type="button"
                onClick={() => setManagerOpen(v => !v)}
                aria-expanded={managerOpen}
                aria-controls="manager-ops-content"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: muted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                {managerOpen ? 'Collapse' : 'Expand'}
              </button>
            }
          />
          {managerOpen && (
            <div id="manager-ops-content">
              {managerOpsLoading && !managerDataLoaded && (
                <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>
                  Loading manager data…
                </p>
              )}
              <div
                className="manager-kpis"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  marginBottom: '14px',
                }}
              >
                {[
                  {
                    label: 'Understaffed',
                    value: String(understaffedProductions.length),
                    sub: 'no crew assigned · starts within 48h',
                    tone: 'danger' as const,
                  },
                  {
                    label: 'Crew fill',
                    value: `${crewFillPct}%`,
                    sub: `${crewSlotsFilled}/${crewSlotsTotal} spots filled`,
                    tone:
                      crewFillPct < 70
                        ? ('danger' as const)
                        : crewFillPct < 90
                          ? ('warning' as const)
                          : ('success' as const),
                  },
                  {
                    label: 'Unassigned tasks',
                    value: String(managerRiskCounts.unassigned),
                    sub: 'owner missing',
                    tone: 'review' as const,
                  },
                ].map(kpi => (
                  <div key={kpi.label} style={{ ...uiStyles.cardSoft, padding: '14px 16px' }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase' as const,
                        color: statusTone[kpi.tone].color,
                        fontWeight: 700,
                      }}
                    >
                      {kpi.label}
                    </p>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: '28px',
                        color: text,
                        fontWeight: 800,
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {kpi.value}
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: muted }}>{kpi.sub}</p>
                  </div>
                ))}
              </div>

              <div
                className="manager-panels"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
                  gap: '12px',
                }}
              >
                <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '14px', color: text, fontWeight: 700 }}>
                      YouTube link follow-up
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        color: muted,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.6px',
                      }}
                    >
                      Board + Livestream
                    </span>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'grid', gap: '8px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: text, fontWeight: 600 }}>
                      {ytEmailPendingCount} with link, email not sent
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', color: text, fontWeight: 600 }}>
                      {ytMissingLinkCount} missing link
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '12px', marginTop: '4px' }}>
                      {ytEmailPendingCount > 0 && (
                        <Link
                          href="/dashboard/productions?ytEmailPending=1"
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: info,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap' as const,
                          }}
                        >
                          View email pending →
                        </Link>
                      )}
                      {ytMissingLinkCount > 0 && (
                        <Link
                          href="/dashboard/productions?ytMissingLink=1"
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: statusTone.warning.color,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap' as const,
                          }}
                        >
                          View missing link →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '14px', color: text, fontWeight: 700 }}>
                      Ownership risks
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        color: muted,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.6px',
                      }}
                    >
                      {managerRiskCounts.overdue} overdue · {managerRiskCounts.blocked} blocked
                    </span>
                  </div>
                  <div>
                    {overdueByOwner.length === 0 ? (
                      <p
                        style={{
                          padding: '20px 16px',
                          margin: 0,
                          fontSize: '13px',
                          color: muted,
                          textAlign: 'center' as const,
                        }}
                      >
                        No overdue tasks across team.
                      </p>
                    ) : (
                      overdueByOwner.map((row, i) => (
                        <div
                          key={row.member.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 16px',
                            borderBottom:
                              i < overdueByOwner.length - 1 ? `1px solid ${border}` : 'none',
                          }}
                        >
                          <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>
                            {row.member.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: muted }}>{row.total}</span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: muted,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              }}
                            >
                              {row.aging.a}/{row.aging.b}/{row.aging.c}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '14px', color: text, fontWeight: 700 }}>
                      Coverage risks
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        color: muted,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.6px',
                      }}
                    >
                      {missingProdMetadata.length} data gaps
                    </span>
                  </div>
                  <div>
                    {understaffedProductions.slice(0, 6).map((prod, i, arr) => (
                      <Link
                        key={prod.id}
                        href={`/dashboard/productions?prod=${prod.production_number}`}
                        style={{
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 16px',
                          borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          ;(e.currentTarget as HTMLAnchorElement).style.background = rowHover
                        }}
                        onMouseLeave={e => {
                          ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            color: text,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap' as const,
                            flex: 1,
                            minWidth: 0,
                            paddingRight: '10px',
                          }}
                        >
                          #{prod.production_number} {prod.title}
                        </span>
                        <span
                          style={{
                            ...statusBadge('danger', true),
                            fontSize: '10px',
                            flexShrink: 0,
                          }}
                        >
                          Understaffed
                        </span>
                      </Link>
                    ))}
                    {understaffedProductions.length === 0 && (
                      <p
                        style={{
                          padding: '20px 16px',
                          margin: 0,
                          fontSize: '13px',
                          color: muted,
                          textAlign: 'center' as const,
                        }}
                      >
                        No staffing exceptions in next 48h.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {currentUser && (
        <QuickAddTaskModal
          open={showQuickTaskModal}
          onClose={() => setShowQuickTaskModal(false)}
          currentUser={currentUser}
          teamMembers={teamMembers.map(m => ({ id: m.id, name: m.name, avatar_color: m.avatar_color }))}
        />
      )}

      <style>{`
        .dashboard-week-span {
          grid-column: 1 / -1;
        }
        @media (min-width: 1024px) {
          .dashboard-main-grid {
            grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
            align-items: stretch;
          }
          .dashboard-week-span {
            grid-column: 1;
            grid-row: 1;
          }
          .dashboard-attention-span {
            grid-column: 2;
            grid-row: 1;
          }
        }
        @media (min-width: 640px) {
          .manager-kpis { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .manager-panels { gap: 12px !important; }
        }
      `}</style>
    </div>
  )
}
