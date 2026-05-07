'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'

interface OnboardingTask {
  id: string
  title: string
  description: string | null
  week: number
  sort_order: number
  completed: boolean
  completed_at: string | null
  assigned_to: string
}

interface TeamMember {
  id: string
  name: string
  avatar_color: string
  role: string
}

interface CurrentUser {
  id: string
  name: string
  role: string
}

interface InternSummary {
  intern: TeamMember
  tasks: OnboardingTask[]
  seeded: boolean
}

// ─── 36 hardcoded onboarding tasks ───────────────────────────────────────────
const ONBOARDING_TASKS: { title: string; description: string; week: number }[] = [
  // Week 1
  { week: 1, title: 'Complete HR new-hire paperwork', description: 'Fill out all required district HR forms and return to the front office.' },
  { week: 1, title: 'Get your district ID badge', description: 'Visit the district office to have your photo taken and receive your badge.' },
  { week: 1, title: 'Set up district email and log in', description: 'Activate your @canyonsdistrict.org email and confirm access.' },
  { week: 1, title: 'Office tour and desk setup', description: 'Tour the CSDTV office, learn where supplies are, and get your workspace ready.' },
  { week: 1, title: 'Meet the full CSDTV team', description: 'Introduction meetings with Justin and any other current staff or interns.' },
  { week: 1, title: 'Equipment room walkthrough', description: 'Learn the layout of the equipment room — cameras, audio, lighting, and streaming gear.' },
  { week: 1, title: 'Review equipment inventory spreadsheet', description: 'Familiarize yourself with what equipment we have and how it is tracked.' },
  { week: 1, title: 'Learn the equipment checkout process', description: 'Walk through how to check equipment in and out properly.' },
  { week: 1, title: 'Read Equipment Checkout Policy in Knowledge Base', description: 'Find and read the Equipment Checkout Policy article in the Team Hub Knowledge Base.' },
  { week: 1, title: 'Read Livestream Setup Process in Knowledge Base', description: 'Find and read the Livestream Setup Process article in the Team Hub Knowledge Base.' },
  { week: 1, title: 'Watch Justin demo a full livestream setup', description: 'Observe a complete setup from equipment pack to stream-live, ask questions.' },
  { week: 1, title: 'Shadow your first live production', description: 'Attend a real production event as an observer and take notes.' },
  { week: 1, title: 'Learn the productions tracking site', description: 'Get a tour of productions.canyonsdistrict.org and understand how requests come in.' },
  { week: 1, title: 'Log into the Team Hub', description: 'Sign in to csdtvstaff.org using your district email magic link.' },
  { week: 1, title: 'Set your weekly schedule in Team Hub', description: 'Add your default weekly hours in the Schedule section of the Team Hub.' },
  { week: 1, title: 'Review all Knowledge Base articles', description: 'Read every article in the Team Hub Knowledge Base to understand team processes.' },
  { week: 1, title: 'Complete district digital safety training', description: 'Finish the required online digital safety course assigned by the district.' },
  { week: 1, title: 'Week 1 check-in meeting with Justin', description: 'Sit down with Justin to review your first week, ask questions, and set goals for week 2.' },
  // Week 2
  { week: 2, title: 'Read Video Production Workflow in Knowledge Base', description: 'Study the full film, edit, and publish workflow before your first video project.' },
  { week: 2, title: 'Read Board Meeting Workflow in Knowledge Base', description: 'Study the board meeting production process end to end.' },
  { week: 2, title: 'Read Photo Headshot Workflow in Knowledge Base', description: 'Study the headshot session workflow before your first shoot.' },
  { week: 2, title: 'Observe a full board meeting production', description: 'Attend a board meeting production as an observer — watch setup, streaming, and teardown.' },
  { week: 2, title: 'First independent livestream setup (supervised)', description: 'Set up a full livestream on your own with Justin nearby to help if needed.' },
  { week: 2, title: 'Assist with a video shoot', description: 'Work alongside Justin or Ryan on a film shoot — handle camera, audio, or lighting.' },
  { week: 2, title: 'Complete a basic video edit', description: 'Edit a short piece of footage and deliver a rough cut for review.' },
  { week: 2, title: 'Export and deliver the final video', description: 'Export the approved edit in the correct format and upload it to the right folder.' },
  { week: 2, title: 'Assist with a headshot session', description: 'Help with equipment setup, lighting, and file management during a headshot session.' },
  { week: 2, title: 'First independent headshot session (supervised)', description: 'Run a headshot session on your own with Justin available for questions.' },
  { week: 2, title: 'Learn podcast equipment setup', description: 'Learn how to set up the podcast recording equipment from scratch.' },
  { week: 2, title: 'Assist with a podcast recording', description: 'Help with levels, recording, and file management during a live podcast session.' },
  { week: 2, title: 'Practice Google Drive file organization', description: 'Locate the shared team Drive, understand the folder structure, and practice filing correctly.' },
  { week: 2, title: 'Review file naming conventions', description: 'Learn and apply the team file naming standards for video, photos, and audio exports.' },
  { week: 2, title: 'Complete an equipment room organization task', description: 'Do a full reset of the equipment room — check all items in, label, organize shelves.' },
  { week: 2, title: 'Observe a second board meeting production', description: 'Attend another board meeting production and identify areas where you can take on more.' },
  { week: 2, title: 'Final onboarding review meeting with Justin', description: 'Review all 36 tasks, discuss strengths and areas to keep working on, set 30-day goals.' },
  { week: 2, title: 'Sign onboarding completion acknowledgment', description: 'Review and sign the onboarding completion form confirming you have finished all tasks.' },
]

/** Shorter track for district student interns (same `onboarding_tasks` table, different seed set). */
const STUDENT_ONBOARDING_TASKS: { title: string; description: string; week: number }[] = [
  { week: 1, title: 'Log into the Team Hub', description: 'Sign in to csdtvstaff.org using your district email magic link.' },
  { week: 1, title: 'Review assigned productions', description: 'Open Productions and confirm which shows you are listed on.' },
  { week: 1, title: 'Read Equipment Checkout Policy in Knowledge Base', description: 'Find and read the Equipment Checkout Policy article in the Team Hub Knowledge Base.' },
  { week: 1, title: 'Equipment room orientation', description: 'Walk the equipment room with a staff member; learn where items live and how checkout works.' },
  { week: 1, title: 'Shadow one production or classroom shoot', description: 'Attend as an observer; take notes on setup, roles, and safety.' },
  { week: 1, title: 'Complete district digital safety training', description: 'Finish the required online digital safety course assigned by the district.' },
  { week: 1, title: 'Week 1 check-in with your manager', description: 'Review expectations, hours, and questions about your assignments.' },
  { week: 2, title: 'Assist with one assigned production task', description: 'Work on a concrete task your manager assigns (camera, grip, logging, etc.).' },
  { week: 2, title: 'Student intern wrap-up', description: 'Review progress with your manager and confirm next steps.' },
]

export default function OnboardingPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState<string | null>(null)

  // Manager state
  const [internSummaries, setInternSummaries] = useState<InternSummary[]>([])
  const [studentSummaries, setStudentSummaries] = useState<InternSummary[]>([])
  const [selectedIntern, setSelectedIntern] = useState<TeamMember | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<TeamMember | null>(null)
  const [internTasks, setInternTasks] = useState<OnboardingTask[]>([])
  const [studentTasks, setStudentTasks] = useState<OnboardingTask[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Intern / student intern self-serve state
  const [myTasks, setMyTasks] = useState<OnboardingTask[]>([])

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  // ─── Load data based on role ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const userRes = await supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single()
    const user = userRes.data
    setCurrentUser(user)

    if (user?.role === 'Manager' || user?.role === 'Staff') {
      const internsRes = await supabase.from('team').select('*').eq('role', 'Intern').eq('active', true)
      const interns: TeamMember[] = internsRes.data || []
      const summaries: InternSummary[] = await Promise.all(
        interns.map(async (intern) => {
          const tasksRes = await supabase.from('onboarding_tasks').select('*').eq('assigned_to', intern.id).order('week').order('sort_order')
          const tasks = tasksRes.data || []
          return { intern, tasks, seeded: tasks.length > 0 }
        })
      )
      setInternSummaries(summaries)

      const studentsRes = await supabase.from('team').select('*').eq('role', 'Student Intern').eq('active', true)
      const students: TeamMember[] = studentsRes.data || []
      const studentSum: InternSummary[] = await Promise.all(
        students.map(async (s) => {
          const tasksRes = await supabase.from('onboarding_tasks').select('*').eq('assigned_to', s.id).order('week').order('sort_order')
          const tasks = tasksRes.data || []
          return { intern: s, tasks, seeded: tasks.length > 0 }
        })
      )
      setStudentSummaries(studentSum)
    } else if (user?.role === 'Intern' || user?.role === 'Student Intern') {
      const tasksRes = await supabase.from('onboarding_tasks').select('*').eq('assigned_to', user.id).order('week').order('sort_order')
      setMyTasks(tasksRes.data || [])
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  // ─── Seed tasks for an intern ──────────────────────────────────────────────
  const seedTasks = useCallback(async (intern: TeamMember) => {
    setSeeding(intern.id)
    const rows = ONBOARDING_TASKS.map((t, i) => ({
      title: t.title,
      description: t.description,
      week: t.week,
      sort_order: i,
      assigned_to: intern.id,
      completed: false,
      completed_at: null,
    }))
    const { data } = await supabase.from('onboarding_tasks').insert(rows).select('*')
    if (data) {
      setInternSummaries(prev => prev.map(s =>
        s.intern.id === intern.id ? { ...s, tasks: data, seeded: true } : s
      ))
    }
    setSeeding(null)
  }, [supabase])

  const seedStudentTasks = useCallback(async (student: TeamMember) => {
    setSeeding(student.id)
    const rows = STUDENT_ONBOARDING_TASKS.map((t, i) => ({
      title: t.title,
      description: t.description,
      week: t.week,
      sort_order: i,
      assigned_to: student.id,
      completed: false,
      completed_at: null,
    }))
    const { data } = await supabase.from('onboarding_tasks').insert(rows).select('*')
    if (data) {
      setStudentSummaries(prev => prev.map(s =>
        s.intern.id === student.id ? { ...s, tasks: data, seeded: true } : s
      ))
    }
    setSeeding(null)
  }, [supabase])

  // ─── Open intern detail (manager) ─────────────────────────────────────────
  const openInternDetail = useCallback(async (intern: TeamMember) => {
    setLoadingDetail(true)
    setSelectedStudent(null)
    setStudentTasks([])
    setSelectedIntern(intern)
    const tasksRes = await supabase.from('onboarding_tasks').select('*').eq('assigned_to', intern.id).order('week').order('sort_order')
    setInternTasks(tasksRes.data || [])
    setLoadingDetail(false)
  }, [supabase])

  const openStudentDetail = useCallback(async (student: TeamMember) => {
    setLoadingDetail(true)
    setSelectedIntern(null)
    setInternTasks([])
    setSelectedStudent(student)
    const tasksRes = await supabase.from('onboarding_tasks').select('*').eq('assigned_to', student.id).order('week').order('sort_order')
    setStudentTasks(tasksRes.data || [])
    setLoadingDetail(false)
  }, [supabase])

  // ─── Toggle task ───────────────────────────────────────────────────────────
  const toggleTask = useCallback(async (
    task: OnboardingTask,
    setFn: React.Dispatch<React.SetStateAction<OnboardingTask[]>>
  ) => {
    const completed = !task.completed
    const completed_at = completed ? new Date().toISOString() : null
    await supabase.from('onboarding_tasks').update({ completed, completed_at }).eq('id', task.id)
    setFn(prev => prev.map(t => t.id === task.id ? { ...t, completed, completed_at } : t))
    // Also refresh summary counts
    if (selectedIntern) {
      setInternSummaries(prev => prev.map(s => {
        if (s.intern.id !== selectedIntern.id) return s
        return { ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed, completed_at } : t) }
      }))
    }
    if (selectedStudent) {
      setStudentSummaries(prev => prev.map(s => {
        if (s.intern.id !== selectedStudent.id) return s
        return { ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed, completed_at } : t) }
      }))
    }
  }, [supabase, selectedIntern, selectedStudent])

  // ─── Reset onboarding for an intern ─────────────────────────────────────
  const resetOnboarding = useCallback(async (intern: TeamMember) => {
    if (!confirm(`Reset all onboarding tasks for ${intern.name}? This will delete all their tasks and progress.`)) return
    await supabase.from('onboarding_tasks').delete().eq('assigned_to', intern.id)
    setInternSummaries(prev => prev.map(s =>
      s.intern.id === intern.id ? { ...s, tasks: [], seeded: false } : s
    ))
    if (selectedIntern?.id === intern.id) {
      setInternTasks([])
      setSelectedIntern(null)
    }
  }, [supabase, selectedIntern])

  const resetStudentOnboarding = useCallback(async (student: TeamMember) => {
    if (!confirm(`Reset all onboarding tasks for ${student.name}? This will delete all their tasks and progress.`)) return
    await supabase.from('onboarding_tasks').delete().eq('assigned_to', student.id)
    setStudentSummaries(prev => prev.map(s =>
      s.intern.id === student.id ? { ...s, tasks: [], seeded: false } : s
    ))
    if (selectedStudent?.id === student.id) {
      setStudentTasks([])
      setSelectedStudent(null)
    }
  }, [supabase, selectedStudent])

  // ─── Week section component ────────────────────────────────────────────────
  const WeekSection = ({
    weekNum, weekTasks, setFn,
  }: {
    weekNum: number
    weekTasks: OnboardingTask[]
    setFn: React.Dispatch<React.SetStateAction<OnboardingTask[]>>
  }) => {
    const done = weekTasks.filter(t => t.completed).length
    const pct  = weekTasks.length > 0 ? Math.round((done / weekTasks.length) * 100) : 0
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0 }}>Week {weekNum}</h2>
          <span style={{ fontSize: '13px', color: muted }}>{done} of {weekTasks.length} complete</span>
          <div style={{ flex: 1, height: '4px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden', maxWidth: '120px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        </div>
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
          {weekTasks.map((task, i) => (
            <div
              key={task.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px', borderBottom: i < weekTasks.length - 1 ? `0.5px solid ${border}` : 'none', background: task.completed ? (dark ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.03)') : 'transparent' }}
            >
              <button
                onClick={() => toggleTask(task, setFn)}
                style={{ width: '18px', height: '18px', borderRadius: '4px', border: `1.5px solid ${task.completed ? '#22c55e' : border}`, background: task.completed ? '#22c55e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}
              >
                {task.completed && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 500, color: task.completed ? muted : text, margin: 0, textDecoration: task.completed ? 'line-through' : 'none' }}>
                  {task.title}
                </p>
                {task.description && (
                  <p style={{ fontSize: '13px', color: muted, margin: '3px 0 0', lineHeight: 1.5 }}>
                    {task.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const isManager = currentUser?.role === 'Manager'

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  // ─── INTERN / STUDENT INTERN VIEW ──────────────────────────────────────────
  if (currentUser?.role === 'Intern' || currentUser?.role === 'Student Intern') {
    const week1 = myTasks.filter(t => t.week === 1)
    const week2 = myTasks.filter(t => t.week === 2)
    const totalDone = myTasks.filter(t => t.completed).length
    const pct = myTasks.length > 0 ? Math.round((totalDone / myTasks.length) * 100) : 0
    const traineeHint = currentUser.role === 'Student Intern' ? 'Your student intern checklist' : 'Your two-week checklist'
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>Onboarding</h1>
            <p style={{ fontSize: '14px', color: muted, margin: '3px 0 0' }}>{traineeHint}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '100px', height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '14px', color: muted }}>{totalDone} / {myTasks.length}</span>
          </div>
        </div>
        {myTasks.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '60px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px' }}>
            <p style={{ fontSize: '15px', color: muted, margin: 0 }}>Your onboarding tasks haven't been set up yet.</p>
            <p style={{ fontSize: '14px', color: muted, margin: '6px 0 0' }}>Check back soon or ask your manager.</p>
          </div>
        ) : (
          <>
            <WeekSection weekNum={1} weekTasks={week1} setFn={setMyTasks} />
            <WeekSection weekNum={2} weekTasks={week2} setFn={setMyTasks} />
          </>
        )}
      </div>
    )
  }

  // ─── MANAGER — INTERN DETAIL VIEW ─────────────────────────────────────────
  if (selectedIntern) {
    const week1 = internTasks.filter(t => t.week === 1)
    const week2 = internTasks.filter(t => t.week === 2)
    const totalDone = internTasks.filter(t => t.completed).length
    const pct = internTasks.length > 0 ? Math.round((totalDone / internTasks.length) * 100) : 0
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Back + header */}
        <button
          onClick={() => { setSelectedIntern(null); setInternTasks([]) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: muted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 16px', fontFamily: 'inherit' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          All interns
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: selectedIntern.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
              {selectedIntern.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>{selectedIntern.name}</h1>
              <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>Intern onboarding</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '100px', height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '14px', color: muted }}>{totalDone} / {internTasks.length}</span>
            {isManager && (
              <button onClick={() => resetOnboarding(selectedIntern)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Reset
              </button>
            )}
          </div>
        </div>
        {loadingDetail ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}><Loader /></div>
        ) : (
          <>
            <WeekSection weekNum={1} weekTasks={week1} setFn={setInternTasks} />
            <WeekSection weekNum={2} weekTasks={week2} setFn={setInternTasks} />
          </>
        )}
      </div>
    )
  }

  // ─── MANAGER — STUDENT INTERN DETAIL VIEW ─────────────────────────────────
  if (selectedStudent) {
    const week1 = studentTasks.filter(t => t.week === 1)
    const week2 = studentTasks.filter(t => t.week === 2)
    const totalDone = studentTasks.filter(t => t.completed).length
    const pct = studentTasks.length > 0 ? Math.round((totalDone / studentTasks.length) * 100) : 0
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button
          onClick={() => { setSelectedStudent(null); setStudentTasks([]) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: muted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 16px', fontFamily: 'inherit' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          All student interns
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: selectedStudent.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
              {selectedStudent.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>{selectedStudent.name}</h1>
              <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>Student intern onboarding</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '100px', height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '14px', color: muted }}>{totalDone} / {studentTasks.length}</span>
            {isManager && (
              <button onClick={() => resetStudentOnboarding(selectedStudent)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Reset
              </button>
            )}
          </div>
        </div>
        {loadingDetail ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}><Loader /></div>
        ) : (
          <>
            <WeekSection weekNum={1} weekTasks={week1} setFn={setStudentTasks} />
            <WeekSection weekNum={2} weekTasks={week2} setFn={setStudentTasks} />
          </>
        )}
      </div>
    )
  }

  // ─── MANAGER — OVERVIEW ───────────────────────────────────────────────────
  const totalInterns = internSummaries.length
  const totalStudents = studentSummaries.length
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>Onboarding</h1>
        <p style={{ fontSize: '14px', color: muted, margin: '3px 0 0' }}>
          {totalInterns === 0 ? 'No interns added yet' : `${totalInterns} intern${totalInterns !== 1 ? 's' : ''}`}
        </p>
      </div>

      {totalInterns === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '60px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px' }}>
          <p style={{ fontSize: '15px', color: muted, margin: 0 }}>No interns on the team yet.</p>
          <p style={{ fontSize: '14px', color: muted, margin: '6px 0 0' }}>Add interns in Settings and their onboarding will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {internSummaries.map(({ intern, tasks, seeded }) => {
            const done = tasks.filter(t => t.completed).length
            const total = tasks.length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const isSeeding = seeding === intern.id
            return (
              <div
                key={intern.id}
                onClick={seeded ? () => openInternDetail(intern) : undefined}
                style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', cursor: seeded ? 'pointer' : 'default', transition: 'all 0.15s' }}
                onMouseEnter={e => { if (seeded) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
                onMouseLeave={e => { if (seeded) (e.currentTarget as HTMLDivElement).style.background = cardBg }}
              >
                {/* Avatar + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: intern.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                    {intern.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: text, margin: 0 }}>{intern.name}</p>
                    <p style={{ fontSize: '13px', color: muted, margin: '1px 0 0' }}>Intern</p>
                  </div>
                  {seeded && pct === 100 && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>

                {/* Progress or seed button */}
                {seeded ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: muted }}>Progress</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: pct === 100 ? '#22c55e' : text }}>{done} / {total}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '3px', transition: 'width 0.3s' }} />
                    </div>
                    <p style={{ fontSize: '12px', color: muted, margin: '8px 0 0', textAlign: 'right' as const }}>
                      {pct === 100 ? 'Complete ✓' : `${pct}%`}
                    </p>
                  </div>
                ) : isManager ? (
                  <button
                    onClick={e => { e.stopPropagation(); seedTasks(intern) }}
                    disabled={isSeeding}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: isSeeding ? 'var(--surface-2)' : '#1e6cb5', color: isSeeding ? muted : '#fff', border: 'none', cursor: isSeeding ? 'wait' : 'pointer', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit' }}
                  >
                    {isSeeding ? 'Setting up...' : 'Initialize onboarding'}
                  </button>
                ) : (
                  <p style={{ fontSize: '13px', color: muted, margin: 0, textAlign: 'center' as const }}>Not yet initialized</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '40px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: 0 }}>Student interns</h2>
        <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>
          {totalStudents === 0 ? 'No student interns yet' : `${totalStudents} student intern${totalStudents !== 1 ? 's' : ''}`}
        </p>
      </div>
      {totalStudents === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '40px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px' }}>
          <p style={{ fontSize: '15px', color: muted, margin: 0 }}>No Student Intern users on the team.</p>
          <p style={{ fontSize: '14px', color: muted, margin: '6px 0 0' }}>Invite them in Settings with role &quot;Student Intern&quot;.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {studentSummaries.map(({ intern: st, tasks, seeded }) => {
            const done = tasks.filter(t => t.completed).length
            const total = tasks.length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const isSeeding = seeding === st.id
            return (
              <div
                key={st.id}
                onClick={seeded ? () => openStudentDetail(st) : undefined}
                style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', cursor: seeded ? 'pointer' : 'default', transition: 'all 0.15s' }}
                onMouseEnter={e => { if (seeded) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
                onMouseLeave={e => { if (seeded) (e.currentTarget as HTMLDivElement).style.background = cardBg }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: st.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                    {st.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: text, margin: 0 }}>{st.name}</p>
                    <p style={{ fontSize: '13px', color: muted, margin: '1px 0 0' }}>Student Intern</p>
                  </div>
                  {seeded && pct === 100 && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                {seeded ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: muted }}>Progress</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: pct === 100 ? '#22c55e' : text }}>{done} / {total}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '3px', transition: 'width 0.3s' }} />
                    </div>
                    <p style={{ fontSize: '12px', color: muted, margin: '8px 0 0', textAlign: 'right' as const }}>
                      {pct === 100 ? 'Complete ✓' : `${pct}%`}
                    </p>
                  </div>
                ) : isManager ? (
                  <button
                    onClick={e => { e.stopPropagation(); seedStudentTasks(st) }}
                    disabled={isSeeding}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: isSeeding ? 'var(--surface-2)' : '#1e6cb5', color: isSeeding ? muted : '#fff', border: 'none', cursor: isSeeding ? 'wait' : 'pointer', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit' }}
                  >
                    {isSeeding ? 'Setting up...' : 'Initialize onboarding'}
                  </button>
                ) : (
                  <p style={{ fontSize: '13px', color: muted, margin: 0, textAlign: 'center' as const }}>Not yet initialized</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}