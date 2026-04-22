'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'

interface ScannedTodo {
  text: string; completed: boolean; tag: string
  production_number: number | null; assigned_to_name: string | null
}
interface ScanEntry {
  id: string; sheet_id: string | null; date: string | null
  notes_text: string | null; follow_ups: string[]
  tasks_created: number; tasks_completed: number
  created_at: string
}
interface TeamMember { id: string; name: string; role: string }
interface Production { id: string; production_number: number; title: string }

export default function NotesPage() {
  const supabase = createClient()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#e8edf5' : '#1a1f36'
  const muted = dark ? '#6b7a94' : '#64748b'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : '#f8fafc'
  const inputBg = dark ? '#1a2540' : '#f1f5f9'
  const inputStyle: React.CSSProperties = { width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '15px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  const [scans, setScans] = useState<ScanEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [allTeam, setAllTeam] = useState<TeamMember[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [expandedScan, setExpandedScan] = useState<string | null>(null)

  // Scan review state
  const [showReview, setShowReview] = useState(false)
  const [reviewTodos, setReviewTodos] = useState<ScannedTodo[]>([])
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewFollowUps, setReviewFollowUps] = useState<string[]>([])
  const [reviewDate, setReviewDate] = useState('')
  const [reviewSheetId, setReviewSheetId] = useState('')
  const [isRescan, setIsRescan] = useState(false)
  const [existingTaskIds, setExistingTaskIds] = useState<{ id: string; title: string; status: string }[]>([])

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [userRes, teamRes, prodsRes, scansRes] = await Promise.all([
      supabase.from('team').select('id, name, role').eq('supabase_user_id', session.user.id).single(),
      supabase.from('team').select('id, name, role').eq('active', true),
      supabase.from('productions').select('id, production_number, title').order('production_number', { ascending: false }).limit(100),
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
    ])
    if (userRes.data) setCurrentUser(userRes.data)
    setAllTeam(teamRes.data || [])
    setProductions(prodsRes.data || [])
    setScans(scansRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleScan = async (file: File) => {
    setScanning(true)
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { alert('Session expired. Please refresh.'); setScanning(false); return }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/scan-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ image: base64, media_type: file.type || 'image/jpeg', productions, team_members: allTeam }),
      })
      const result = await res.json()
      if (result.success && result.data) {
        const d = result.data
        setReviewTodos(d.todos || [])
        setReviewNotes(d.notes || '')
        setReviewFollowUps(d.follow_ups || [])
        setReviewDate(d.date || new Date().toISOString().split('T')[0])
        setReviewSheetId(d.sheet_id || '')

        // Check for re-scan
        if (d.sheet_id) {
          const { data: existing } = await supabase.from('tasks').select('id, title, status').eq('scanned_sheet_id', d.sheet_id)
          if (existing && existing.length > 0) {
            setIsRescan(true)
            setExistingTaskIds(existing)
          } else {
            setIsRescan(false)
            setExistingTaskIds([])
          }
        } else {
          setIsRescan(false)
          setExistingTaskIds([])
        }

        setShowReview(true)
      } else {
        alert(result.error || 'Failed to scan sheet.')
      }
    } catch { alert('Scan failed. Please try again.') }
    setScanning(false)
  }

  const resolveProductionId = (prodNum: number | null): string | null => {
    if (!prodNum) return null
    const match = productions.find(p => p.production_number === prodNum)
    return match?.id || null
  }

  const resolveAssignee = (name: string | null): string | null => {
    if (!name) return null
    const lower = name.toLowerCase()
    const match = allTeam.find(t => t.name.toLowerCase().includes(lower) || t.name.toLowerCase().split(' ')[0] === lower)
    return match?.id || null
  }

  const saveAndCreateTasks = async () => {
    if (!currentUser) return
    setSaving(true)
    try {
      let tasksCreated = 0
      let tasksCompleted = 0
      const sheetId = reviewSheetId || null

      // Handle unchecked todos → create tasks
      const unchecked = reviewTodos.filter(t => !t.completed)
      for (const todo of unchecked) {
        const prodId = resolveProductionId(todo.production_number)
        const assigneeId = resolveAssignee(todo.assigned_to_name) || currentUser.id

        if (isRescan) {
          // Check if this task already exists from a previous scan
          const existingMatch = existingTaskIds.find(e => e.title.toLowerCase().trim() === todo.text.toLowerCase().trim())
          if (existingMatch) continue // Already exists, skip
        }

        await supabase.from('tasks').insert({
          title: todo.text,
          status: 'pending',
          created_by: currentUser.id,
          assigned_to: assigneeId,
          production_id: prodId,
          scanned_sheet_id: sheetId,
        })
        tasksCreated++
      }

      // Handle follow-ups → create tasks
      for (const fu of reviewFollowUps.filter(f => f.trim())) {
        if (isRescan) {
          const existingMatch = existingTaskIds.find(e => e.title.toLowerCase().trim() === fu.toLowerCase().trim())
          if (existingMatch) continue
        }
        await supabase.from('tasks').insert({
          title: fu,
          status: 'pending',
          priority: 'high',
          created_by: currentUser.id,
          assigned_to: currentUser.id,
          scanned_sheet_id: sheetId,
        })
        tasksCreated++
      }

      // Handle checked todos on re-scan → mark existing tasks complete
      if (isRescan) {
        const checked = reviewTodos.filter(t => t.completed)
        for (const todo of checked) {
          const existingMatch = existingTaskIds.find(e => e.title.toLowerCase().trim() === todo.text.toLowerCase().trim() && e.status !== 'complete')
          if (existingMatch) {
            await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', existingMatch.id)
            tasksCompleted++
          }
        }
      }

      // Save scan entry
      if (isRescan && sheetId) {
        const { data: existingScan } = await supabase.from('notes').select('id').eq('sheet_id', sheetId).single()
        if (existingScan) {
          await supabase.from('notes').update({
            date: reviewDate || null,
            notes_text: reviewNotes || null,
            follow_ups: reviewFollowUps.filter(f => f.trim()),
            tasks_created: (await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('scanned_sheet_id', sheetId)).count || 0,
            tasks_completed: tasksCompleted,
            updated_at: new Date().toISOString(),
          }).eq('id', existingScan.id)
        }
      } else {
        await supabase.from('notes').insert({
          sheet_id: sheetId,
          date: reviewDate || null,
          notes_text: reviewNotes || null,
          follow_ups: reviewFollowUps.filter(f => f.trim()),
          tasks_created: tasksCreated,
          tasks_completed: 0,
          created_by: currentUser.id,
        })
      }

      const msg = isRescan
        ? `Re-scan complete: ${tasksCreated} new task${tasksCreated !== 1 ? 's' : ''}, ${tasksCompleted} marked complete`
        : `${tasksCreated} task${tasksCreated !== 1 ? 's' : ''} created`
      alert(msg)

      setShowReview(false)
      setReviewTodos([])
      setReviewNotes('')
      setReviewFollowUps([])
      setIsRescan(false)
      setExistingTaskIds([])
      loadData()
    } catch (err) {
      alert('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: muted }}>Loading...</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: text }}>Notes</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>Scan daily sheets → tasks created automatically</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', cursor: scanning ? 'wait' : 'pointer', fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', opacity: scanning ? 0.7 : 1 }}>
            {scanning ? 'Scanning...' : '📷 Scan sheet'}
            <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) handleScan(e.target.files[0]); e.target.value = '' }} style={{ display: 'none' }} disabled={scanning} />
          </label>
          <a href="/csdtv-daily-sheets.pdf" target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: `0.5px solid ${border}`, color: text, textDecoration: 'none', fontWeight: 500, fontFamily: 'inherit' }}>🖨 Print sheets</a>
        </div>
      </div>

      {/* REVIEW SCREEN */}
      {showReview && (
        <div style={{ background: cardBg, border: `0.5px solid ${isRescan ? 'rgba(96,184,240,0.4)' : border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: 0 }}>
                {isRescan ? `Re-scan of sheet "${reviewSheetId}"` : 'Scanned sheet — review before creating tasks'}
              </h2>
              {isRescan && <p style={{ fontSize: '13px', color: '#60b8f0', margin: '4px 0 0' }}>Found {existingTaskIds.length} existing task{existingTaskIds.length !== 1 ? 's' : ''} from this sheet. New items will be added, checked items will be marked complete.</p>}
            </div>
            <button onClick={() => setShowReview(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: '4px 8px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Sheet ID</label>
              <input value={reviewSheetId} onChange={e => setReviewSheetId(e.target.value)} placeholder="optional" style={{ ...inputStyle, width: '100px' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Date</label>
              <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={{ ...inputStyle, width: '170px' }} />
            </div>
          </div>

          {/* Unchecked items → will become tasks */}
          {reviewTodos.filter(t => !t.completed).length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Will create as tasks ({reviewTodos.filter(t => !t.completed).length})</p>
              {reviewTodos.filter(t => !t.completed).map((todo, i) => {
                const realIdx = reviewTodos.indexOf(todo)
                const prod = todo.production_number ? productions.find(p => p.production_number === todo.production_number) : null
                const assignee = todo.assigned_to_name ? allTeam.find(t => t.name.toLowerCase().includes(todo.assigned_to_name!.toLowerCase())) : null
                const alreadyExists = isRescan && existingTaskIds.some(e => e.title.toLowerCase().trim() === todo.text.toLowerCase().trim())
                return (
                  <div key={realIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, opacity: alreadyExists ? 0.5 : 1 }}>
                    <span style={{ fontSize: '14px', color: text, flex: 1 }}>{todo.text}</span>
                    {prod && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(30,108,181,0.1)', color: '#5ba3e0' }}>#{prod.production_number} {prod.title.substring(0, 20)}</span>}
                    {!prod && todo.tag && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>{todo.tag}</span>}
                    {assignee && <span style={{ fontSize: '11px', color: '#a855f7' }}>→ {assignee.name.split(' ')[0]}</span>}
                    {alreadyExists && <span style={{ fontSize: '11px', color: muted, fontStyle: 'italic' }}>already exists</span>}
                    <button onClick={() => setReviewTodos(prev => prev.filter((_, j) => j !== realIdx))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '2px 6px', flexShrink: 0 }}>x</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Checked items → already done */}
          {reviewTodos.filter(t => t.completed).length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
                Already done ({reviewTodos.filter(t => t.completed).length}){isRescan ? ' — will mark existing tasks complete' : ' — won\'t create tasks'}
              </p>
              {reviewTodos.filter(t => t.completed).map((todo, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', opacity: 0.6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: '14px', color: muted, textDecoration: 'line-through' }}>{todo.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Follow-ups → will become high-priority tasks */}
          {reviewFollowUps.filter(f => f.trim()).length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Follow-ups → high priority tasks</p>
              {reviewFollowUps.map((fu, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <span style={{ fontSize: '14px', color: text }}>{fu}</span>
                  <button onClick={() => setReviewFollowUps(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}>x</button>
                </div>
              ))}
            </div>
          )}

          {/* Notes text */}
          {reviewNotes && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Notes (saved for reference — searchable later)</label>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={() => setShowReview(false)} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={saveAndCreateTasks} disabled={saving} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              {saving ? 'Creating tasks...' : isRescan ? 'Update tasks' : `Create ${reviewTodos.filter(t => !t.completed).length + reviewFollowUps.filter(f => f.trim()).length} tasks`}
            </button>
          </div>
        </div>
      )}

      {/* SCAN HISTORY */}
      {scans.length === 0 && !showReview ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
          <p style={{ fontSize: '18px', margin: '0 0 6px' }}>No scanned sheets yet</p>
          <p style={{ fontSize: '14px' }}>Print daily sheets, write your todos, scan them here. Tasks are created automatically.</p>
        </div>
      ) : !showReview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {scans.map(scan => {
            const isExpanded = expandedScan === scan.id
            const d = scan.date ? new Date(scan.date + 'T12:00:00') : null
            return (
              <div key={scan.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                <div onClick={() => setExpandedScan(isExpanded ? null : scan.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                  {scan.sheet_id && <span style={{ fontSize: '14px', fontWeight: 700, color: '#c0392b' }}>{scan.sheet_id}</span>}
                  <span style={{ fontSize: '16px', fontWeight: 600, color: text }}>{d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}</span>
                  <span style={{ fontSize: '13px', color: muted }}>
                    {scan.tasks_created > 0 && `${scan.tasks_created} task${scan.tasks_created !== 1 ? 's' : ''} created`}
                    {scan.tasks_completed > 0 && ` · ${scan.tasks_completed} completed via re-scan`}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: '12px', color: muted }}>{new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: `0.5px solid ${border}` }}>
                    {scan.notes_text && (
                      <div style={{ padding: '12px 0 8px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Notes</p>
                        <p style={{ fontSize: '14px', color: text, margin: 0, whiteSpace: 'pre-wrap', padding: '8px 10px', background: dark ? 'rgba(255,255,255,0.02)' : '#f1f5f9', borderRadius: '6px' }}>{scan.notes_text}</p>
                      </div>
                    )}
                    {(scan.follow_ups || []).length > 0 && (
                      <div style={{ padding: '8px 0' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Follow-ups</p>
                        {scan.follow_ups.map((fu, i) => <p key={i} style={{ fontSize: '14px', color: text, margin: '2px 0', paddingLeft: '12px', position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: '#1e3a5f', fontWeight: 700 }}>—</span>{fu}</p>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', flexWrap: 'wrap' }}>
                      {scan.sheet_id && <Link href={`/dashboard/tasks?search=${encodeURIComponent(scan.sheet_id)}`} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: '#5ba3e0', textDecoration: 'none', fontFamily: 'inherit' }}>View tasks from this sheet →</Link>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
