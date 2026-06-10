'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles, formatSignageDate } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { dateRangeLifecycle, singleDateLifecycle, todayISO, LifecyclePill, type Lifecycle } from '@/lib/signage/lifecycle'

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
      const allScreens = !c.all_screens && (!Array.isArray(c.target_area_ids) || c.target_area_ids.length === 0) && (!Array.isArray(c.target_screen_ids) || c.target_screen_ids.length === 0)
        ? true : Boolean(c.all_screens)
      const res = await fetch(`/api/signage/content/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', all_screens: allScreens, target_area_ids: c.target_area_ids ?? [], target_screen_ids: c.target_screen_ids ?? [], start_date: c.start_date, end_date: c.end_date }),
      })
      ok = res.ok
    } else if (item.kind === 'announcement') {
      const res = await fetch('/api/signage/announcements', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, pending: false, active: true }) })
      ok = res.ok
    } else {
      const v = item.raw
      const res = await fetch('/api/signage/visitors', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, name: v.name, note: v.note, visit_date: v.visit_date, active: true, pending: false }) })
      ok = res.ok
    }
    if (!ok) { toast('Approve failed', 'error'); return }
    toast('Approved', 'success')
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

  const metric = (label: string, value: string, accent?: string) => (
    <div style={{ background: s.dark ? 'rgba(255,255,255,0.03)' : '#f4f6fa', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 12, color: s.muted, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 23, fontWeight: 600, margin: 0, color: accent || s.text }}>{value}</p>
    </div>
  )

  return (
    <SignagePageShell title="Overview" subtitle="Everything at a glance">
      {loading ? (
        <div style={{ color: s.muted, padding: 24, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {metric('Screens online', `${screensOnline}/${screensTotal}`)}
            {metric('Showing now', String(showing.filter(x => x.lifecycle === 'active').length))}
            {metric('Pending review', String(review.length), review.length ? '#d97706' : undefined)}
            {metric('Live announcements', String(liveAnnCount))}
          </div>

          <div style={{ ...s.card, marginBottom: 14, borderLeft: review.length ? '3px solid #d97706' : `1px solid ${s.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: review.length ? 6 : 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: s.text }}>Needs your review{review.length ? ` (${review.length})` : ''}</span>
            </div>
            {review.length === 0 ? (
              <p style={{ fontSize: 13, color: s.muted, margin: 0 }}>Nothing waiting — you&apos;re all caught up.</p>
            ) : review.map(item => (
              <div key={`${item.kind}-${item.id}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: `1px solid ${s.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: s.text }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{item.meta}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" onClick={() => void approve(item)} style={s.btnPrimary}>Approve</button>
                  <button type="button" onClick={() => void reject(item)} style={{ ...s.btn, color: '#ef4444', borderColor: 'transparent', background: 'transparent' }}>Reject</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...s.card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: s.text }}>Showing now &amp; coming up</span>
              <Link href={`${BASE}/live`} prefetch style={{ ...s.btn, textDecoration: 'none', fontSize: 11 }}>Open live view</Link>
            </div>
            {showing.length === 0 ? (
              <p style={{ fontSize: 13, color: s.muted, margin: '8px 0 0' }}>Nothing scheduled right now.</p>
            ) : showing.slice(0, 8).map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: `1px solid ${s.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: s.text }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: s.muted, marginLeft: 8 }}>{item.kind}</span>
                </div>
                <LifecyclePill lifecycle={item.lifecycle} />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`${BASE}/content`} prefetch style={{ ...s.btnPrimary, textDecoration: 'none' }}>+ Add content</Link>
            <Link href={`${BASE}/announcements`} prefetch style={{ ...s.btn, textDecoration: 'none' }}>New announcement</Link>
            <Link href={`${BASE}/visitors`} prefetch style={{ ...s.btn, textDecoration: 'none' }}>Add visitor</Link>
          </div>
        </>
      )}
    </SignagePageShell>
  )
}
