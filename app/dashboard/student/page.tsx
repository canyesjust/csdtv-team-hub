'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'
import { ZoneHeader } from '../components/ZoneHeader'
import { getSchoolName } from '@/lib/schools'
import { uiStyles, statusTone } from '@/lib/ui/styles'
import { isStudentInternRole } from '@/lib/roles'

interface Task {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string
  productions?: { title: string } | null
}

interface Production {
  id: string
  production_number: number
  title: string
  request_type_label: string | null
  type: string | null
  status: string | null
  start_datetime: string | null
  filming_location: string | null
  school_department: string | null
  checklist_items?: { id: string; title: string; completed: boolean }[]
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
}

interface CurrentUser {
  id: string
  name: string
  role: string
}

function getProgress(prod: Production) {
  const items = prod.checklist_items || []
  if (items.length === 0) return null
  const done = items.filter(c => c.completed).length
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

function formatDate(due: string | null) {
  if (!due) return { label: '—', color: 'var(--text-muted)' as const }
  const dueDate = new Date(due + 'T12:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)
  const diff = Math.round((dueDate.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: statusTone.danger.color }
  if (diff === 0) return { label: 'Today', color: statusTone.warning.color }
  if (diff <= 7) return { label: `In ${diff}d`, color: 'var(--text-primary)' as const }
  return { label: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'var(--text-muted)' as const }
}

export default function StudentHomePage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myProductions, setMyProductions] = useState<Production[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const rowHover = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: user } = await supabase.from('team').select('id, name, role').eq('supabase_user_id', session.user.id).single()
    if (!user) return
    if (!isStudentInternRole(user.role)) {
      router.replace('/dashboard')
      return
    }
    setCurrentUser(user)

    const [tasksRes, membersRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, productions(title)')
        .eq('assigned_to', user.id)
        .neq('status', 'complete')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20),
      supabase.from('production_members').select('production_id').eq('user_id', user.id),
    ])

    setMyTasks(tasksRes.data || [])
    const ids = [...new Set((membersRes.data || []).map(m => m.production_id).filter(Boolean))] as string[]
    if (ids.length === 0) {
      setMyProductions([])
      setLoading(false)
      return
    }
    const { data: prods } = await supabase
      .from('productions')
      .select(
        'id, production_number, title, request_type_label, type, status, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(id, title, completed)'
      )
      .in('id', ids)
      .order('start_datetime', { ascending: true, nullsFirst: false })
      .limit(30)

    const cleaned: Production[] = (prods || []).map((p: Record<string, unknown>) => ({
      ...p,
      production_members: ((p.production_members as unknown[]) || []).map((m: Record<string, unknown>) => ({
        ...m,
        team: Array.isArray(m.team) ? (m.team[0] || null) : (m.team || null),
      })),
    })) as Production[]

    setMyProductions(cleaned)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const completeTask = async (taskId: string) => {
    setCompleting(prev => new Set(prev).add(taskId))
    await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', taskId)
    setTimeout(() => {
      setMyTasks(prev => prev.filter(t => t.id !== taskId))
      setCompleting(prev => {
        const n = new Set(prev)
        n.delete(taskId)
        return n
      })
    }, 400)
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {greeting()}, {currentUser?.name?.split(' ')[0]}
        </h1>
        <p style={{ fontSize: '14px', color: muted, margin: 0 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · Your productions and tasks
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
        <section style={uiStyles.zoneSection}>
          <ZoneHeader label="My productions" hint="Shows where you are on the crew list" accent="#5ba3e0" />
          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
              <span style={{ fontSize: '13px', color: muted }}>{myProductions.length} production{myProductions.length !== 1 ? 's' : ''}</span>
              <Link href="/dashboard/productions" style={uiStyles.panelLink}>
                Open list →
              </Link>
            </div>
            {myProductions.length === 0 ? (
              <p style={{ padding: '28px 16px', fontSize: '14px', color: muted, margin: 0, textAlign: 'center' }}>
                You are not listed on any productions yet.
              </p>
            ) : (
              myProductions.map((p, i) => {
                const progress = getProgress(p)
                const loc = getSchoolName(p.filming_location) || getSchoolName(p.school_department) || p.filming_location || ''
                return (
                  <Link
                    key={p.id}
                    href={`/dashboard/productions/${p.production_number}`}
                    style={{
                      textDecoration: 'none',
                      display: 'block',
                      padding: '12px 16px',
                      borderBottom: i < myProductions.length - 1 ? `1px solid ${border}` : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = rowHover)}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
                  >
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: text }}>
                      #{p.production_number} {p.title}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>
                      {p.request_type_label || p.type || 'Production'}
                      {loc ? ` · ${loc}` : ''}
                      {progress ? ` · ${progress.done}/${progress.total} checklist` : ''}
                    </p>
                  </Link>
                )
              })
            )}
          </div>
        </section>

        <section style={uiStyles.zoneSection}>
          <ZoneHeader label="My tasks" hint="Assigned to you" accent="#e8a020" />
          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
              <span style={{ fontSize: '13px', color: muted }}>{myTasks.length} open</span>
              <Link href="/dashboard/tasks" style={uiStyles.panelLink}>
                Task center →
              </Link>
            </div>
            {myTasks.length === 0 ? (
              <p style={{ padding: '28px 16px', fontSize: '14px', color: muted, margin: 0, textAlign: 'center' }}>
                No open tasks assigned to you.
              </p>
            ) : (
              myTasks.slice(0, 12).map((task, idx) => {
                const dateInfo = formatDate(task.due_date)
                const busy = completing.has(task.id)
                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: idx < Math.min(myTasks.length, 12) - 1 ? `1px solid ${border}` : 'none',
                    }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => completeTask(task.id)}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '6px',
                        border: `1.5px solid ${border}`,
                        background: 'transparent',
                        cursor: busy ? 'wait' : 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Mark complete"
                    >
                      {busy ? (
                        <span style={{ width: '10px', height: '10px', border: '2px solid var(--border-subtle)', borderTopColor: '#5ba3e0', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      ) : null}
                    </button>
                    <Link href="/dashboard/tasks" style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.productions?.title || 'Task'} · <span style={{ color: dateInfo.color }}>{dateInfo.label}</span>
                      </p>
                    </Link>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      <p style={{ marginTop: '20px', fontSize: '13px', color: muted }}>
        Use the sidebar for Productions, Tasks, Knowledge base, Onboarding, and Settings.
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
