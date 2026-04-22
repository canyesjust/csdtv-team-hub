'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

interface Todo { text: string; completed: boolean; tag: string; matched_production: string | null }
interface NoteSheet { id: string; sheet_id: string | null; date: string | null; todos: Todo[]; notes_text: string | null; follow_ups: string[]; created_at: string; updated_at: string }

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

  const [sheets, setSheets] = useState<NoteSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ sheet_id: string | null; date: string | null; todos: Todo[]; notes: string; follow_ups: string[] } | null>(null)
  const [mergeTarget, setMergeTarget] = useState<NoteSheet | null>(null)
  const [editingTodos, setEditingTodos] = useState<Todo[]>([])
  const [editingNotes, setEditingNotes] = useState('')
  const [editingFollowUps, setEditingFollowUps] = useState<string[]>([])
  const [editingDate, setEditingDate] = useState('')
  const [editingSheetId, setEditingSheetId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null)
  const [productions, setProductions] = useState<{ production_number: number; title: string }[]>([])

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: user } = await supabase.from('team').select('id').eq('supabase_user_id', session.user.id).single()
    if (user) setCurrentUser(user)
    const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: false })
    setSheets(data || [])
    const { data: prods } = await supabase.from('productions').select('production_number, title').order('production_number', { ascending: false }).limit(50)
    setProductions(prods || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const mergeTodos = (existing: Todo[], incoming: Todo[]): Todo[] => {
    const merged = [...existing]
    for (const inc of incoming) {
      const match = merged.find(m => m.text.toLowerCase().trim() === inc.text.toLowerCase().trim())
      if (match) {
        if (inc.completed && !match.completed) match.completed = true
        if (inc.tag && !match.tag) match.tag = inc.tag
        if (inc.matched_production && !match.matched_production) match.matched_production = inc.matched_production
      } else {
        merged.push(inc)
      }
    }
    return merged
  }

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
        body: JSON.stringify({ image: base64, media_type: file.type || 'image/jpeg', productions }),
      })
      const result = await res.json()
      if (result.success && result.data) {
        const scanned = result.data
        const sheetId = scanned.sheet_id

        // Check for existing sheet with same number
        const existingSheet = sheetId ? sheets.find(s => s.sheet_id === sheetId) : null

        if (existingSheet) {
          // Merge mode
          setMergeTarget(existingSheet)
          const mergedTodos = mergeTodos(existingSheet.todos || [], scanned.todos || [])
          setEditingTodos(mergedTodos)
          const existingNotes = existingSheet.notes_text || ''
          const newNotes = scanned.notes || ''
          setEditingNotes(existingNotes && newNotes && existingNotes !== newNotes ? `${existingNotes}\n---\n${newNotes}` : newNotes || existingNotes)
          const allFollowUps = [...new Set([...(existingSheet.follow_ups || []), ...(scanned.follow_ups || [])])]
          setEditingFollowUps(allFollowUps)
        } else {
          // New sheet
          setMergeTarget(null)
          setEditingTodos(scanned.todos || [])
          setEditingNotes(scanned.notes || '')
          setEditingFollowUps(scanned.follow_ups || [])
        }

        setScanResult(scanned)
        setEditingDate(scanned.date || new Date().toISOString().split('T')[0])
        setEditingSheetId(sheetId || '')
      } else {
        alert(result.error || 'Failed to scan sheet.')
      }
    } catch { alert('Scan failed. Please try again.') }
    setScanning(false)
  }

  const saveSheet = async () => {
    if (!currentUser) return
    setSaving(true)
    const data = {
      sheet_id: editingSheetId || null,
      date: editingDate || null,
      todos: editingTodos,
      notes_text: editingNotes || null,
      follow_ups: editingFollowUps.filter(f => f.trim()),
      updated_at: new Date().toISOString(),
    }

    if (mergeTarget) {
      await supabase.from('notes').update(data).eq('id', mergeTarget.id)
    } else {
      await supabase.from('notes').insert({ ...data, created_by: currentUser.id })
    }

    setScanResult(null)
    setMergeTarget(null)
    setEditingTodos([])
    setEditingNotes('')
    setEditingFollowUps([])
    setSaving(false)
    loadData()
  }

  const createTasksFromSheet = async (sheet: NoteSheet) => {
    if (!currentUser) return
    const uncompleted = sheet.todos.filter(t => !t.completed)
    if (uncompleted.length === 0) { alert('No uncompleted items to create tasks from'); return }
    if (!confirm(`Create ${uncompleted.length} task${uncompleted.length > 1 ? 's' : ''} from uncompleted items?`)) return
    for (const todo of uncompleted) {
      await supabase.from('tasks').insert({ title: todo.text, status: 'pending', created_by: currentUser.id, assigned_to: currentUser.id })
    }
    alert(`${uncompleted.length} task${uncompleted.length > 1 ? 's' : ''} created!`)
  }

  const deleteSheet = async (id: string) => {
    if (!confirm('Delete this scanned sheet?')) return
    await supabase.from('notes').delete().eq('id', id)
    setSheets(prev => prev.filter(s => s.id !== id))
    setExpandedSheet(null)
  }

  const todoStats = (todos: Todo[]) => {
    const total = todos.length
    const done = todos.filter(t => t.completed).length
    return { total, done, pending: total - done }
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: muted }}>Loading...</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: text }}>Notes</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{sheets.length} scanned sheet{sheets.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', cursor: scanning ? 'wait' : 'pointer', fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', opacity: scanning ? 0.7 : 1 }}>
            {scanning ? 'Scanning...' : '📷 Scan sheet'}
            <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) handleScan(e.target.files[0]); e.target.value = '' }} style={{ display: 'none' }} disabled={scanning} />
          </label>
          <a href="/csdtv-daily-sheets.pdf" target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: cardBg, border: `0.5px solid ${border}`, color: text, textDecoration: 'none', fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>🖨 Print sheets</a>
        </div>
      </div>

      {scanResult && (
        <div style={{ background: cardBg, border: `0.5px solid ${mergeTarget ? 'rgba(96,184,240,0.4)' : border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: 0 }}>
                {mergeTarget ? `Updating sheet ${editingSheetId} — merged with existing` : `New sheet${editingSheetId ? ` — ${editingSheetId}` : ''}`}
              </h2>
              {mergeTarget && <p style={{ fontSize: '13px', color: '#60b8f0', margin: '4px 0 0' }}>Found existing sheet #{editingSheetId}. Todos merged — new items added, completed items updated.</p>}
            </div>
            <button onClick={() => { setScanResult(null); setMergeTarget(null) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', padding: '4px 8px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Sheet </label>
              <input type="text" value={editingSheetId} onChange={e => setEditingSheetId(e.target.value)} style={{ ...inputStyle, width: '80px' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Date</label>
              <input type="date" value={editingDate} onChange={e => setEditingDate(e.target.value)} style={{ ...inputStyle, width: '170px' }} />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '6px' }}>To-dos ({editingTodos.filter(t => t.completed).length}/{editingTodos.length} done)</label>
            {editingTodos.map((todo, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `0.5px solid ${border}` }}>
                <button onClick={() => setEditingTodos(prev => prev.map((t, j) => j === i ? { ...t, completed: !t.completed } : t))} style={{ width: '22px', height: '22px', borderRadius: '4px', border: `1.5px solid ${todo.completed ? '#22c55e' : border}`, background: todo.completed ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                  {todo.completed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
                <input value={todo.text} onChange={e => setEditingTodos(prev => prev.map((t, j) => j === i ? { ...t, text: e.target.value } : t))} style={{ ...inputStyle, flex: 1, textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? muted : text }} />
                <input value={todo.tag} onChange={e => setEditingTodos(prev => prev.map((t, j) => j === i ? { ...t, tag: e.target.value } : t))} placeholder="tag" style={{ ...inputStyle, width: '80px', flexShrink: 0, fontSize: '13px' }} />
                {todo.matched_production && <span style={{ fontSize: '11px', color: '#5ba3e0', flexShrink: 0, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{todo.matched_production}</span>}
                <button onClick={() => setEditingTodos(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', flexShrink: 0 }}>x</button>
              </div>
            ))}
          </div>

          {editingNotes && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Notes</label>
              <textarea value={editingNotes} onChange={e => setEditingNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          )}

          {editingFollowUps.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '3px' }}>Follow-ups</label>
              {editingFollowUps.map((fu, i) => (
                <input key={i} value={fu} onChange={e => setEditingFollowUps(prev => prev.map((f, j) => j === i ? e.target.value : f))} style={{ ...inputStyle, marginBottom: '4px' }} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setScanResult(null); setMergeTarget(null) }} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={saveSheet} disabled={saving} style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{saving ? 'Saving...' : mergeTarget ? 'Update sheet' : 'Save sheet'}</button>
          </div>
        </div>
      )}

      {sheets.length === 0 && !scanResult ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
          <p style={{ fontSize: '18px', margin: '0 0 6px' }}>No scanned sheets yet</p>
          <p style={{ fontSize: '14px', margin: '0 0 16px' }}>Print some daily sheets, fill them out, then scan them here</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sheets.map(sheet => {
            const isExpanded = expandedSheet === sheet.id
            const stats = todoStats(sheet.todos)
            const d = sheet.date ? new Date(sheet.date + 'T12:00:00') : null
            return (
              <div key={sheet.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                <div onClick={() => setExpandedSheet(isExpanded ? null : sheet.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                  {sheet.sheet_id && <span style={{ fontSize: '14px', fontWeight: 700, color: '#c0392b', minWidth: '40px' }}>{sheet.sheet_id}</span>}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: text }}>{d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}</span>
                    <span style={{ fontSize: '13px', color: muted, marginLeft: '10px' }}>{stats.done}/{stats.total} done{stats.pending > 0 ? ` · ${stats.pending} pending` : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {stats.total > 0 && (
                      <div style={{ width: '60px', height: '6px', background: dark ? 'rgba(255,255,255,0.06)' : '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${(stats.done / stats.total) * 100}%`, height: '100%', background: stats.done === stats.total ? '#22c55e' : '#60b8f0', borderRadius: '3px' }} />
                      </div>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: `0.5px solid ${border}` }}>
                    {sheet.todos.length > 0 && (
                      <div style={{ padding: '12px 0 8px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#c0392b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>To-dos</p>
                        {sheet.todos.map((todo, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                            <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${todo.completed ? '#22c55e' : border}`, background: todo.completed ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {todo.completed && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            <span style={{ fontSize: '14px', color: todo.completed ? muted : text, textDecoration: todo.completed ? 'line-through' : 'none', flex: 1 }}>{todo.text}</span>
                            {todo.tag && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(30,108,181,0.1)', color: '#5ba3e0' }}>{todo.tag}</span>}
                            {todo.matched_production && !todo.tag && <span style={{ fontSize: '11px', color: '#5ba3e0' }}>{todo.matched_production}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {sheet.notes_text && (
                      <div style={{ padding: '8px 0' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Notes</p>
                        <p style={{ fontSize: '14px', color: text, margin: 0, whiteSpace: 'pre-wrap', padding: '8px 10px', background: dark ? 'rgba(255,255,255,0.02)' : '#f1f5f9', borderRadius: '6px' }}>{sheet.notes_text}</p>
                      </div>
                    )}
                    {(sheet.follow_ups || []).length > 0 && (
                      <div style={{ padding: '8px 0' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Follow-ups</p>
                        {sheet.follow_ups.map((fu, i) => (
                          <p key={i} style={{ fontSize: '14px', color: text, margin: '2px 0', paddingLeft: '12px', position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: '#1e3a5f', fontWeight: 700 }}>—</span>{fu}</p>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', flexWrap: 'wrap' }}>
                      {sheet.todos.some(t => !t.completed) && (
                        <button onClick={() => createTasksFromSheet(sheet)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Create tasks from uncompleted</button>
                      )}
                      <button onClick={() => deleteSheet(sheet.id)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: '0.5px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                      <span style={{ fontSize: '12px', color: muted, flex: 1, textAlign: 'right', alignSelf: 'center' }}>
                        {sheet.updated_at && sheet.updated_at !== sheet.created_at ? `Updated ${new Date(sheet.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : `Scanned ${new Date(sheet.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                      </span>
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
