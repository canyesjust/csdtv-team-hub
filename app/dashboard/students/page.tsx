'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'

interface Student {
  id: string
  name: string
  student_number: string
  email: string | null
  phone: string | null
  parent_name: string | null
  parent_email: string | null
  parent_phone: string | null
  grade: number | null
  tier: string
  csdtv_101_completed: boolean
  active: boolean
  notes: string | null
}

interface Tier {
  id: string
  name: string
  cooldown_hours: number
  monthly_event_cap: number | null
  description: string | null
}

interface ParsedRow {
  name: string
  student_number: string
  email: string
  parent_name: string
  parent_email: string
  parent_phone: string
  grade: string
  error?: string
}

const emptyForm = {
  name: '',
  student_number: '',
  email: '',
  phone: '',
  parent_name: '',
  parent_email: '',
  parent_phone: '',
  grade: '',
  tier: 'default',
  csdtv_101_completed: false,
  notes: '',
  active: true,
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (c === delimiter && !inQuotes) {
      result.push(current.trim()); current = ''
    } else { current += c }
  }
  result.push(current.trim())
  return result
}

function parseCSV(input: string): ParsedRow[] {
  const lines = input.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const firstLower = lines[0].toLowerCase()
  const hasHeader = firstLower.includes('name') || firstLower.includes('student') || firstLower.includes('email')
  const dataLines = hasHeader ? lines.slice(1) : lines
  return dataLines.map(line => {
    const cells = parseCSVLine(line, delimiter)
    const row: ParsedRow = {
      name: cells[0] || '',
      student_number: cells[1] || '',
      email: cells[2] || '',
      parent_name: cells[3] || '',
      parent_email: cells[4] || '',
      parent_phone: cells[5] || '',
      grade: cells[6] || '',
    }
    if (!row.name) row.error = 'Missing name'
    else if (!row.student_number) row.error = 'Missing student number'
    return row
  })
}

export default function StudentsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'signups' | 'roster' | 'classes'>('roster')
  const [students, setStudents] = useState<Student[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterGrade, setFilterGrade] = useState<string>('all')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [csvInput, setCsvInput] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [studentsRes, tiersRes, userRes] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('signup_tiers').select('*').order('name'),
      supabase.from('team').select('id, role').eq('supabase_user_id', session.user.id).single(),
    ])
    setStudents(studentsRes.data || [])
    setTiers(tiersRes.data || [])
    setCurrentUser(userRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const isManager = currentUser?.role === 'Manager'

  const callAdminStudents = async (action: string, payload: Record<string, any>) => {
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.success) throw new Error(body.error || 'Request failed')
    return body
  }

  const filteredStudents = students.filter(s => {
    if (filterActive === 'active' && !s.active) return false
    if (filterActive === 'inactive' && s.active) return false
    if (filterTier !== 'all' && s.tier !== filterTier) return false
    if (filterGrade !== 'all' && String(s.grade) !== filterGrade) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${s.name} ${s.student_number} ${s.email || ''} ${s.parent_name || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const closeForm = () => {
    setEditingId(null)
    setShowAdd(false)
    setForm(emptyForm)
  }

  const startEdit = (s: Student) => {
    setEditingId(s.id)
    setShowAdd(false)
    setForm({
      name: s.name,
      student_number: s.student_number,
      email: s.email || '',
      phone: s.phone || '',
      parent_name: s.parent_name || '',
      parent_email: s.parent_email || '',
      parent_phone: s.parent_phone || '',
      grade: s.grade ? String(s.grade) : '',
      tier: s.tier,
      csdtv_101_completed: s.csdtv_101_completed,
      notes: s.notes || '',
      active: s.active,
    })
  }

  const startAdd = () => {
    setShowAdd(true)
    setEditingId(null)
    setForm(emptyForm)
  }

  const saveStudent = async () => {
    if (!form.name.trim() || !form.student_number.trim()) {
      toast('Name and student number are required', 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      student_number: form.student_number.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      parent_name: form.parent_name.trim() || null,
      parent_email: form.parent_email.trim() || null,
      parent_phone: form.parent_phone.trim() || null,
      grade: form.grade ? parseInt(form.grade) : null,
      tier: form.tier,
      csdtv_101_completed: form.csdtv_101_completed,
      notes: form.notes.trim() || null,
      active: form.active,
    }
    if (editingId) {
      try {
        await callAdminStudents('save_student', { id: editingId, student: payload })
      } catch (e: any) {
        toast('Failed to save: ' + (e.message || 'Unknown error'), 'error'); setSaving(false); return
      }
      setStudents(prev => prev.map(s => s.id === editingId ? { ...s, ...payload } : s))
      toast('Student updated', 'success')
    } else {
      let data: Student | null = null
      try {
        const res = await callAdminStudents('save_student', { id: null, student: payload })
        data = res.data
      } catch (e: any) {
        toast('Failed to add: ' + (e.message || 'Unknown error'), 'error'); setSaving(false); return
      }
      if (data) setStudents(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      toast('Student added', 'success')
    }
    setSaving(false)
    closeForm()
  }

  const toggleActive = async (s: Student) => {
    try {
      await callAdminStudents('toggle_active', { id: s.id, active: !s.active })
      setStudents(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x))
      toast(s.active ? 'Student deactivated' : 'Student activated', 'success')
    } catch (e: any) {
      toast('Failed: ' + (e.message || 'Unknown error'), 'error')
    }
  }

  const previewCSV = () => {
    const rows = parseCSV(csvInput)
    setParsedRows(rows)
  }

  const importCSV = async () => {
    const valid = parsedRows.filter(r => !r.error)
    if (valid.length === 0) { toast('No valid rows to import', 'error'); return }
    setImporting(true)
    const payloads = valid.map(r => ({
      name: r.name.trim(),
      student_number: r.student_number.trim(),
      email: r.email.trim() || null,
      parent_name: r.parent_name.trim() || null,
      parent_email: r.parent_email.trim() || null,
      parent_phone: r.parent_phone.trim() || null,
      grade: r.grade ? parseInt(r.grade) : null,
      tier: 'default',
      csdtv_101_completed: false,
      active: true,
    }))
    let data: Student[] | null = null
    try {
      const res = await callAdminStudents('import_csv', { rows: payloads })
      data = res.data
    } catch (e: any) {
      setImporting(false)
      toast('Import failed: ' + (e.message || 'Unknown error'), 'error')
      return
    }
    setImporting(false)
    toast(`Imported ${data?.length || 0} students`, 'success')
    setShowImport(false)
    setCsvInput('')
    setParsedRows([])
    loadData()
  }

  const exportCSV = () => {
    const header = 'Name,Student Number,Email,Parent Name,Parent Email,Parent Phone,Grade,Tier,CSDtv 101 Complete,Active'
    const rows = filteredStudents.map(s => [
      s.name, s.student_number, s.email || '', s.parent_name || '', s.parent_email || '', s.parent_phone || '',
      s.grade ?? '', s.tier, s.csdtv_101_completed ? 'Yes' : 'No', s.active ? 'Yes' : 'No'
    ].map(c => {
      const str = String(c ?? '')
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
    }).join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  const availableTiers = tiers.length > 0 ? tiers : [{ id: 'default', name: 'default', cooldown_hours: 0, monthly_event_cap: null, description: null }]
  const grades = Array.from(new Set(students.map(s => s.grade).filter((g): g is number => g !== null))).sort((a, b) => a - b)

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '14px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '44px',
  }

  const tabBtn = (tab: typeof activeTab, label: string, count?: number) => (
    <button onClick={() => setActiveTab(tab)} style={{
      fontSize: '14px',
      padding: '10px 16px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontFamily: 'inherit',
      color: activeTab === tab ? '#5ba3e0' : muted,
      borderBottom: activeTab === tab ? '2px solid #1e6cb5' : '2px solid transparent',
      fontWeight: activeTab === tab ? 500 : 400,
      whiteSpace: 'nowrap' as const,
      minHeight: '44px',
    }}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  )

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: '0 0 4px' }}>Students</h1>
        <p style={{ fontSize: '14px', color: muted, margin: 0 }}>Roster, sign-ups, and Monday class attendance</p>
      </div>

      <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: '20px', overflowX: 'auto' as const }}>
        {tabBtn('signups', 'Sign-ups')}
        {tabBtn('roster', 'Roster', students.filter(s => s.active).length)}
        {tabBtn('classes', 'Classes')}
      </div>

      {activeTab === 'signups' && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '40px 20px', textAlign: 'center' as const }}>
          <p style={{ fontSize: '16px', fontWeight: 500, color: text, margin: '0 0 6px' }}>🎬 Crew sign-ups</p>
          <p style={{ fontSize: '14px', color: muted, margin: 0 }}>Once a production has Student Crew enabled, sign-ups appear here. Enable from a production&apos;s &quot;Student Crew&quot; tab.</p>
        </div>
      )}

      {activeTab === 'classes' && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '40px 20px', textAlign: 'center' as const }}>
          <p style={{ fontSize: '16px', fontWeight: 500, color: text, margin: '0 0 6px' }}>📚 Monday class attendance</p>
          <p style={{ fontSize: '14px', color: muted, margin: 0 }}>Track attendance for your Monday-night CSDtv 101 classes. Coming in the next chunk.</p>
        </div>
      )}

      {activeTab === 'roster' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '14px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 14px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, student #, email..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: text, fontFamily: 'inherit', width: '100%', minHeight: '32px' }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
            </div>
            <select value={filterActive} onChange={e => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')} style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="all">All</option>
            </select>
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}>
              <option value="all">All tiers</option>
              {availableTiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '110px' }}>
              <option value="all">All grades</option>
              {grades.map(g => <option key={g} value={String(g)}>Grade {g}</option>)}
            </select>
            {isManager && (
              <button onClick={startAdd} style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px', whiteSpace: 'nowrap' as const }}>+ Add student</button>
            )}
            {isManager && (
              <button onClick={() => setShowImport(true)} style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px', whiteSpace: 'nowrap' as const }}>📥 Import CSV</button>
            )}
            <button onClick={exportCSV} style={{ fontSize: '14px', padding: '10px 16px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px', whiteSpace: 'nowrap' as const }}>📤 Export CSV</button>
          </div>

          <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>{filteredStudents.length} of {students.length} students</p>

          {filteredStudents.length === 0 ? (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '40px 20px', textAlign: 'center' as const }}>
              <p style={{ fontSize: '15px', color: muted, margin: 0 }}>{students.length === 0 ? 'No students yet — click "Import CSV" to bulk add your roster.' : 'No matches — try clearing filters.'}</p>
            </div>
          ) : (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '14px', minWidth: '900px' }}>
                  <thead style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>Name</th>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>Student #</th>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>Grade</th>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>Tier</th>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>Parent contact</th>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>101</th>
                      <th style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: `0.5px solid ${border}` }}>Active</th>
                      <th style={{ padding: '12px 14px', borderBottom: `0.5px solid ${border}` }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => (
                      <tr key={s.id} style={{ borderBottom: i < filteredStudents.length - 1 ? `0.5px solid ${border}` : 'none', opacity: s.active ? 1 : 0.55 }}>
                        <td style={{ padding: '12px 14px', color: text, fontWeight: 500 }}>
                          {s.name}
                          {s.email && <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0', fontWeight: 400 }}>{s.email}</p>}
                        </td>
                        <td style={{ padding: '12px 14px', color: text, fontFamily: 'monospace' }}>{s.student_number}</td>
                        <td style={{ padding: '12px 14px', color: text }}>{s.grade ?? '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '12px', background: s.tier === 'restricted' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.1)', color: s.tier === 'restricted' ? '#f59e0b' : '#22c55e' }}>{s.tier}</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: text, fontSize: '13px' }}>
                          {s.parent_name || <span style={{ color: muted }}>—</span>}
                          {s.parent_email && <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{s.parent_email}</p>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>{s.csdtv_101_completed ? '✓' : <span style={{ color: muted }}>—</span>}</td>
                        <td style={{ padding: '12px 14px' }}>{s.active ? <span style={{ fontSize: '12px', color: '#22c55e' }}>● Active</span> : <span style={{ fontSize: '12px', color: muted }}>○ Inactive</span>}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>
                          {isManager ? (
                            <span>
                              <button onClick={() => startEdit(s)} style={{ fontSize: '13px', padding: '5px 10px', borderRadius: '6px', background: 'transparent', color: '#5ba3e0', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                              <button onClick={() => toggleActive(s)} style={{ fontSize: '13px', padding: '5px 10px', borderRadius: '6px', background: 'transparent', color: muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{s.active ? 'Deactivate' : 'Activate'}</button>
                            </span>
                          ) : <span style={{ fontSize: '12px', color: muted }}>View only</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {(showAdd || editingId) && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) closeForm() }}>
          <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' as const, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>{editingId ? 'Edit student' : 'Add student'}</h2>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Student # *</label>
                <input value={form.student_number} onChange={e => setForm(f => ({ ...f, student_number: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Grade</label>
                <input type="number" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="9 - 12" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Tier</label>
                <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} style={inputStyle}>
                  {availableTiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px' }}>Parent / guardian</p>
              <input value={form.parent_name} onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))} placeholder="Parent name" style={{ ...inputStyle, marginBottom: '8px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input value={form.parent_email} onChange={e => setForm(f => ({ ...f, parent_email: e.target.value }))} placeholder="Parent email" style={inputStyle} />
                <input value={form.parent_phone} onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))} placeholder="Parent phone" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' as const }} />
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.csdtv_101_completed} onChange={e => setForm(f => ({ ...f, csdtv_101_completed: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
                <span style={{ fontSize: '14px', color: text }}>CSDtv 101 completed</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
                <span style={{ fontSize: '14px', color: text }}>Active</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={saveStudent} disabled={saving} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
                {saving ? 'Saving...' : (editingId ? 'Save changes' : 'Add student')}
              </button>
              <button onClick={closeForm} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) { setShowImport(false); setCsvInput(''); setParsedRows([]) } }}>
          <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' as const, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>Import CSV</h2>
              <button onClick={() => { setShowImport(false); setCsvInput(''); setParsedRows([]) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>

            <p style={{ fontSize: '13px', color: muted, margin: '0 0 8px', lineHeight: 1.5 }}>Expected columns (in order): Name, Student Number, Email, Parent Name, Parent Email, Parent Phone, Grade. Comma OR tab delimited. Header row optional. Existing students with matching student numbers will be updated.</p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '6px' }}>Upload .csv file</label>
              <input type="file" accept=".csv,.tsv,.txt" onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                const txt = await file.text()
                setCsvInput(txt)
                setParsedRows(parseCSV(txt))
              }} style={{ ...inputStyle, padding: '8px 14px' }} />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '6px' }}>Or paste CSV here</label>
              <textarea value={csvInput} onChange={e => setCsvInput(e.target.value)} placeholder="Name,Student Number,Email,Parent Name,Parent Email,Parent Phone,Grade" style={{ ...inputStyle, minHeight: '120px', fontFamily: 'monospace', fontSize: '12px' }} />
              <button onClick={previewCSV} disabled={!csvInput.trim()} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: csvInput.trim() ? '#1e6cb5' : 'var(--surface-2)', color: csvInput.trim() ? '#fff' : muted, border: 'none', cursor: csvInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginTop: '8px' }}>Preview</button>
            </div>

            {parsedRows.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '13px', color: text, margin: '0 0 8px' }}>{parsedRows.filter(r => !r.error).length} valid · {parsedRows.filter(r => r.error).length} with errors</p>
                <div style={{ border: `0.5px solid ${border}`, borderRadius: '8px', maxHeight: '240px', overflowY: 'auto' as const }}>
                  {parsedRows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: i < parsedRows.length - 1 ? `0.5px solid ${border}` : 'none', background: r.error ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                      <span style={{ fontSize: '12px', color: muted, fontFamily: 'monospace', minWidth: '24px' }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: '13px', color: text }}>{r.name || '<no name>'}</span>
                      <span style={{ fontSize: '12px', color: muted, fontFamily: 'monospace' }}>{r.student_number || '—'}</span>
                      {r.error && <span style={{ fontSize: '11px', color: '#ef4444' }}>⚠ {r.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={importCSV} disabled={importing || parsedRows.filter(r => !r.error).length === 0} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: parsedRows.filter(r => !r.error).length > 0 ? '#1e6cb5' : 'var(--surface-2)', color: parsedRows.filter(r => !r.error).length > 0 ? '#fff' : muted, border: 'none', cursor: parsedRows.filter(r => !r.error).length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
                {importing ? 'Importing...' : `Import ${parsedRows.filter(r => !r.error).length} students`}
              </button>
              <button onClick={() => { setShowImport(false); setCsvInput(''); setParsedRows([]) }} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
