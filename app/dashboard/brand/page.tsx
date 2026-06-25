'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CHECKER: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#dfe3e8 25%,transparent 25%),linear-gradient(-45deg,#dfe3e8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe3e8 75%),linear-gradient(-45deg,transparent 75%,#dfe3e8 75%)',
  backgroundSize: '18px 18px',
  backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
}

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type BrandSchoolSummary = {
  code: string
  name: string
  mascot: string | null
  city: string | null
  level: BrandLevel
  preview: string | null
  logoCount: number
}

const LEVELS: ('All' | BrandLevel)[] = ['All', 'Elementary', 'Middle', 'High', 'Specialty']

function initialOf(name: string): string {
  const t = name.trim()
  return t ? t[0].toUpperCase() : '?'
}

export default function ManagerBrandGridPage() {
  const router = useRouter()
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [schools, setSchools] = useState<BrandSchoolSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<'All' | BrandLevel>('All')

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/team', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (String(d?.team?.role || '').toLowerCase() === 'manager') setAccess('ok')
        else { setAccess('denied'); router.replace('/dashboard') }
      })
      .catch(() => { if (!cancelled) { setAccess('denied'); router.replace('/dashboard') } })
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (access !== 'ok') return
    let cancelled = false
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d?.schools)) setSchools(d.schools as BrandSchoolSummary[])
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [access])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schools.filter((s) => {
      if (level !== 'All' && s.level !== level) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || (s.mascot || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q)
    })
  }, [schools, query, level])

  if (access !== 'ok') {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Checking access...</div>
  }

  const tabBtn = (on: boolean) => ({ padding: '6px 14px', borderRadius: 999, border: `1px solid ${on ? '#185fa5' : 'var(--border-subtle)'}`, background: on ? '#185fa5' : 'transparent', color: on ? '#ffffff' : 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' as const })

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 16px 56px', color: 'var(--text-primary)' }}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Brand library</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Pick a school to add, organize, and remove its logos. Colors are managed in Settings under Schools and locations.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <Link href="/dashboard/brand/bulk" style={{ fontSize: 13, fontWeight: 700, color: '#185fa5', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px' }}>Bulk upload</Link>
          <Link href="/dashboard/brand/flagged" style={{ fontSize: 13, fontWeight: 700, color: '#b42318', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px' }}>Flagged for deletion</Link>
          <Link href="/brand" target="_blank" style={{ fontSize: 13, fontWeight: 700, color: '#185fa5', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px' }}>View public page</Link>
        </div>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by school, mascot, or city"
        style={{ width: '100%', height: 42, border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '0 14px', fontSize: 15, color: 'var(--text-primary)', background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 16px' }}>
        {LEVELS.map((lv) => (
          <button key={lv} type="button" onClick={() => setLevel(lv)} style={tabBtn(lv === level)}>{lv}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading the catalog...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>No schools match your search.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {filtered.map((s) => (
            <Link key={s.code} href={`/dashboard/brand/${s.code}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--border-subtle)', borderRadius: 14, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 120, ...CHECKER, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid var(--border-subtle)' }}>
                {s.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.preview} alt={`${s.name} logo`} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 40, fontWeight: 800, color: '#9aa3b2' }}>{initialOf(s.name)}</span>
                )}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{s.name}</h2>
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '2px 8px' }}>{s.level}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {s.logoCount > 0 ? `${s.logoCount} logo${s.logoCount === 1 ? '' : 's'}` : 'No logos yet'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
