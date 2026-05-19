'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'

type MeetingRow = {
  id: string
  production_number: number
  title: string
  start_datetime: string | null
  status: string | null
  board_meeting?: {
    broadcast_status: string
    agenda_locked: boolean
  } | null
}

export default function MeetingsTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const { data: prods } = await supabase
      .from('productions')
      .select('id, production_number, title, start_datetime, status')
      .eq('request_type_number', 4)
      .order('start_datetime', { ascending: false, nullsFirst: false })

    const list = prods || []
    if (list.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const ids = list.map(p => p.id)
    const { data: bms } = await supabase
      .from('board_meetings')
      .select('production_id, broadcast_status, agenda_locked')
      .in('production_id', ids)

    const bmByProd = new Map((bms || []).map(b => [b.production_id, b]))
    setRows(
      list.map(p => ({
        ...p,
        board_meeting: bmByProd.get(p.id) || null,
      })),
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  if (loading) return <Loader />

  if (rows.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: muted, background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
        No board meeting productions yet. Create a production with type Board Meeting (request type 4).
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.map(r => (
        <Link
          key={r.id}
          href={`/dashboard/productions/${r.production_number}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '14px 16px',
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '10px',
            textDecoration: 'none',
            color: text,
            minHeight: '44px',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>#{r.production_number} {r.title}</div>
            <div style={{ fontSize: '13px', color: muted, marginTop: '4px' }}>
              {r.start_datetime
                ? new Date(r.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                : 'Date TBD'}
              {r.board_meeting ? ` · ${r.board_meeting.broadcast_status}${r.board_meeting.agenda_locked ? ' · agenda locked' : ''}` : ' · not started'}
            </div>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--brand-primary)' }}>Open →</span>
        </Link>
      ))}
    </div>
  )
}
