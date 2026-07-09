'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { dateRangeLifecycle, todayISO, LifecyclePill, type Lifecycle } from '@/lib/signage/lifecycle'

type ReviewKind = 'content' | 'announcement' | 'visitor'
type ReviewItem = {
  id: string
  kind: ReviewKind
  title: string
  meta: string
  raw: Record<string, unknown>
}
type ShowingItem = { id: string; label: string; lifecycle: Lifecycle; kind: string }

const BASE = '/dashboard/signage'

export default function SignageOverviewPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { activeSiteId, areas } = useSignage()
  const today = useMemo(() => todayISO(), [])

  const [loading, setLoading] = useState(true)
  const [screensOnline, setScreensOnline] = useState(0)
  const [screensTotal, setScreensTotal] = useState(0)
  const [review, setReview] = useState<ReviewItem[]>([])
  const [showing, setShowing] = useState<ShowingItem[]>([])
  const [liveAnnCount, setLiveAnnCount] = useState(0)

  const areaName = useCallback((ids: unknown) => {
    if (!Array.isArray(ids) || !ids.length) return 'All screens'
    const names = ids.map(id => areas.find(a => a.id === id)?.name).filter(Boolean)
    return names.length ? names.join(', ') : 'All screens'
  }, [areas])

  const load = useCallback(async () => {
    if (!activeSiteId) return
    setLoading(true)
    const [scr, con, ann, vis] = await Promise.all([
      supabase.from('signage_screens').select('id, ablesign_screen_id, ablesign_online').eq('site_id', activeSiteId).eq('active', true),
      supabase.from('signage_content').select('id, title, type, status, start_date, end_date, all_screens, target_area_ids, target_screen_ids, submitter_name').eq('site_id', activeSiteId),
      supabase.from('signage_announcements').select('id, title, subtitle, start_date, end_date, active, pending, submitter_name, area_id').eq('site_id', activeSiteId),
      supabase.from('signage_visitors').select('id, name, note, visit_date, active, pending, submitter_name').eq('site_id', activeSiteId),
    ])

    const loadError = scr.error || con.error || ann.error || vis.error
    if (loadError) toast('Some overview data could not be loaded', 'error')

    const screens = scr.data || []
    setScreensTotal(screens.length)
    setScreensOnline(screens.filter(x => x.ablesign_screen_id && x.ablesign_online).length)

    const content = con.data || []
    const anns = ann.data || []
    const visitors = vis.data || []

    const reviewItems: ReviewItem[] = []
    content.filter(c => c.status === 'pending').forEach(c => reviewItems.push({
      id: c.id, kind: 'content',
      title: c.title || (c.type === 'video' ? 'Submitted video' : c.type === 'html' ? 'HTML slide' : 'Submitted image'),
      meta: `${c.type === 'video' ? 'Video' : c.type === 'html' ? 'Slide' : 'Image'} · ${areaName(c.target_area_ids)}${c.submitter_name ? ` · from ${c.submitter_name}` : ''}`,
      raw: c,
    }))
    anns.filter(a => a.pending).forEach(a => reviewItems.push({
      id: a.id, kind: 'announcement', title: a.title,
      meta: `Announcement${a.submitter_name ? ` · from ${a.submitter_name}` : ''}`,
      raw: a,
    }))
    visitors.filter(v => v.pending).forEach(v => reviewItems.push({
      id: v.id, kind: 'visitor', title: v.name,
      meta: `Visitor · ${v.visit_date?.slice(0, 10)}${v.submitter_name ? ` · from ${v.submitter_name}` : ''}`,
      raw: v,
    }))
    setReview(reviewItems)

    const showingItems: ShowingItem[] = []
    content.filter(c => c.status === 'approved').forEach(c => {
      const lc = dateRangeLifecycle(c.start_date, c.end_date, today)
      if (lc === 'active' || lc === 'upcoming') {
        showingItems.push({ id: `c-${c.id}`, label: c.title || (c.type === 'video' ? 'Video' : c.type === 'html' ? 'HTML slide' : 'Image'), lifecycle: lc, kind: 'Content' })
      }
    })
    let liveAnn = 0
    anns.filter(a => !a.pending && a.active).forEach(a => {
      const lc = dateRangeLifecycle(a.start_date, a.end_date, today)
      if (lc === 'active') liveAnn += 1
      if (lc === 'active' || lc === 'upcoming') {
        showingItems.push({ id: `a-${a.id}`, label: a.title, lifecycle: lc, kind: 'Announcement' })
      }
    })
    setLiveAnnCount(liveAnn)

    showingItems.sort((a, b) => (a.lifecycle === 'active' ? 0 : 1) - (b.lifecycle === 'active' ? 0 : 1))
    setShowing(showingItems)
    setLoading(false)
  }, [supabase, activeSiteId, today, areaName])

  useEffect(() => { void load() }, [load])

  const approve = async (item: ReviewItem) => {
    let ok = false
    if (item.kind === 'content') {
      const c = item.raw
      const hasTarget =
        Boolean(c.all_screens) ||
        (Array.isArray(c.target_area_ids) && c.target_area_ids.length > 0) ||
        (Array.isArray(c.target_screen_ids) && c.target_screen_ids.length > 0)
      // Never silently widen an untargeted submission to every screen — send the
      // reviewer to the content page to pick a target. The API enforces this too.
      if (!hasTarget) {
        toast('Set a target on the content page before approving this item.', 'error')
        return
      }
      const res = await fetch(`/api/signage/content/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', all_screens: Boolean(c.all_screens), target_area_ids: c.target_area_ids ?? [], target_screen_ids: c.target_screen_ids ?? [], start_date: c.start_date, end_date: c.end_date }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast(typeof data.error === 'string' ? data.error : 'Approve failed', 'error')
        return
      }
      ok = true
    } else if (item.kind === 'announcement') {
      const res = await fetch('/api/signage/announcements', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, pending: false, active: true }) })
      ok = res.ok
    } else {
      const v = item.raw
      const res = await fetch('/api/signage/visitors', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, name: v.name, note: v.note, visit_date: v.visit_date, active: true, pending: false }) })
      ok = res.ok
    }
    if (!ok) { toast('Approve failed', 'error'); return }
    toast('Approved — screens update within a few minutes', 'success')
    void load()
  }

  const reject = async (item: ReviewItem) => {
    let ok = false
    if (item.kind === 'content') {
      const res = await fetch(`/api/signage/content/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', reject_reason: 'Rejected from overview' }) })
      ok = res.ok
    } else {
      const path = item.kind === 'announcement' ? '/api/signage/announcements' : '/api/signage/visitors'
      const res = await fetch(`${path}?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      ok = res.ok
    }
    if (!ok) { toast('Reject failed', 'error'); return }
    toast('Removed', 'success')
    void load()
  }

  const metric = (label: string, value: string, subtitle: string, tone?: 'ok' | 'warn') => (
    <div style={{ ...s.card, padding: '16px 18px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: s.muted, margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-1px', margin: 0, color: tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#d97706' : s.text }}>{value}</p>
      <p style={{ fontSize: 12, color: s.muted, margin: '6px 0 0' }}>{subtitle}</p>
    </div>
  )

  const thumb = (kind: string) => {
    const isAnn = kind.toLowerCase().includes('announc')
    return (
      <span style={{ width: 38, height: 38, borderRadius: 9, background: s.infoBg, color: s.info, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isAnn ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l16-5v12L3 13z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        )}
      </span>
    )
  }

  const showingNow = showing.filter(x => x.lifecycle === 'active').length

  return (
    <SignagePageShell title="Overview" subtitle="Everything at a glance">
      {loading ? (
        <div style={{ color: s.muted, padding: 24, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            {metric('Screens online', `${screensOnline}/${screensTotal}`, screensTotal > 0 && screensOnline === screensTotal ? 'All displays reporting' : `${Math.max(screensTotal - screensOnline, 0)} offline`, screensTotal > 0 && screensOnline === screensTotal ? 'ok' : undefined)}
            {metric('Showing now', String(showingNow), 'Items in rotation')}
            {metric('Pending review', String(review.length), review.length ? 'Waiting on you' : 'Nothing waiting', review.length ? 'warn' : undefined)}
            {metric('Live announcements', String(liveAnnCount), 'Currently scheduled')}
          </div>

          {review.length > 0 && (
            <div style={{ ...s.card, marginBottom: 20, borderLeft: '3px solid #d97706' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: s.text }}>Needs your review ({review.length})</span>
              {review.map(item => (
                <div key={`${item.kind}-${item.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: `1px solid ${s.border}`, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {thumb(item.kind)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: s.text }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{item.meta}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => void approve(item)} style={s.btnPrimary}>Approve</button>
                    <button type="button" onClick={() => void reject(item)} style={{ ...s.btn, color: '#ef4444', borderColor: 'transparent', background: 'transparent' }}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="sig-ov-grid">
            <div style={{ ...s.card }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: s.text }}>Showing now &amp; coming up</span>
                <Link href={`${BASE}/live`} prefetch style={{ fontSize: 13, fontWeight: 500, color: s.info, textDecoration: 'none' }}>Open live view →</Link>
              </div>
              {showing.length === 0 ? (
                <p style={{ fontSize: 13, color: s.muted, margin: '8px 0 0' }}>Nothing scheduled right now.</p>
              ) : showing.slice(0, 8).map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: `1px solid ${s.border}` }}>
                  {thumb(item.kind)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: s.text }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{item.kind} · {item.lifecycle === 'active' ? 'Showing now' : 'Scheduled'}</div>
                  </div>
                  <LifecyclePill lifecycle={item.lifecycle} />
                </div>
              ))}
            </div>

            <div style={{ ...s.card }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: s.text, marginBottom: 12 }}>Quick actions</div>
              <Link href={`${BASE}/content`} prefetch style={{ ...s.btnPrimary, textDecoration: 'none', display: 'block', textAlign: 'center', marginBottom: 8 }}>+ Add content</Link>
              <Link href={`${BASE}/announcements`} prefetch style={{ ...s.btn, textDecoration: 'none', display: 'block', textAlign: 'center', marginBottom: 8 }}>New announcement</Link>
              <Link href={`${BASE}/visitors`} prefetch style={{ ...s.btn, textDecoration: 'none', display: 'block', textAlign: 'center' }}>Add visitor</Link>
              {review.length === 0 && (
                <div style={{ marginTop: 12, background: 'var(--bg-warning, #fff7ed)', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
                  Needs your review: nothing waiting — you&apos;re all caught up.
                </div>
              )}
            </div>
          </div>

          <style>{`@media (max-width: 760px) { .sig-ov-grid { grid-template-columns: 1fr !important; } }`}</style>
        </>
      )}
    </SignagePageShell>
  )
}
