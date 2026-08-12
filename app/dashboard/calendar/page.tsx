'use client'

import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { formatDate, formatTime, toDate } from '@/lib/format-date'

type School = {
  id: string
  name: string
  primary_color: string | null
}

type LayerKind = 'district' | 'content' | 'capture'

type AgendaItem = {
  id: string
  kind: LayerKind
  title: string
  sortKey: number
  dateLabel: string
  subtitle: string
  color: string
  schoolId?: string
}

const LAYER_COLOR: Record<LayerKind, string> = {
  district: '#1e6cb5',
  content: '#a855f7',
  capture: '#16a34a',
}

const LAYER_LABEL: Record<LayerKind, string> = {
  district: 'District',
  content: 'Content',
  capture: 'Capture',
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d)
}

function LayerToggle({
  kind, label, active, muted, border, onClick,
}: {
  kind: LayerKind
  label: string
  active: boolean
  muted: string
  border: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px',
        border: `0.5px solid ${active ? LAYER_COLOR[kind] : border}`,
        background: active ? `${LAYER_COLOR[kind]}1a` : 'transparent',
        color: active ? LAYER_COLOR[kind] : muted,
        cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, minHeight: '38px',
      }}
    >
      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: LAYER_COLOR[kind], flexShrink: 0, opacity: active ? 1 : 0.35 }} />
      {label}
    </button>
  )
}

export default function CalendarOverviewPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [schools, setSchools] = useState<School[]>([])
  const [items, setItems] = useState<AgendaItem[]>([])
  const [layers, setLayers] = useState<Record<LayerKind, boolean>>({ district: true, content: true, capture: true })
  const [schoolFilter, setSchoolFilter] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: schoolRows }, { data: eventRows }, { data: campaignRows }, { data: captureRows }] = await Promise.all([
      supabase.from('schools').select('id, name, primary_color').eq('type', 'school').eq('active', true).order('name'),
      supabase.from('calendar_school_events')
        .select('id, school_id, title, start_time, end_time, location, category, is_streaming')
        .eq('status', 'visible')
        .order('start_time', { ascending: true }),
      supabase.from('calendar_campaigns').select('id, name, start_date, end_date').order('start_date', { ascending: true }),
      supabase.from('calendar_capture_plans').select('id, title, plan_date').order('plan_date', { ascending: true }),
    ])

    const schoolList: School[] = schoolRows || []
    setSchools(schoolList)
    const schoolMap = new Map(schoolList.map(s => [s.id, s]))

    const districtItems: AgendaItem[] = (eventRows || []).map((e: Record<string, unknown>) => {
      const start = new Date(e.start_time as string)
      const school = schoolMap.get(e.school_id as string)
      return {
        id: `district-${e.id}`,
        kind: 'district',
        title: e.title as string,
        sortKey: start.getTime(),
        dateLabel: `${formatDate(e.start_time as string)} · ${formatTime(e.start_time as string)}`,
        subtitle: [school?.name, e.category, e.is_streaming ? 'Streaming' : null].filter(Boolean).join(' · '),
        color: LAYER_COLOR.district,
        schoolId: e.school_id as string,
      }
    })

    const contentItems: AgendaItem[] = (campaignRows || []).map((c: Record<string, unknown>) => {
      const start = toDate(c.start_date as string)!
      return {
        id: `content-${c.id}`,
        kind: 'content',
        title: c.name as string,
        sortKey: start.getTime(),
        dateLabel: `${formatDate(c.start_date as string)} – ${formatDate(c.end_date as string)}`,
        subtitle: 'Campaign',
        color: LAYER_COLOR.content,
      }
    })

    const captureItems: AgendaItem[] = (captureRows || []).map((p: Record<string, unknown>) => {
      const start = toDate(p.plan_date as string)!
      return {
        id: `capture-${p.id}`,
        kind: 'capture',
        title: p.title as string,
        sortKey: start.getTime(),
        dateLabel: formatDate(p.plan_date as string),
        subtitle: 'Capture plan',
        color: LAYER_COLOR.capture,
      }
    })

    setItems([...districtItems, ...contentItems, ...captureItems].sort((a, b) => a.sortKey - b.sortKey))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function toggleLayer(kind: LayerKind) {
    setLayers(prev => ({ ...prev, [kind]: !prev[kind] }))
  }

  const startOfToday = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])

  const visibleItems = items.filter(item => {
    if (!layers[item.kind]) return false
    if (item.kind === 'district' && schoolFilter && item.schoolId !== schoolFilter) return false
    return item.sortKey >= startOfToday
  })

  const grouped: { key: string; label: string; items: AgendaItem[] }[] = []
  for (const item of visibleItems) {
    const d = new Date(item.sortKey)
    const key = monthKey(d)
    let group = grouped.find(g => g.key === key)
    if (!group) {
      group = { key, label: monthLabel(d), items: [] }
      grouped.push(group)
    }
    group.items.push(item)
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '6px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Calendar</h1>
          <p style={{ fontSize: '15px', color: muted, margin: 0, lineHeight: 1.5, maxWidth: '640px' }}>
            District events, content campaigns, and capture plans in one view. Toggle layers below.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <Link href="/dashboard/calendar/content" style={{
            fontSize: '13.5px', padding: '9px 16px', borderRadius: '10px', background: 'transparent', color: muted,
            border: `0.5px solid ${border}`, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', minHeight: '38px',
          }}>Content calendar</Link>
          <Link href="/dashboard/calendar/capture" style={{
            fontSize: '13.5px', padding: '9px 16px', borderRadius: '10px', background: 'transparent', color: muted,
            border: `0.5px solid ${border}`, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', minHeight: '38px',
          }}>Capture planning</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, margin: '20px 0 16px' }}>
        <LayerToggle kind="district" label={LAYER_LABEL.district} active={layers.district} muted={muted} border={border} onClick={() => toggleLayer('district')} />
        <LayerToggle kind="content" label={LAYER_LABEL.content} active={layers.content} muted={muted} border={border} onClick={() => toggleLayer('content')} />
        <LayerToggle kind="capture" label={LAYER_LABEL.capture} active={layers.capture} muted={muted} border={border} onClick={() => toggleLayer('capture')} />

        {layers.district && (
          <select
            value={schoolFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSchoolFilter(e.target.value)}
            style={{
              height: '38px', borderRadius: '10px', border: `0.5px solid ${border}`, background: inputBg,
              color: text, padding: '0 10px', fontSize: '13.5px', fontFamily: 'inherit', marginLeft: '4px',
            }}
          >
            <option value="">All schools</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p style={{ color: muted, fontSize: '15px' }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p style={{ color: muted, fontSize: '14px', padding: '20px' }}>Nothing upcoming with the current filters.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
          {grouped.map(group => (
            <div key={group.key}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>{group.label}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map(item => (
                  <div key={item.id} style={{
                    background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px',
                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <div style={{ minWidth: '150px', flexShrink: 0 }}>
                      <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{item.dateLabel}</p>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14.5px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.title}</p>
                      {item.subtitle && <p style={{ fontSize: '12.5px', color: muted, margin: '2px 0 0' }}>{item.subtitle}</p>}
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 600, color: item.color, background: `${item.color}1a`,
                      padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
                    }}>{LAYER_LABEL[item.kind]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
