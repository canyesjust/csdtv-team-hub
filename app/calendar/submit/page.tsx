'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type CalCategory = 'athletics' | 'arts' | 'academics' | 'closures'

const CATEGORIES: { key: CalCategory; label: string }[] = [
  { key: 'athletics', label: 'Athletics' },
  { key: 'arts', label: 'Arts' },
  { key: 'academics', label: 'Academics' },
  { key: 'closures', label: 'Closures & Announcements' },
]

type SchoolOption = { id: string; name: string }

const EMAIL_RE = /^[^\s@]+@canyonsdistrict\.org$/i

const inputStyle = {
  width: '100%', background: '#fff', border: '1px solid #d4d4d8', color: '#18181b',
  borderRadius: 8, padding: '0 12px', height: 40, fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' as const,
}
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#3f3f46', marginBottom: 6 }

export default function SubmitCalendarEventPage() {
  const supabase = createClient()

  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [category, setCategory] = useState<CalCategory>('academics')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('schools')
        .select('id, name')
        .or('type.eq.school,name.eq.Board of Education,name.eq.Canyons School District')
        .eq('active', true)
        .order('name')
      setSchools(data || [])
    }
    load()
  }, [supabase])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Please enter a title.')
    if (!schoolId) return setError('Please choose a school.')
    if (!start) return setError('Please choose a start date and time.')
    if (!name.trim()) return setError('Please enter your name.')
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid @canyonsdistrict.org email address.')

    setSubmitting(true)
    try {
      const res = await fetch('/api/calendar/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          category,
          title: title.trim(),
          start_time: new Date(start).toISOString(),
          end_time: end ? new Date(end).toISOString() : null,
          location: location.trim() || null,
          description: description.trim() || null,
          submitted_by_name: name.trim(),
          submitted_by_email: email.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ margin: 0, background: '#fafafa', color: '#18181b', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", Helvetica, Arial, sans-serif', fontSize: '14.5px', lineHeight: 1.5, minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e7', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/calendar" style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: '14.5px', letterSpacing: '-0.01em', color: '#18181b', textDecoration: 'none' }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: '#065687', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>C</span>
          CSDtv <span style={{ color: '#71717a', fontWeight: 500 }}>&nbsp;/ District Calendar</span>
        </Link>
        <Link href="/calendar" style={{ fontSize: '13px', fontWeight: 600, color: '#065687', textDecoration: 'none' }}>← Back to calendar</Link>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 90px' }}>
        <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 8px' }}>Submit an event</h1>
        <p style={{ fontSize: '14.5px', color: '#71717a', margin: '0 0 24px', lineHeight: 1.6 }}>
          Open to Canyons School District staff. Submissions are reviewed by the CSDtv team before they appear on
          the public calendar &mdash; nothing goes live automatically.
        </p>

        {done ? (
          <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#166534', margin: '0 0 6px' }}>Thanks — it&apos;s in the queue.</p>
            <p style={{ fontSize: 14, color: '#71717a', margin: 0, lineHeight: 1.6 }}>
              The CSDtv team will review it shortly. If it&apos;s approved, it&apos;ll appear on the{' '}
              <Link href="/calendar" style={{ color: '#065687', fontWeight: 600 }}>district calendar</Link>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13.5 }}>{error}</div>
            )}

            <div>
              <label style={labelStyle}>Event title</label>
              <input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="Fall choir concert" style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>School</label>
                <select value={schoolId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSchoolId(e.target.value)} style={inputStyle}>
                  <option value="">Select a school...</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={category} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value as CalCategory)} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Starts</label>
                <input type="datetime-local" value={start} onChange={(e: ChangeEvent<HTMLInputElement>) => setStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Ends (optional)</label>
                <input type="datetime-local" value={end} onChange={(e: ChangeEvent<HTMLInputElement>) => setEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Location (optional)</label>
              <input value={location} onChange={(e: ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)} placeholder="Main gym" style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Description (optional)</label>
              <textarea value={description} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical' as const }} />
            </div>

            <div style={{ height: 1, background: '#e4e4e7', margin: '4px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Your name</label>
                <input value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Your @canyonsdistrict.org email</label>
                <input type="email" value={email} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="you@canyonsdistrict.org" style={inputStyle} />
              </div>
            </div>

            <button type="submit" disabled={submitting} style={{
              background: '#065687', color: '#fff', border: 'none', borderRadius: 8, height: 44,
              fontSize: 14.5, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit',
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
