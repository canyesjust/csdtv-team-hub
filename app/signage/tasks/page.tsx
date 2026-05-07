'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface TaskRow {
  id: string
  title: string
  priority: string
  due_date: string | null
  assigned_to: string | null
  production_id: string | null
  productions?: { production_number: number; title: string } | null
}

interface TeamMember {
  id: string
  name: string
  avatar_color: string
}

interface ProductionMemberRow {
  production_id: string
  user_id: string
  productions?: {
    production_number: number
    title: string
    start_datetime: string | null
    status: string | null
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

export default function TasksSignagePage() {
  const supabase = createClient()
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [prodMembers, setProdMembers] = useState<ProductionMemberRow[]>([])

  const loadData = useCallback(async () => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const end = new Date(start)
    end.setDate(end.getDate() + 14)

    const [tasksRes, teamRes, upcomingProdsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id,title,priority,due_date,assigned_to,production_id,productions(production_number,title)')
        .neq('status', 'complete')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('team')
        .select('id,name,avatar_color')
        .eq('active', true)
        .order('name'),
      supabase
        .from('productions')
        .select('id,production_number,title,start_datetime,status')
        .gte('start_datetime', start.toISOString())
        .lt('start_datetime', end.toISOString()),
    ])

    const normalizedTasks: TaskRow[] = ((tasksRes.data || []) as Array<{
      id: string
      title: string
      priority: string
      due_date: string | null
      assigned_to: string | null
      production_id: string | null
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
        productions: prod ? { production_number: prod.production_number, title: prod.title } : null,
      }
    })
    setTasks(normalizedTasks)
    setTeam((teamRes.data as TeamMember[]) || [])

    const upcomingProds = (upcomingProdsRes.data || []).filter((p: { status?: string | null }) => {
      const status = (p.status || '').toLowerCase()
      return status !== 'complete' && status !== 'abandoned' && status !== 'cancelled'
    })
    const prodIds = upcomingProds.map((p: { id: string }) => p.id)
    if (prodIds.length === 0) {
      setProdMembers([])
    } else {
      const { data: pmRes } = await supabase
        .from('production_members')
        .select('production_id,user_id')
        .in('production_id', prodIds)

      const prodById = new Map(
        upcomingProds.map((p: { id: string; production_number: number; title: string; start_datetime: string | null; status: string | null }) => [p.id, p])
      )
      const merged = ((pmRes || []) as { production_id: string; user_id: string }[]).map(row => {
        const prod = prodById.get(row.production_id)
        return {
          production_id: row.production_id,
          user_id: row.user_id,
          productions: prod
            ? {
                production_number: prod.production_number,
                title: prod.title,
                start_datetime: prod.start_datetime,
                status: prod.status,
              }
            : null,
        } as ProductionMemberRow
      })
      setProdMembers(merged)
    }
    setLoading(false)
  }, [supabase])

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

  const unassignedTasks = useMemo(
    () => tasks.filter(t => !t.assigned_to).sort((a, b) => (daysFromToday(a.due_date) ?? 9999) - (daysFromToday(b.due_date) ?? 9999)),
    [tasks]
  )

  const overdueTasks = useMemo(
    () => tasks.filter(t => {
      const d = daysFromToday(t.due_date)
      return d !== null && d < 0
    }),
    [tasks]
  )

  const dueTodayCount = useMemo(
    () => tasks.filter(t => daysFromToday(t.due_date) === 0).length,
    [tasks]
  )

  const staffCards = useMemo(() => {
    const byPersonTasks = new Map<string, TaskRow[]>()
    tasks.forEach(t => {
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
      return { member, personTasks, personOverdue, personProds }
    })
  }, [tasks, team, prodMembers])

  const bg = '#070d18'
  const cardBg = '#0f1828'
  const text = '#eef2ff'
  const muted = '#8ea3c6'
  const border = 'rgba(255,255,255,0.12)'

  if (loading) {
    return (
      <div style={{ background: bg, color: muted, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        Loading task board...
      </div>
    )
  }

  return (
    <div style={{ background: bg, color: text, height: '100vh', padding: '14px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '30px', lineHeight: 1.1 }}>CSDtv Task Ops Board</h1>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: '14px' }}>Unassigned work, ownership, and upcoming 14-day production load</p>
        </div>
        <div style={{ fontSize: '30px', fontWeight: 800, color: '#60b8f0' }}>
          {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
        {[
          { label: 'Unassigned', value: unassignedTasks.length, color: '#fbbf24' },
          { label: 'Overdue', value: overdueTasks.length, color: '#ef4444' },
          { label: 'Due today', value: dueTodayCount, color: '#60b8f0' },
          { label: 'Open tasks', value: tasks.length, color: '#34d399' },
        ].map(stat => (
          <div key={stat.label} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '10px 12px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: muted, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>{stat.label}</p>
            <p style={{ margin: '4px 0 0', fontSize: '34px', color: stat.color, fontWeight: 800, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.1fr 2fr', gap: '10px' }}>
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Unassigned Tasks</h2>
          <div style={{ marginTop: '8px', overflow: 'auto', display: 'grid', gap: '6px' }}>
            {unassignedTasks.length === 0 ? (
              <p style={{ color: muted, fontSize: '14px' }}>No unassigned tasks right now.</p>
            ) : unassignedTasks.slice(0, 20).map(task => {
              const d = daysFromToday(task.due_date)
              const dueLabel = d === null ? 'No due date' : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Due today' : `Due in ${d}d`
              return (
                <div key={task.id} style={{ border: `1px solid ${border}`, borderRadius: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, lineHeight: 1.25 }}>{task.title}</p>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: muted }}>
                    {dueLabel}{task.productions ? ` · #${task.productions.production_number} ${task.productions.title}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Staff Workload + Next 14 Days</h2>
          <div style={{ marginTop: '8px', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
            {staffCards.map(({ member, personTasks, personOverdue, personProds }) => (
              <div key={member.id} style={{ border: `1px solid ${border}`, borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '999px', background: member.avatar_color, color: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                    {initials(member.name)}
                  </div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{member.name}</p>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: '12px', color: muted }}>
                  {personTasks.length} open task{personTasks.length !== 1 ? 's' : ''} · {personOverdue} overdue · {personProds.length} production{personProds.length !== 1 ? 's' : ''} upcoming
                </p>
                <div style={{ display: 'grid', gap: '4px' }}>
                  {personTasks.slice(0, 2).map(t => (
                    <p key={t.id} style={{ margin: 0, fontSize: '12px', color: '#d8e4ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Task: {t.title}
                    </p>
                  ))}
                  {personProds.slice(0, 2).map(pm => (
                    <p key={`${pm.production_id}-${pm.user_id}`} style={{ margin: 0, fontSize: '12px', color: '#a7c4ee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Prod: #{pm.productions?.production_number} {pm.productions?.title}
                    </p>
                  ))}
                  {personTasks.length === 0 && personProds.length === 0 && (
                    <p style={{ margin: 0, fontSize: '12px', color: muted }}>No current assignments.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
