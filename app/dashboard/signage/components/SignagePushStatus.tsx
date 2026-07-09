'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { useSignage } from './SignageProvider'
import { useSignageAdminStyles } from './SignageAdmin'

// Shows whether recent content edits have reached the physical displays yet.
// Content edits set signage_screens.ablesign_html_dirty_at; a push (the "dirty"
// cron every ~2 min, plus an hourly full refresh, paused 10pm–5am Mountain)
// clears it and stamps ablesign_synced_at. So: any dirty screen = pending.

type Row = { synced: string | null; dirty: string | null }

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  return `${Math.floor(h / 24)} d ago`
}

function denverHour(): number {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? 12 : n
}

function nextEvenMinute(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + (d.getMinutes() % 2 === 0 ? 2 : 1))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function nextTopOfHour(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function SignagePushStatus() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const { activeSiteId } = useSignage()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[] | null>(null)

  const load = useCallback(async () => {
    if (!activeSiteId) return
    const { data } = await supabase
      .from('signage_screens')
      .select('ablesign_synced_at, ablesign_html_dirty_at')
      .eq('site_id', activeSiteId)
      .eq('active', true)
      .not('ablesign_screen_id', 'is', null)
    setRows((data ?? []).map(r => ({ synced: r.ablesign_synced_at as string | null, dirty: r.ablesign_html_dirty_at as string | null })))
  }, [supabase, activeSiteId])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  // No linked displays at this location → nothing meaningful to show.
  if (!rows || rows.length === 0) return null

  const pending = rows.filter(r => r.dirty).length
  const lastPush = rows.map(r => r.synced).filter(Boolean).sort().reverse()[0] ?? null
  const quiet = (() => { const h = denverHour(); return h >= 22 || h < 5 })()

  const upToDate = pending === 0
  const dot = upToDate ? '#16a34a' : quiet ? '#9aa0ab' : '#d97706'
  const bg = upToDate ? 'rgba(34,197,94,0.08)' : quiet ? 'rgba(120,130,150,0.08)' : 'rgba(217,119,6,0.08)'
  const border = upToDate ? 'rgba(34,197,94,0.3)' : quiet ? 'rgba(120,130,150,0.3)' : 'rgba(217,119,6,0.35)'

  let message: string
  if (upToDate) {
    message = `Displays up to date — last pushed ${relTime(lastPush)}. Next refresh around ${nextTopOfHour()}.`
  } else if (quiet) {
    message = `${pending} display${pending === 1 ? '' : 's'} have changes waiting — auto-push is paused overnight and resumes at 5:00 AM. Last pushed ${relTime(lastPush)}.`
  } else {
    message = `${pending} display${pending === 1 ? '' : 's'} updating — new changes push automatically within ~2 minutes (next around ${nextEvenMinute()}). Last pushed ${relTime(lastPush)}.`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 10, background: bg, border: `1px solid ${border}`, marginBottom: 14 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: s.text, lineHeight: 1.4, flex: 1 }}>{message}</span>
      <button type="button" onClick={() => void load()} title="Refresh status" style={{ ...s.btnSmall }}>↻</button>
    </div>
  )
}
