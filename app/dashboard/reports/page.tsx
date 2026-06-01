'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import Loader from '../components/Loader'
import { getSchoolName } from '@/lib/schools'
import { getDefaultExternalCostForType } from '@/lib/external-production-costs'

const ReportsValueTab = dynamic(() => import('./ReportsValueTab'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
      <Loader />
    </div>
  ),
})
import { toast } from '@/lib/toast'

interface Production { id: string; title: string; production_number: number; status: string | null; request_type_label: string | null; school_department: string | null; start_datetime: string | null; school_year: string | null; synced_at: string | null; estimated_external_cost: number | null }
interface Task { id: string; status: string; assigned_to: string | null; completed_at: string | null; created_at: string; priority: string }
interface Activity { id: string; production_id: string; action: string; created_at: string }
interface Video { id: string; title: string; status: string; video_type: string; date_published: string | null; created_at: string }
interface Destination { id: string; video_id: string; platform: string; view_count: number | null }
interface Talent { id: string; video_id: string; release_status: string }
interface Loan { id: string; equipment_id: string; checked_out_at: string; checked_in_at: string | null; equipment?: { name: string; asset_tag: string } | null }
interface Equipment { id: string; name: string; asset_tag: string; status: string; category_id: string | null }
interface TeamMember { id: string; name: string; role: string; avatar_color: string }
interface ProdMember { production_id: string; user_id: string }
interface CameraPackageRow { option_id: number; label: string; cost: number }

const TYPE_COLORS: Record<string, string> = {
  'Photo Headshots': '#e8a020', 'Create a Video(Film, Edit, Publish)': '#5ba3e0', 'LiveStream Meeting': '#22c55e',
  'Record Meeting': '#9b85e0', 'Podcast': '#f97316', 'Board Meeting': '#ef4444',
}

export default function ReportsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'productions' | 'team' | 'videos' | 'equipment' | 'value'>('overview')
  const [yearFilter, setYearFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')

  const [productions, setProductions] = useState<Production[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [talent, setTalent] = useState<Talent[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [prodMembers, setProdMembers] = useState<ProdMember[]>([])
  const [allSchools, setAllSchools] = useState<{ code: string; name: string; type: string }[]>([])
  const [timeEntries, setTimeEntries] = useState<{ task_id: string; hours: number }[]>([])
  const [taskProdMap, setTaskProdMap] = useState<Record<string, string>>({})
  const [cameraPackages, setCameraPackages] = useState<CameraPackageRow[]>([])
  const [recomputing, setRecomputing] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [prodsRes, tasksRes, actRes, videosRes, destRes, talentRes, loansRes, eqRes, teamRes, pmRes, schoolsRes, timeRes, taskProdsRes, camPkgRes] = await Promise.all([
      supabase.from('productions').select('id, title, production_number, status, request_type_label, school_department, start_datetime, school_year, synced_at, estimated_external_cost, deliverables_count').order('production_number'),
      supabase.from('tasks').select('id, status, assigned_to, completed_at, created_at, priority'),
      supabase.from('production_activity').select('id, production_id, action, created_at').order('created_at'),
      supabase.from('videos').select('id, title, status, video_type, date_published, created_at, youtube_views, youtube_likes, youtube_url, youtube_thumbnail'),
      supabase.from('video_destinations').select('id, video_id, platform, view_count'),
      supabase.from('video_talent').select('id, video_id, release_status'),
      supabase.from('equipment_loans').select('id, equipment_id, checked_out_at, checked_in_at, equipment(name, asset_tag)').order('checked_out_at', { ascending: false }),
      supabase.from('equipment').select('id, name, asset_tag, status, category_id'),
      supabase.from('team').select('id, name, role, avatar_color').eq('active', true),
      supabase.from('production_members').select('production_id, user_id'),
      supabase.from('schools').select('code, name, type').order('name'),
      supabase.from('time_entries').select('task_id, hours'),
      supabase.from('tasks').select('id, production_id').not('production_id', 'is', null),
      supabase.from('cost_camera_packages').select('option_id, label, cost').eq('active', true).order('display_order'),
    ])
    setProductions(prodsRes.data || [])
    setCameraPackages((camPkgRes.data as CameraPackageRow[]) || [])
    setTasks(tasksRes.data || [])
    setActivity(actRes.data || [])
    setVideos(videosRes.data || [])
    setDestinations(destRes.data || [])
    setTalent(talentRes.data || [])
    setLoans(loansRes.data as any || [])
    setEquipment(eqRes.data || [])
    setTeam(teamRes.data || [])
    setProdMembers(pmRes.data || [])
    setAllSchools(schoolsRes.data || [])
    setTimeEntries(timeRes.data || [])
    const tpMap: Record<string, string> = {}
    ;(taskProdsRes.data || []).forEach((t: any) => { if (t.production_id) tpMap[t.id] = t.production_id })
    setTaskProdMap(tpMap)
    setLoading(false)
  }, [supabase])

  const recomputeAll = useCallback(async () => {
    setRecomputing(true)
    const { data, error } = await supabase.rpc('recompute_all_estimated_costs')
    setRecomputing(false)
    if (error) {
      toast(`Recompute failed: ${error.message}`, 'error')
      return
    }
    const n = typeof data === 'number' ? data : Number(data)
    toast(`Recomputed ${Number.isFinite(n) ? n : 0} productions`, 'success')
    await loadData()
  }, [supabase, loadData])

  useEffect(() => { loadData() }, [loadData])

  // Filtered data
  const years = [...new Set(productions.map(p => p.school_year).filter(Boolean))] as string[]
  const types = [...new Set(productions.map(p => p.request_type_label).filter(Boolean))] as string[]
  const fp = productions.filter(p => {
    if (yearFilter && p.school_year !== yearFilter) return false
    if (typeFilter && p.request_type_label !== typeFilter) return false
    if (dateStart && p.start_datetime && new Date(p.start_datetime) < new Date(dateStart)) return false
    if (dateEnd && p.start_datetime && new Date(p.start_datetime) > new Date(dateEnd + 'T23:59:59')) return false
    return true
  })
  const fv = videos

  // CSV export
  const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Helpers
  const pctBar = (value: number, max: number, color: string) => {
    const pct = max ? (value / max) * 100 : 0
    return (
      <div style={{ flex: 1, height: '8px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px' }} />
      </div>
    )
  }

  const metricCard = (label: string, value: string | number, sub: string, color?: string) => (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '18px 20px' }}>
      <p style={{ fontSize: '12px', fontWeight: 600, color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }}>{label}</p>
      <p style={{ fontSize: '32px', fontWeight: 800, color: color || text, margin: '0 0 2px', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{sub}</p>
    </div>
  )

  const sectionCard = (title: string, children: React.ReactNode) => (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '14px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.8px', margin: '0 0 16px' }}>{title}</h3>
      {children}
    </div>
  )

  // Computed metrics
  const completedProds = fp.filter(p => p.status === 'Complete').length
  const completedTasks = tasks.filter(t => t.status === 'complete').length
  const publishedVideos = fv.filter(v => v.status === 'Published').length
  const totalViews = destinations.reduce((sum, d) => sum + (d.view_count || 0), 0)
  const totalVidsProduced = fp.reduce((sum: number, p: any) => sum + (p.deliverables_count || 0), 0)
  const totalYtViews = fv.reduce((sum: number, v: any) => sum + (v.youtube_views || 0), 0)
  const totalYtLikes = fv.reduce((sum: number, v: any) => sum + (v.youtube_likes || 0), 0)
  const topYtVideos = [...fv].filter((v: any) => v.youtube_views > 0).sort((a: any, b: any) => (b.youtube_views || 0) - (a.youtube_views || 0)).slice(0, 10)

  // Production type breakdown
  const typeBreakdown = Object.entries(fp.reduce((acc, p) => {
    const type = p.request_type_label || 'Other'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
  const maxTypeCount = Math.max(...typeBreakdown.map(([, c]) => c), 1)

  // School breakdown
  const schoolBreakdown = Object.entries(fp.filter(p => p.school_department).reduce((acc, p) => {
    const name = getSchoolName(p.school_department) || p.school_department || 'Unknown'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
  const maxSchoolCount = Math.max(...schoolBreakdown.map(([, c]) => c), 1)

  // Monthly breakdown (last 12 months)
  const monthlyBreakdown = (() => {
    const months: { label: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      const y = d.getFullYear(); const m = d.getMonth()
      const count = fp.filter(p => { if (!p.start_datetime) return false; const pd = new Date(p.start_datetime); return pd.getFullYear() === y && pd.getMonth() === m }).length
      months.push({ label, count })
    }
    return months
  })()
  const maxMonthly = Math.max(...monthlyBreakdown.map(m => m.count), 1)

  // Team workload
  const teamWorkload = team.map(member => {
    const openTasks = tasks.filter(t => t.assigned_to === member.id && t.status !== 'complete').length
    const doneTasks = tasks.filter(t => t.assigned_to === member.id && t.status === 'complete').length
    const prodsAssigned = prodMembers.filter(pm => pm.user_id === member.id).length
    return { ...member, openTasks, doneTasks, prodsAssigned }
  }).sort((a, b) => b.prodsAssigned - a.prodsAssigned)
  const maxTeamProds = Math.max(...teamWorkload.map(t => t.prodsAssigned), 1)

  // Turnaround by type
  const turnaroundByType = (() => {
    const results: Record<string, { total: number; count: number }> = {}
    fp.filter(p => p.status === 'Complete' && p.synced_at).forEach(p => {
      const type = p.request_type_label || 'Other'
      const acts = activity.filter(a => a.production_id === p.id)
      if (acts.length === 0) return
      const firstAct = new Date(acts[0].created_at)
      const lastAct = new Date(acts[acts.length - 1].created_at)
      const days = Math.max(1, Math.round((lastAct.getTime() - firstAct.getTime()) / (1000 * 60 * 60 * 24)))
      if (!results[type]) results[type] = { total: 0, count: 0 }
      results[type].total += days
      results[type].count++
    })
    return Object.entries(results).map(([type, { total, count }]) => ({ type, avg: Math.round(total / count) })).sort((a, b) => a.avg - b.avg)
  })()

  // Equipment utilization
  const eqCheckoutCounts = loans.reduce((acc, l) => {
    const tag = (l.equipment as any)?.asset_tag || l.equipment_id
    const name = (l.equipment as any)?.name || 'Unknown'
    const key = `${tag}|${name}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const topEquipment = Object.entries(eqCheckoutCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const maxEqCount = Math.max(...topEquipment.map(([, c]) => c), 1)
  const overdueLoans = loans.filter(l => !l.checked_in_at)

  // Video distribution
  const platformBreakdown = Object.entries(destinations.reduce((acc, d) => {
    acc[d.platform] = (acc[d.platform] || 0) + 1
    return acc
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])

  // Release compliance
  const releasesByStatus = Object.entries(talent.reduce((acc, t) => {
    acc[t.release_status] = (acc[t.release_status] || 0) + 1
    return acc
  }, {} as Record<string, number>))
  const totalTalent = talent.length
  const signedReleases = talent.filter(t => t.release_status === 'signed' || t.release_status === 'not_required').length
  const complianceRate = totalTalent > 0 ? Math.round((signedReleases / totalTalent) * 100) : 100

  // Cost savings
  const costSavings = fp.reduce((sum, p) => {
    if (p.estimated_external_cost != null) return sum + Number(p.estimated_external_cost)
    const type = p.request_type_label || 'Other, Unsure, Or Consultation'
    return sum + getDefaultExternalCostForType(type)
  }, 0)
  const costByType = Object.entries(fp.reduce((acc, p) => {
    const type = p.request_type_label || 'Other'
    const cost = p.estimated_external_cost != null ? Number(p.estimated_external_cost) : getDefaultExternalCostForType(type)
    acc[type] = (acc[type] || 0) + cost
    return acc
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
  const maxCost = Math.max(...costByType.map(([, c]) => c), 1)

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'productions', label: 'Productions' },
    { key: 'team', label: 'Team' },
    { key: 'videos', label: 'Videos' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'value', label: 'Cost savings' },
  ] as const

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap' as const, gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: 0 }}>Reports</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>Data-driven insights for CSDtv</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
            <option value="">All years</option>
            {years.map(y => <option key={y} value={y}>{Number(y) - 1}–{y}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} placeholder="Start" style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none' }} />
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} placeholder="End" style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none' }} />
          {(yearFilter || typeFilter || dateStart || dateEnd) && (
            <button onClick={() => { setYearFilter(''); setTypeFilter(''); setDateStart(''); setDateEnd('') }} style={{ fontSize: '12px', padding: '8px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Tabs + Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' as const }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #5ba3e0' : '2px solid transparent', padding: '10px 16px', fontSize: '14px', fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
            {t.label}
          </button>
        ))}
        </div>
        <button onClick={() => {
          if (tab === 'overview' || tab === 'productions') {
            exportCSV(`csdtv-productions-${tab}`, ['#', 'Title', 'Type', 'Status', 'School', 'Date', 'School Year'], fp.map(p => [String(p.production_number), p.title, p.request_type_label || '', p.status || '', p.school_department || '', p.start_datetime ? new Date(p.start_datetime).toLocaleDateString() : '', p.school_year || '']))
          } else if (tab === 'team') {
            exportCSV('csdtv-team-workload', ['Name', 'Role', 'Productions', 'Open Tasks', 'Done Tasks'], teamWorkload.map(m => [m.name, m.role, String(m.prodsAssigned), String(m.openTasks), String(m.doneTasks)]))
          } else if (tab === 'videos') {
            exportCSV('csdtv-videos', ['Title', 'Type', 'Status', 'Published'], fv.map(v => [v.title, v.video_type, v.status, v.date_published || '']))
          } else if (tab === 'equipment') {
            exportCSV('csdtv-equipment', ['Asset Tag', 'Name', 'Status'], equipment.map(e => [e.asset_tag, e.name, e.status]))
          } else if (tab === 'value') {
            exportCSV('csdtv-cost-savings', ['Type', 'Count', 'Rate', 'Total'], costByType.map(([type, cost]) => { const count = fp.filter(p => (p.request_type_label || 'Other') === type).length; return [type, String(count), String(getDefaultExternalCostForType(type)), String(cost)] }))
          }
        }} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </button>
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {metricCard('Productions', fp.length, `${completedProds} completed`)}
            {metricCard('Videos Produced', totalVidsProduced > 0 ? totalVidsProduced.toLocaleString() : String(fv.length), totalVidsProduced > 0 ? `${fv.length} in library · ${publishedVideos} published` : `${publishedVideos} published`)}
            {metricCard('Tasks done', completedTasks, `${tasks.filter(t => t.status !== 'complete').length} open`)}
            {metricCard('Total Views', (totalViews + totalYtViews) > 0 ? (totalViews + totalYtViews).toLocaleString() : '—', totalYtViews > 0 ? `${totalYtViews.toLocaleString()} YouTube` : 'across platforms')}
            {metricCard('Schools served', String(new Set(fp.filter(p => p.school_department).map(p => p.school_department)).size), 'unique schools')}
            {metricCard('Est. value', `$${Math.round(costSavings / 1000)}k`, 'if outsourced', '#22c55e')}
          </div>
          {sectionCard('Production volume — last 12 months', (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px' }}>
              {monthlyBreakdown.map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: text, fontWeight: 600 }}>{m.count || ''}</span>
                  {(() => { const h = maxMonthly ? (m.count / maxMonthly) * 90 : 0; return <div style={{ width: '100%', height: `${h}px`, background: '#1e6cb5', borderRadius: '4px 4px 0 0', minHeight: m.count ? '4px' : '0px', transition: 'height 0.3s' }} /> })()}
                  <span style={{ fontSize: '10px', color: muted, whiteSpace: 'nowrap' as const }}>{m.label}</span>
                </div>
              ))}
            </div>
          ))}
          {sectionCard('Top production types', (
            <div>
              {typeBreakdown.slice(0, 6).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                  <span style={{ fontSize: '13px', color: text, minWidth: '200px' }}>{type}</span>
                  {pctBar(count, maxTypeCount, TYPE_COLORS[type] || '#5ba3e0')}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '30px', textAlign: 'right' as const }}>{count}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* PRODUCTIONS */}
      {tab === 'productions' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {metricCard('Total', fp.length, 'productions')}
            {metricCard('In progress', fp.filter(p => p.status === 'In Progress').length, 'active now')}
            {metricCard('Scheduled', fp.filter(p => p.status === 'Approved/Scheduled').length, 'upcoming')}
            {metricCard('Completed', completedProds, 'delivered')}
          </div>
          {sectionCard('By type', (
            <div>
              {typeBreakdown.map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                  <span style={{ fontSize: '13px', color: text, minWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{type}</span>
                  {pctBar(count, maxTypeCount, TYPE_COLORS[type] || '#5ba3e0')}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '30px', textAlign: 'right' as const }}>{count}</span>
                </div>
              ))}
            </div>
          ))}
          {sectionCard('By school / department', (
            <div>
              {schoolBreakdown.length === 0 ? (
                <p style={{ fontSize: '14px', color: muted }}>No school data available</p>
              ) : schoolBreakdown.map(([school, count]) => (
                <div key={school} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                  <span style={{ fontSize: '13px', color: text, minWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{school}</span>
                  {pctBar(count, maxSchoolCount, '#a855f7')}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '30px', textAlign: 'right' as const }}>{count}</span>
                </div>
              ))}
            </div>
          ))}
          {/* Schools equity — not served */}
          {(() => {
            const servedCodes = new Set(fp.filter(p => p.school_department).map(p => p.school_department!))
            const notServed = allSchools.filter(s => s.type === 'school' && !servedCodes.has(s.code) && !servedCodes.has(s.code.padStart(3, '0')) && !servedCodes.has(s.code.replace(/^0+/, '') || '0'))
            if (notServed.length === 0) return null
            return sectionCard(`Schools not yet served (${notServed.length})`, (
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
                {notServed.map(s => (
                  <span key={s.code} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>{s.name}</span>
                ))}
              </div>
            ))
          })()}
          {turnaroundByType.length > 0 && sectionCard('Average turnaround (days)', (
            <div>
              {turnaroundByType.map(({ type, avg }) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                  <span style={{ fontSize: '13px', color: text, minWidth: '240px' }}>{type}</span>
                  {pctBar(avg, Math.max(...turnaroundByType.map(t => t.avg)), '#f59e0b')}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '50px', textAlign: 'right' as const }}>{avg} days</span>
                </div>
              ))}
            </div>
          ))}
          {/* Staff hours by production */}
          {(() => {
            const prodHours: Record<string, number> = {}
            timeEntries.forEach(te => {
              const prodId = taskProdMap[te.task_id]
              if (prodId) prodHours[prodId] = (prodHours[prodId] || 0) + Number(te.hours)
            })
            const sorted = Object.entries(prodHours).map(([id, hours]) => {
              const prod = fp.find(p => p.id === id)
              return { title: prod ? `#${prod.production_number} ${prod.title}` : 'Unknown', hours: Math.round(hours * 10) / 10 }
            }).sort((a, b) => b.hours - a.hours).slice(0, 10)
            const maxH = sorted.length > 0 ? sorted[0].hours : 1
            const totalHours = Object.values(prodHours).reduce((s, h) => s + h, 0)
            if (sorted.length === 0) return null
            return sectionCard(`Staff hours by production (${Math.round(totalHours * 10) / 10}h total)`, (
              <div>
                {sorted.map(({ title, hours }) => (
                  <div key={title} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                    <span style={{ fontSize: '13px', color: text, minWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{title}</span>
                    {pctBar(hours, maxH, '#60a5fa')}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '50px', textAlign: 'right' as const }}>{hours}h</span>
                  </div>
                ))}
              </div>
            ))
          })()}
          {sectionCard('Monthly volume — last 12 months', (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px' }}>
              {monthlyBreakdown.map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: text, fontWeight: 600 }}>{m.count || ''}</span>
                  {(() => { const h = maxMonthly ? (m.count / maxMonthly) * 90 : 0; return <div style={{ width: '100%', height: `${h}px`, background: '#1e6cb5', borderRadius: '4px 4px 0 0', minHeight: m.count ? '4px' : '0px' }} /> })()}
                  <span style={{ fontSize: '10px', color: muted, whiteSpace: 'nowrap' as const }}>{m.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* TEAM */}
      {tab === 'team' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {metricCard('Team size', team.length, 'active members')}
            {metricCard('Tasks completed', completedTasks, 'all time')}
            {metricCard('Open tasks', tasks.filter(t => t.status !== 'complete').length, 'across team')}
          </div>
          {sectionCard('Team workload', (
            <div>
              {teamWorkload.map(member => (
                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0', borderBottom: `0.5px solid ${border}` }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>{member.name.slice(0, 2).toUpperCase()}</div>
                  <div style={{ minWidth: '120px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{member.name}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0', textTransform: 'capitalize' as const }}>{member.role}</p>
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '100px' }}>
                      <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Productions</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {pctBar(member.prodsAssigned, maxTeamProds, '#5ba3e0')}
                        <span style={{ fontSize: '14px', fontWeight: 600, color: text }}>{member.prodsAssigned}</span>
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Tasks</p>
                      <p style={{ fontSize: '14px', color: text, margin: 0 }}>
                        <span style={{ fontWeight: 600 }}>{member.openTasks}</span> <span style={{ color: muted }}>open</span>
                        {' · '}
                        <span style={{ fontWeight: 600 }}>{member.doneTasks}</span> <span style={{ color: muted }}>done</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* VIDEOS */}
      {tab === 'videos' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {metricCard('Videos Produced', totalVidsProduced > 0 ? totalVidsProduced.toLocaleString() : String(fv.length), totalVidsProduced > 0 ? `${fv.length} in library · ${publishedVideos} published` : `${publishedVideos} published`)}
            {metricCard('YouTube Views', totalYtViews > 0 ? totalYtViews.toLocaleString() : '—', totalYtLikes > 0 ? `${totalYtLikes.toLocaleString()} likes` : '')}
            {metricCard('Platforms', String(new Set(destinations.map(d => d.platform)).size), 'distribution channels')}
            {metricCard('Release compliance', `${complianceRate}%`, `${signedReleases} of ${totalTalent} cleared`, complianceRate === 100 ? '#22c55e' : complianceRate >= 80 ? '#f59e0b' : '#ef4444')}
          </div>
          {topYtVideos.length > 0 && sectionCard(`Top YouTube videos (${topYtVideos.length})`, (
            <div>
              {topYtVideos.map((v: any) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: `0.5px solid ${border}` }}>
                  {v.youtube_thumbnail && <img src={v.youtube_thumbnail} alt="" style={{ width: '80px', height: '45px', objectFit: 'cover' as const, borderRadius: '4px', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.title}</p>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e', flexShrink: 0 }}>{(v.youtube_views || 0).toLocaleString()}</span>
                  <span style={{ fontSize: '12px', color: muted, flexShrink: 0 }}>views</span>
                </div>
              ))}
            </div>
          ))}
          {platformBreakdown.length > 0 && sectionCard('Distribution by platform', (
            <div>
              {platformBreakdown.map(([platform, count]) => {
                const views = destinations.filter(d => d.platform === platform).reduce((sum, d) => sum + (d.view_count || 0), 0)
                return (
                  <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                    <span style={{ fontSize: '14px', color: text, minWidth: '160px', fontWeight: 500 }}>{platform}</span>
                    <span style={{ fontSize: '14px', color: muted }}>{count} video{count !== 1 ? 's' : ''}</span>
                    {views > 0 && <span style={{ fontSize: '13px', padding: '2px 10px', borderRadius: '20px', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>{views.toLocaleString()} views</span>}
                  </div>
                )
              })}
            </div>
          ))}
          {totalTalent > 0 && sectionCard('Release status breakdown', (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {releasesByStatus.map(([status, count]) => {
                const colors: Record<string, string> = { signed: '#22c55e', verbal: '#3b82f6', minor_parent: '#f59e0b', pending: '#ef4444', not_required: '#94a3b8' }
                const labels: Record<string, string> = { signed: 'Signed', verbal: 'Verbal', minor_parent: 'Minor — parent', pending: 'Pending', not_required: 'Not required' }
                return (
                  <div key={status} style={{ background: `${colors[status] || '#94a3b8'}10`, border: `1px solid ${colors[status] || '#94a3b8'}25`, borderRadius: '10px', padding: '12px 18px', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: colors[status], margin: '0 0 2px' }}>{count}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: 0 }}>{labels[status] || status}</p>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* EQUIPMENT */}
      {tab === 'equipment' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {metricCard('Total items', equipment.length, 'in inventory')}
            {metricCard('Available', equipment.filter(e => e.status === 'available').length, 'ready to use', '#22c55e')}
            {metricCard('Checked out', equipment.filter(e => e.status === 'checked_out').length, 'currently loaned')}
            {metricCard('Total checkouts', loans.length, 'all time')}
          </div>
          {topEquipment.length > 0 && sectionCard('Most checked-out items', (
            <div>
              {topEquipment.map(([key, count]) => {
                const [tag, name] = key.split('|')
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                    <span style={{ fontSize: '12px', color: muted, fontFamily: 'monospace', minWidth: '40px' }}>{tag}</span>
                    <span style={{ fontSize: '13px', color: text, minWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</span>
                    {pctBar(count, maxEqCount, '#f59e0b')}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '40px', textAlign: 'right' as const }}>{count}×</span>
                  </div>
                )
              })}
            </div>
          ))}
          {overdueLoans.length > 0 && sectionCard(`Currently checked out (${overdueLoans.length})`, (
            <div>
              {overdueLoans.slice(0, 10).map(loan => (
                <div key={loan.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', fontSize: '13px' }}>
                  <span style={{ color: muted, fontFamily: 'monospace', minWidth: '40px' }}>{(loan.equipment as any)?.asset_tag}</span>
                  <span style={{ color: text, flex: 1 }}>{(loan.equipment as any)?.name}</span>
                  <span style={{ color: muted }}>{new Date(loan.checked_out_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* COST SAVINGS — lazy chunk (external cost tables + recompute UI) */}
      {tab === 'value' && (
        <ReportsValueTab
          costSavings={costSavings}
          costByType={costByType}
          maxCost={maxCost}
          fp={fp}
          cameraPackages={cameraPackages}
          recomputing={recomputing}
          onRecomputeAll={recomputeAll}
          text={text}
          muted={muted}
          border={border}
          cardBg={cardBg}
        />
      )}
    </div>
  )
}