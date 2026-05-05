'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase'
import AppLayout from '../components/AppLayout'

type Student = {
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
  created_at: string
  updated_at: string
}

type Tier = {
  id: string
  name: string
  cooldown_hours: number
  monthly_event_cap: number | null
  description: string | null
}

type StudentFormData = {
  name: string
  student_number: string
  email: string
  phone: string
  parent_name: string
  parent_email: string
  parent_phone: string
  grade: string
  tier: string
  csdtv_101_completed: boolean
  notes: string
  active: boolean
}

type ParsedRow = {
  name: string
  student_number: string
  email: string
  parent_name: string
  parent_email: string
  parent_phone: string
  grade: string
  error?: string
}

const emptyFormData: StudentFormData = {
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(input: string): ParsedRow[] {
  const lines = input.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const firstLower = lines[0].toLowerCase()
  const hasHeader =
    firstLower.includes('name') ||
    firstLower.includes('student') ||
    firstLower.includes('email')

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
  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const subtle = dark ? '#8899bb' : '#9ca3af'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const borderLight = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const innerBg = dark ? '#111827' : '#f8f9fc'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'
  const blue = '#1e6cb5'
  const blueLink = '#5ba3e0'

  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'signups' | 'roster' | 'classes'>('roster')
  const [students, setStudents] = useState<Student[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterGrade, setFilterGrade] = useState<string>('all')
  const [filterActive, setFilterActive] = useState<'active' | 'inactive' | 'all'>('active')

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [formData, setFormData] = useState<StudentFormData>(emptyFormData)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importStep, setImportStep] = useState<'paste' | 'preview' | 'done'>('paste')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    setLoading(true)
    const [studentsRes, tiersRes] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('signup_tiers').select('*').order('name'),
    ])
    setStudents(studentsRes.data || [])
    setTiers(tiersRes.data || [])
    setLoading(false)
  }

  const filteredStudents = students.filter(s => {
    if (filterActive === 'active' && !s.active) return false
    if (filterActive === 'inactive' && s.active) return false
    if (filterTier !== 'all' && s.tier !== filterTier) return false
    if (filterGrade !== 'all' && String(s.grade) !== filterGrade) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.student_number.toLowerCase().includes(q) ||
        (s.email?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  const counts = {
    total: students.filter(s => s.active).length,
    default: students.filter(s => s.active && s.tier === 'default').length,
    restricted: students.filter(s => s.active && s.tier === 'restricted').length,
    inactive: students.filter(s => !s.active).length,
  }

  function openAddModal() {
    setFormData(emptyFormData)
    setFormError('')
    setEditingStudent(null)
    setShowAddModal(true)
  }

  function openEditModal(student: Student) {
    setFormData({
      name: student.name,
      student_number: student.student_number,
      email: student.email || '',
      phone: student.phone || '',
      parent_name: student.parent_name || '',
      parent_email: student.parent_email || '',
      parent_phone: student.parent_phone || '',
      grade: student.grade ? String(student.grade) : '',
      tier: student.tier,
      csdtv_101_completed: student.csdtv_101_completed,
      notes: student.notes || '',
      active: student.active,
    })
    setFormError('')
    setEditingStudent(student)
    setShowAddModal(true)
  }

  function closeModal() {
    setShowAddModal(false)
    setEditingStudent(null)
    setFormError('')
  }

  async function saveStudent() {
    if (!formData.name.trim() || !formData.student_number.trim()) {
      setFormError('Name and student number are required.')
      return
    }
    setSaving(true)
    setFormError('')

    const payload = {
      name: formData.name.trim(),
      student_number: formData.student_number.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      parent_name: formData.parent_name.trim() || null,
      parent_email: formData.parent_email.trim() || null,
      parent_phone: formData.parent_phone.trim() || null,
      grade: formData.grade ? parseInt(formData.grade, 10) : null,
      tier: formData.tier,
      csdtv_101_completed: formData.csdtv_101_completed,
      notes: formData.notes.trim() || null,
      active: formData.active,
      updated_at: new Date().toISOString(),
    }

    const result = editingStudent
      ? await supabase.from('students').update(payload).eq('id', editingStudent.id)
      : await supabase.from('students').insert(payload)

    setSaving(false)

    if (result.error) {
      setFormError(
        result.error.code === '23505'
          ? `Student number ${payload.student_number} already exists.`
          : result.error.message
      )
      return
    }

    closeModal()
    await loadData()
  }

  function handleParseImport() {
    const rows = parseCSV(importText)
    setParsedRows(rows)
    setImportStep('preview')
  }

  async function handleConfirmImport() {
    setImporting(true)
    let success = 0
    let failed = 0

    const valid = parsedRows.filter(r => !r.error)
    const payload = valid.map(r => ({
      name: r.name,
      student_number: r.student_number,
      email: r.email || null,
      parent_name: r.parent_name || null,
      parent_email: r.parent_email || null,
      parent_phone: r.parent_phone || null,
      grade: r.grade ? parseInt(r.grade, 10) : null,
      tier: 'default',
      active: true,
    }))

    for (const row of payload) {
      const { error } = await supabase.from('students').insert(row)
      if (error) failed++
      else success++
    }

    setImporting(false)
    setImportResult({ success, failed })
    setImportStep('done')
    await loadData()
  }

  function closeImportModal() {
    setShowImportModal(false)
    setImportText('')
    setParsedRows([])
    setImportStep('paste')
    setImportResult(null)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const result = evt.target?.result
      if (typeof result === 'string') setImportText(result)
    }
    reader.readAsText(file)
  }

  function downloadCSV() {
    const headers = 'Name,Student Number,Email,Parent Name,Parent Email,Parent Phone,Grade,Tier,Active\n'
    const rows = students.map(s =>
      [
        s.name,
        s.student_number,
        s.email || '',
        s.parent_name || '',
        s.parent_email || '',
        s.parent_phone || '',
        s.grade || '',
        s.tier,
        s.active ? 'Yes' : 'No',
      ]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n')

    const csv = headers + rows
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `students-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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

  const btnPrimary: React.CSSProperties = {
    padding: '10px 18px',
    borderRadius: '10px',
    background: blue,
    color: 'white',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: '44px',
  }

  const btnGhost: React.CSSProperties = {
    ...btnPrimary,
    background: 'transparent',
    color: blueLink,
    border: `0.5px solid ${dark ? 'rgba(30,108,181,0.3)' : 'rgba(30,108,181,0.4)'}`,
  }

  const btnSecondary: React.CSSProperties = {
    ...btnPrimary,
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    color: text,
    border: `0.5px solid ${border}`,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    color: muted,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    display: 'block',
    marginBottom: '5px',
  }

  return (
    <AppLayout>
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: text, marginBottom: '4px' }}>
          Students
        </h1>
        <p style={{ fontSize: '14px', color: muted, marginBottom: '20px' }}>
          Manage all student crew sign-ups, the roster, and Monday classes.
        </p>

        <div style={{ display: 'flex', gap: '4px', borderBottom: `0.5px solid ${border}`, marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { id: 'signups' as const, label: 'Sign-ups', count: 0 },
            { id: 'roster' as const, label: 'Roster', count: counts.total },
            { id: 'classes' as const, label: 'Classes', count: 0 },
          ].map(tab => (
            <div key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 14px',
                fontSize: '14px',
                color: activeTab === tab.id ? text : subtle,
                borderBottom: `2px solid ${activeTab === tab.id ? blue : 'transparent'}`,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {tab.label}{' '}
              <span style={{
                fontSize: '11px',
                padding: '1px 6px',
                background: activeTab === tab.id ? 'rgba(30,108,181,0.2)' : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                color: activeTab === tab.id ? blueLink : subtle,
                borderRadius: '4px',
                marginLeft: '4px',
              }}>
                {tab.count}
              </span>
            </div>
          ))}
        </div>

        {activeTab === 'signups' && (
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
            <p style={{ color: muted, fontSize: '14px', marginBottom: '4px' }}>
              Sign-ups view coming in Phase 2.
            </p>
            <p style={{ color: subtle, fontSize: '12px' }}>
              Once student crew sign-ups are live on productions, this tab will show every active sign-up across all productions.
            </p>
          </div>
        )}

        {activeTab === 'classes' && (
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
            <p style={{ color: muted, fontSize: '14px', marginBottom: '4px' }}>
              Monday classes view coming in Phase 5.
            </p>
            <p style={{ color: subtle, fontSize: '12px' }}>
              Class sessions, attendance roster, and the kiosk URL will live here.
            </p>
          </div>
        )}

        {activeTab === 'roster' && (
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>Roster</h3>
                <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>
                  {counts.total} active · {counts.default} default · {counts.restricted} restricted
                  {counts.inactive > 0 && ` · ${counts.inactive} inactive`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button style={btnGhost} onClick={downloadCSV}>Download CSV</button>
                <button style={btnGhost} onClick={() => setShowImportModal(true)}>Bulk import CSV</button>
                <button style={btnPrimary} onClick={openAddModal}>+ Add student</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              <input
                style={inputStyle}
                placeholder="Search by name, student #, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select style={inputStyle} value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
                <option value="all">All tiers</option>
                {tiers.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
              <select style={inputStyle} value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
                <option value="all">All grades</option>
                <option value="9">9th</option>
                <option value="10">10th</option>
                <option value="11">11th</option>
                <option value="12">12th</option>
              </select>
              <select style={inputStyle} value={filterActive} onChange={(e) => setFilterActive(e.target.value as 'active' | 'inactive' | 'all')}>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="all">All students</option>
              </select>
            </div>

            {loading ? (
              <p style={{ padding: '40px', textAlign: 'center', color: muted }}>Loading...</p>
            ) : filteredStudents.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: muted }}>
                {students.length === 0 ? (
                  <div>
                    <p style={{ fontSize: '14px', marginBottom: '4px' }}>No students yet.</p>
                    <p style={{ fontSize: '12px', color: subtle }}>
                      Add students manually or bulk import from CSV.
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: '14px' }}>No students match your filters.</p>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Name', 'Student #', 'Grade', 'Email', 'Parent contact', 'Tier', 'Trained', ''].map(h => (
                        <th key={h} style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          fontWeight: 500,
                          color: subtle,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          borderBottom: `0.5px solid ${border}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(s => (
                      <tr
                        key={s.id}
                        onClick={() => openEditModal(s)}
                        style={{ cursor: 'pointer', opacity: s.active ? 1 : 0.5 }}
                      >
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}`, color: text }}>
                          {s.name}
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}`, color: text, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>
                          {s.student_number}
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}` }}>
                          {s.grade ? (
                            <span style={{ fontSize: '11px', padding: '2px 6px', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '4px', color: muted }}>
                              {s.grade}{s.grade === 12 ? ' 🎓' : ''}
                            </span>
                          ) : <span style={{ color: subtle }}>—</span>}
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}`, color: blueLink, fontSize: '12px' }}>
                          {s.email || <span style={{ color: subtle }}>—</span>}
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}`, color: muted, fontSize: '12px' }}>
                          {s.parent_email || s.parent_name || <span style={{ color: subtle }}>—</span>}
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}` }}>
                          <span style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontWeight: 500,
                            background: s.tier === 'restricted' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                            color: s.tier === 'restricted' ? '#f87171' : '#4ade80',
                          }}>
                            {s.tier}
                          </span>
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}`, fontSize: '12px' }}>
                          {s.csdtv_101_completed ? <span style={{ color: '#4ade80' }}>✓</span> : <span style={{ color: subtle }}>—</span>}
                        </td>
                        <td style={{ padding: '12px', borderBottom: `0.5px solid ${borderLight}`, color: subtle, fontSize: '14px', textAlign: 'center' }}>
                          ⋯
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <div onClick={closeModal} style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: text, marginBottom: '4px' }}>
              {editingStudent ? 'Edit student' : 'Add student'}
            </h2>
            <p style={{ fontSize: '13px', color: muted, marginBottom: '20px' }}>
              {editingStudent ? `Editing ${editingStudent.name}` : 'Add a new student to the roster.'}
            </p>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input style={inputStyle} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Student # *</label>
                  <input style={inputStyle} value={formData.student_number} onChange={(e) => setFormData({ ...formData, student_number: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Grade</label>
                  <select style={inputStyle} value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value })}>
                    <option value="">—</option>
                    <option value="9">9th</option>
                    <option value="10">10th</option>
                    <option value="11">11th</option>
                    <option value="12">12th</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Phone (student)</label>
                <input style={inputStyle} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>

              <hr style={{ border: 'none', borderTop: `0.5px solid ${border}`, margin: '4px 0' }} />

              <div>
                <label style={labelStyle}>Parent name</label>
                <input style={inputStyle} value={formData.parent_name} onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Parent email</label>
                  <input style={inputStyle} value={formData.parent_email} onChange={(e) => setFormData({ ...formData, parent_email: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Parent phone</label>
                  <input style={inputStyle} value={formData.parent_phone} onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })} />
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: `0.5px solid ${border}`, margin: '4px 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Sign-up tier</label>
                  <select style={inputStyle} value={formData.tier} onChange={(e) => setFormData({ ...formData, tier: e.target.value })}>
                    {tiers.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={inputStyle} value={formData.active ? 'active' : 'inactive'} onChange={(e) => setFormData({ ...formData, active: e.target.value === 'active' })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: text, cursor: 'pointer', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={formData.csdtv_101_completed}
                  onChange={(e) => setFormData({ ...formData, csdtv_101_completed: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                CSDtv 101 training completed
              </label>

              <div>
                <label style={labelStyle}>Notes (manager only)</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '70px', lineHeight: 1.5, resize: 'vertical' }}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>

            {formError && (
              <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '13px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button style={btnSecondary} onClick={closeModal} disabled={saving}>Cancel</button>
              <button style={btnPrimary} onClick={saveStudent} disabled={saving}>
                {saving ? 'Saving...' : (editingStudent ? 'Save changes' : 'Add student')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div onClick={closeImportModal} style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '780px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: text, marginBottom: '4px' }}>
              Bulk import students
            </h2>
            <p style={{ fontSize: '13px', color: muted, marginBottom: '20px' }}>
              Paste from Excel/Google Sheets, or upload a CSV file.
            </p>

            {importStep === 'paste' && (
              <div>
                <div style={{ marginBottom: '12px', padding: '12px 14px', background: innerBg, borderRadius: '10px', fontSize: '12px', color: muted, lineHeight: 1.6 }}>
                  Expected columns in this order:
                  <br />
                  <code style={{ color: blueLink, fontFamily: 'ui-monospace, monospace' }}>
                    Name, Student #, Email, Parent name, Parent email, Parent phone, Grade
                  </code>
                  <br />
                  Header row optional. Tab or comma separated. All students imported as Default tier — change individually after import.
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Paste data</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '160px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.5, resize: 'vertical' }}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={'Sarah Wong\t1024815\tswong@canyonsdistrict.org\tKim Wong\tk.wong@gmail.com\t801-555-1234\t10'}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Or upload CSV file</label>
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    style={{ ...inputStyle, padding: '8px 14px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button style={btnSecondary} onClick={closeImportModal}>Cancel</button>
                  <button
                    style={btnPrimary}
                    onClick={handleParseImport}
                    disabled={!importText.trim()}
                  >
                    Preview
                  </button>
                </div>
              </div>
            )}

            {importStep === 'preview' && (
              <div>
                <div style={{ marginBottom: '12px', fontSize: '13px', color: text }}>
                  {parsedRows.filter(r => !r.error).length} valid · {parsedRows.filter(r => r.error).length} errors
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto', border: `0.5px solid ${border}`, borderRadius: '10px', marginBottom: '16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: cardBg }}>
                      <tr>
                        {['#', 'Name', 'Student #', 'Email', 'Grade', 'Status'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500, color: subtle, fontSize: '11px', textTransform: 'uppercase', borderBottom: `0.5px solid ${border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((r, i) => (
                        <tr key={i} style={{ opacity: r.error ? 0.6 : 1 }}>
                          <td style={{ padding: '8px 10px', color: subtle, borderBottom: `0.5px solid ${borderLight}` }}>{i + 1}</td>
                          <td style={{ padding: '8px 10px', color: text, borderBottom: `0.5px solid ${borderLight}` }}>{r.name || '—'}</td>
                          <td style={{ padding: '8px 10px', color: text, borderBottom: `0.5px solid ${borderLight}`, fontFamily: 'ui-monospace, monospace' }}>{r.student_number || '—'}</td>
                          <td style={{ padding: '8px 10px', color: muted, borderBottom: `0.5px solid ${borderLight}` }}>{r.email || '—'}</td>
                          <td style={{ padding: '8px 10px', color: muted, borderBottom: `0.5px solid ${borderLight}` }}>{r.grade || '—'}</td>
                          <td style={{ padding: '8px 10px', borderBottom: `0.5px solid ${borderLight}` }}>
                            {r.error ? (
                              <span style={{ color: '#f87171', fontSize: '11px' }}>{r.error}</span>
                            ) : (
                              <span style={{ color: '#4ade80', fontSize: '11px' }}>✓ Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button style={btnSecondary} onClick={() => setImportStep('paste')}>Back</button>
                  <button
                    style={btnPrimary}
                    onClick={handleConfirmImport}
                    disabled={importing || parsedRows.filter(r => !r.error).length === 0}
                  >
                    {importing ? 'Importing...' : `Import ${parsedRows.filter(r => !r.error).length} students`}
                  </button>
                </div>
              </div>
            )}

            {importStep === 'done' && importResult && (
              <div>
                <div style={{ padding: '24px', background: 'rgba(34,197,94,0.06)', border: '0.5px solid rgba(34,197,94,0.3)', borderRadius: '12px', marginBottom: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  <div style={{ fontSize: '17px', fontWeight: 600, color: text, marginBottom: '4px' }}>
                    Imported {importResult.success} students
                  </div>
                  {importResult.failed > 0 && (
                    <div style={{ fontSize: '13px', color: '#f87171' }}>
                      {importResult.failed} failed (likely duplicate student numbers — already in roster)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button style={btnPrimary} onClick={closeImportModal}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}