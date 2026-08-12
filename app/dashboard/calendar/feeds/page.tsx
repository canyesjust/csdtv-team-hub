'use client'

import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { canManageCalendarQueue } from '@/lib/calendar-access'

type School = {
  id: string
  name: string
  short_name: string | null
  level: string | null
  primary_color: string | null
}

type Feed = {
  id: string
  school_id: string
  ics_url: string
  last_synced_at: string | null
  last_sync_ok: boolean | null
  last_sync_error: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never synced'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function CalendarFeedsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const router = useRouter()
  const supabase = createClient()

  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [feeds, setFeeds] = useState<Record<string, Feed>>({})
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { data: schoolRows } = await supabase
      .from('schools')
      .select('id, name, short_name, level, primary_color')
      .eq('type', 'school')
      .eq('active', true)
      .order('name')

    const { data: feedRows } = await supabase
      .from('calendar_school_feeds')
      .select('id, school_id, ics_url, last_synced_at, last_sync_ok, last_sync_error')

    setSchools(schoolRows || [])
    const feedMap: Record<string, Feed> = {}
    const draftMap: Record<string, string> = {}
    ;(feedRows || []).forEach((f: Feed) => {
      feedMap[f.school_id] = f
      draftMap[f.school_id] = f.ics_url
    })
    setFeeds(feedMap)
    setUrlDrafts((prev: Record<string, string>) => ({ ...draftMap, ...prev }))
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login?redirect=/dashboard/calendar/feeds')
        return
      }
      const { data: teamRow } = await supabase
        .from('team')
        .select('calendar_approver')
        .eq('supabase_user_id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      if (!canManageCalendarQueue(teamRow?.calendar_approver)) {
        router.replace('/dashboard/calendar')
        return
      }
      setAllowed(true)
      await loadData()
      if (!cancelled) setReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [supabase, router, loadData])

  async function saveFeed(schoolId: string) {
    const url = (urlDrafts[schoolId] || '').trim()
    if (!url) return
    setSavingId(schoolId)
    setError(null)
    const { data, error: upsertError } = await supabase
      .from('calendar_school_feeds')
      .upsert({ school_id: schoolId, ics_url: url }, { onConflict: 'school_id' })
      .select('id, school_id, ics_url, last_synced_at, last_sync_ok, last_sync_error')
      .single()
    setSavingId(null)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    if (data) setFeeds((prev: Record<string, Feed>) => ({ ...prev, [schoolId]: data }))
  }

  async function removeFeed(schoolId: string) {
    const feed = feeds[schoolId]
    if (!feed) return
    setSavingId(schoolId)
    setError(null)
    const { error: deleteError } = await supabase
      .from('calendar_school_feeds')
      .delete()
      .eq('id', feed.id)
    setSavingId(null)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setFeeds((prev: Record<string, Feed>) => {
      const next = { ...prev }
      delete next[schoolId]
      return next
    })
    setUrlDrafts((prev: Record<string, string>) => ({ ...prev, [schoolId]: '' }))
  }

  if (!ready) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '40px 20px', color: muted, fontSize: '15px' }}>
        Loading…
      </div>
    )
  }
  if (!allowed) return null

  const filtered = schools.filter((s: School) =>
    !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Calendar feeds</h1>
      <p style={{ fontSize: '15px', color: muted, margin: '0 0 20px', lineHeight: 1.5 }}>
        Paste each school&apos;s public ICS calendar link here. Synced events land in the review queue,
        nothing shows on the district calendar until a staff member approves it there.
      </p>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <input
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder="Search schools..."
        style={{
          width: '100%', maxWidth: '360px', height: '40px', borderRadius: '10px',
          border: `0.5px solid ${border}`, background: inputBg, color: text,
          padding: '0 12px', fontSize: '14px', fontFamily: 'inherit', marginBottom: '16px',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map((school: School) => {
          const feed = feeds[school.id]
          const draft = urlDrafts[school.id] ?? ''
          const dirty = draft.trim() !== (feed?.ics_url || '')
          const saving = savingId === school.id
          return (
            <div
              key={school.id}
              style={{
                background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px',
                padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' as const,
              }}
            >
              <div style={{ minWidth: '200px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: school.primary_color || muted, flexShrink: 0 }} />
                  <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0 }}>{school.name}</p>
                </div>
                <p style={{ fontSize: '12.5px', color: muted, margin: '4px 0 0 18px' }}>
                  {feed
                    ? feed.last_sync_ok === false
                      ? <span style={{ color: '#ef4444' }}>Sync failing · {relativeTime(feed.last_synced_at)}</span>
                      : relativeTime(feed.last_synced_at)
                    : 'No feed yet'}
                </p>
              </div>

              <input
                value={draft}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUrlDrafts((prev: Record<string, string>) => ({ ...prev, [school.id]: e.target.value }))}
                placeholder="https://... .ics"
                style={{
                  flex: 1, minWidth: '260px', height: '38px', borderRadius: '9px',
                  border: `0.5px solid ${border}`, background: inputBg, color: text,
                  padding: '0 12px', fontSize: '13.5px', fontFamily: 'inherit',
                }}
              />

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => saveFeed(school.id)}
                  disabled={!dirty || saving || !draft.trim()}
                  style={{
                    fontSize: '13.5px', padding: '9px 16px', borderRadius: '9px',
                    background: dirty && draft.trim() ? '#1e6cb5' : border,
                    color: dirty && draft.trim() ? '#fff' : muted,
                    border: 'none', cursor: dirty && draft.trim() ? 'pointer' : 'default',
                    fontFamily: 'inherit', fontWeight: 500, minHeight: '38px',
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {feed && (
                  <button
                    onClick={() => removeFeed(school.id)}
                    disabled={saving}
                    style={{
                      fontSize: '13.5px', padding: '9px 14px', borderRadius: '9px',
                      background: 'transparent', color: muted, border: `0.5px solid ${border}`,
                      cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p style={{ color: muted, fontSize: '14px', padding: '20px' }}>No schools match that search.</p>
        )}
      </div>
    </div>
  )
}
