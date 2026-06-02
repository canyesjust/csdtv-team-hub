'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
import { sanitizeEmailSubject } from '@/lib/escape-html'

interface Video {
  id: string; title: string; description: string | null; video_type: string; status: string
  production_id: string | null; school_department: string | null; school_year: string | null
  visibility: string; date_filmed: string | null; date_published: string | null
  thumbnail_url: string | null; created_by: string | null; created_at: string; updated_at: string
  youtube_url: string | null; youtube_id: string | null; youtube_views: number | null
  youtube_likes: number | null; youtube_duration: string | null; youtube_thumbnail: string | null
  needs_review: boolean; youtube_tags: string[] | null
  video_tags?: { tag: string }[]
  productions?: { title: string; production_number: number } | null
}
interface TeamMember { id: string; name: string; role: string }
interface Production { id: string; title: string; production_number: number; start_datetime?: string; organizer_name?: string }
interface School { code: string; name: string }

const VIDEO_TYPES = ['Recap', 'Promo', 'Event Coverage', 'Interview', 'B-Roll', 'Tutorial', 'Announcement', 'Highlight Reel', 'Other']
const STATUSES = ['Filming', 'Editing', 'Review', 'Published', 'Archived', 'Hidden']
const VISIBILITIES = ['Public', 'Internal', 'Unlisted']

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Filming': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  'Editing': { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  'Review': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  'Published': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  'Archived': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  'Hidden': { bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
}

const VideosHeavyPanels = dynamic(() => import('./VideosHeavyPanels'), { ssr: false })

const TYPE_COLORS: Record<string, string> = {
  'Recap': '#3b82f6', 'Promo': '#f59e0b', 'Event Coverage': '#22c55e', 'Interview': '#a855f7',
  'B-Roll': '#64748b', 'Tutorial': '#06b6d4', 'Announcement': '#ef4444', 'Highlight Reel': '#f97316', 'Other': '#94a3b8',
}

export default function VideosPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const [videos, setVideos] = useState<Video[]>([])
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [productions, setProductions] = useState<Production[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterReview, setFilterReview] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkCSV, setBulkCSV] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newVideo, setNewVideo] = useState({ title: '', description: '', video_type: 'Other', status: 'Filming', visibility: 'Internal', production_id: '', school_year: '', date_filmed: '', tags: '' })
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<{ youtube_id: string; title: string; views: number; likes: number; duration: string; thumbnail: string; published_at: string; local_date: string; existing: boolean; matchedProd: Production | null }[] | null>(null)
  const [syncImporting, setSyncImporting] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<{ videoId: string; videoTitle: string; video_type: string; school: string | null; production_number: number | null; prodTitle: string | null; confidence: string; approved: boolean }[] | null>(null)
  const [linkingVideoId, setLinkingVideoId] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [reviewQueue, setReviewQueue] = useState<Video[] | null>(null)
  const [reviewIdx, setReviewIdx] = useState(0)
  const [reviewSearchQuery, setReviewSearchQuery] = useState('')
  const [missingFromYoutube, setMissingFromYoutube] = useState<Video[]>([])

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [videosRes, userRes, prodsRes, schoolsRes] = await Promise.all([
      supabase.from('videos').select('*, video_tags(tag), productions(title, production_number)').order('date_published', { ascending: false, nullsFirst: false }),
      resolveEffectiveTeamRow<TeamMember>(supabase, 'id, name, role'),
      supabase.from('productions').select('id, title, production_number, start_datetime, organizer_name').order('production_number', { ascending: false }).limit(500),
      supabase.from('schools').select('code, name'),
    ])
    setVideos(videosRes.data || [])
    setCurrentUser(userRes)
    setProductions(prodsRes.data || [])
    setSchools(schoolsRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  // Keyboard shortcuts for the review queue
  useEffect(() => {
    if (!reviewQueue) return
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const video = reviewQueue[reviewIdx]
      if (!video) return
      const candidates = findCandidates(video)
      if (e.key === '1' && candidates[0]) { linkReviewVideo(candidates[0].prod.id, `#${candidates[0].prod.production_number} ${candidates[0].prod.title}`) }
      else if (e.key === '2' && candidates[1]) { linkReviewVideo(candidates[1].prod.id, `#${candidates[1].prod.production_number} ${candidates[1].prod.title}`) }
      else if (e.key === '3' && candidates[2]) { linkReviewVideo(candidates[2].prod.id, `#${candidates[2].prod.production_number} ${candidates[2].prod.title}`) }
      else if (e.key === 's' || e.key === 'S') { skipReviewVideo() }
      else if (e.key === 'Escape') { closeReviewQueue() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewQueue, reviewIdx, productions])

  const syncChannel = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/youtube/channel', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast((data as { error?: string }).error || 'Failed to fetch channel videos', 'error')
        setSyncing(false)
        return
      }
      if (!Array.isArray((data as { videos?: unknown }).videos)) {
        toast('Channel sync returned an unexpected response', 'error')
        setSyncing(false)
        return
      }
      // Check which videos already exist in our DB
      const existingIds = new Set(videos.map((v: any) => v.youtube_id).filter(Boolean))

      // Sync no longer auto-matches videos to productions.
      // Use the "Review unlinked" queue instead — it suggests candidates
      // with date filtering and title-similarity scoring you can confirm.
      const results = data.videos.map((v: any) => ({
        ...v,
        existing: existingIds.has(v.youtube_id),
        matchedProd: null,
      }))

      // Detect videos in our DB with a youtube_id that are no longer on the channel.
      // Could be deleted, made private, or unlisted — user reviews before removing.
      const ytIdSet = new Set<string>(data.videos.map((v: any) => v.youtube_id).filter(Boolean))
      const missing = videos.filter(v => v.youtube_id && !ytIdSet.has(v.youtube_id))
      setMissingFromYoutube(missing)

      // Auto-fix dates on existing videos (UTC→Mountain)
      let dateFixed = 0
      for (const v of results.filter((r: any) => r.existing)) {
        const correctDate = v.local_date
        if (!correctDate) continue
        const existingVideo = videos.find((ev: any) => ev.youtube_id === v.youtube_id)
        if (existingVideo && existingVideo.date_published !== correctDate) {
          await supabase.from('videos').update({ date_published: correctDate, youtube_views: v.views, youtube_likes: v.likes }).eq('youtube_id', v.youtube_id)
          dateFixed++
        }
      }

      setSyncResults(results)
      const newCount = results.filter((r: any) => !r.existing).length
      const missingNote = missing.length > 0 ? ` ${missing.length} no longer on YouTube.` : ''
      toast(`Found ${data.total} videos. ${newCount} new.${missingNote}${dateFixed > 0 ? ` Fixed ${dateFixed} dates.` : ''}`, 'info')
      if (dateFixed > 0) await loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Channel sync failed', 'error')
    }
    setSyncing(false)
  }

  const importSyncResults = async () => {
    if (!syncResults || !currentUser) return
    setSyncImporting(true)
    const newVids = syncResults.filter(r => !r.existing)
    let imported = 0
    for (let i = 0; i < newVids.length; i += 20) {
      const batch = newVids.slice(i, i + 20).map(v => ({
        title: v.title, video_type: 'Other', status: 'Published', visibility: 'Public',
        date_published: v.local_date || (v.published_at ? new Date(v.published_at).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : null),
        description: (v as any).description?.slice(0, 500) || null,
        production_id: v.matchedProd?.id || null,
        youtube_url: `https://www.youtube.com/watch?v=${v.youtube_id}`, youtube_id: v.youtube_id,
        youtube_views: v.views, youtube_likes: v.likes, youtube_duration: v.duration,
        youtube_thumbnail: v.thumbnail, youtube_synced_at: new Date().toISOString(),
        youtube_tags: (v as any).tags || null, needs_review: true, created_by: currentUser.id,
      }))
      const { error } = await supabase.from('videos').insert(batch)
      if (!error) imported += batch.length
    }
    toast(`Imported ${imported} videos. Click "🔍 Review unlinked" to link them to productions.`, 'success')
    setSyncResults(null)
    setSyncImporting(false)
    await loadData()
  }

  const categorizeVideos = async () => {
    setCategorizing(true)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { setCategorizing(false); return }
      const { data: reviewVids } = await supabase.from('videos').select('id, title, description, youtube_tags, production_id, date_published').eq('needs_review', true).limit(50)
      if (!reviewVids || reviewVids.length === 0) { toast('No videos need categorization', 'info'); setCategorizing(false); return }

      // Load productions with dates for date matching
      const { data: prodsWithDates } = await supabase.from('productions').select('id, title, production_number, start_datetime').order('production_number', { ascending: false }).limit(500)

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/categorize-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ videos: reviewVids, schools, productions: prodsWithDates || [] }),
      })
      if (!res.ok) { toast('AI categorization failed', 'error'); setCategorizing(false); return }
      const { results } = await res.json()

      // Build suggestions for review — DO NOT auto-apply
      const suggestions = (results || []).map((r: any) => {
        const video = reviewVids[r.index]
        if (!video) return null
        const matchedProd = r.production_number ? (prodsWithDates || []).find((p: any) => p.production_number === r.production_number) : null
        return {
          videoId: video.id,
          videoTitle: video.title,
          video_type: r.video_type || 'Other',
          school: r.school || null,
          production_number: r.production_number || null,
          prodTitle: matchedProd ? `#${matchedProd.production_number} ${matchedProd.title}` : null,
          confidence: r.confidence || 'low',
          approved: false,
        }
      }).filter(Boolean)

      setAiSuggestions(suggestions)
      toast(`AI generated ${suggestions.length} suggestions. Review and approve below.`, 'info')
    } catch { toast('Categorization failed', 'error') }
    setCategorizing(false)
  }

  const applyApprovedSuggestions = async () => {
    if (!aiSuggestions) return
    const approved = aiSuggestions.filter(s => s.approved)
    if (approved.length === 0) { toast('No suggestions approved', 'info'); return }
    let applied = 0
    for (const s of approved) {
      const updates: Record<string, any> = { needs_review: false }
      if (s.video_type && s.video_type !== 'Other') updates.video_type = s.video_type
      if (s.school) {
        const schoolMatch = schools.find(sc => sc.name.toLowerCase().includes(s.school!.toLowerCase()) || s.school!.toLowerCase().includes(sc.name.toLowerCase()))
        if (schoolMatch) updates.school_department = schoolMatch.code
      }
      if (s.production_number) {
        const prodMatch = productions.find(p => p.production_number === s.production_number)
        if (prodMatch) updates.production_id = prodMatch.id
      }
      await supabase.from('videos').update(updates).eq('id', s.videoId)
      applied++
    }
    toast(`Applied ${applied} categorizations`, 'success')
    setAiSuggestions(null)
    await loadData()
  }

  // ─── Review unlinked queue ────────────────────────────────────────────
  // Replaces the old auto-matcher. Filters productions by ±14-day date window,
  // ranks by title-token Jaccard similarity + date proximity, surfaces top 3
  // with a Match/Skip flow. Keyboard: 1/2/3 = match, s = skip, esc = close.
  const REVIEW_STOP_WORDS = new Set(['the','a','an','of','and','or','with','for','in','at','on','to','from','csd','csdtv','video','recording'])
  const reviewTokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !REVIEW_STOP_WORDS.has(w))
  const reviewTitleSim = (a: string, b: string): number => {
    const ta = new Set(reviewTokenize(a))
    const tb = new Set(reviewTokenize(b))
    if (ta.size === 0 || tb.size === 0) return 0
    let inter = 0
    for (const t of ta) if (tb.has(t)) inter++
    return inter / Math.max(ta.size, tb.size)
  }
  // Convert any date input ("YYYY-MM-DD" or full ISO timestamp) to local-midnight ms.
  // Avoids the timezone drift that caused "May 5 vs May 5" to score as 1 day apart:
  // the video's date_published is date-only (interpreted as local midnight) but the
  // production's start_datetime is a UTC instant, so subtracting them mixes timezones.
  const reviewLocalMidnightMs = (input: string): number => {
    const d = new Date(input.length === 10 ? input + 'T00:00:00' : input)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const reviewDateProx = (videoDate: string | null, prodDate: string | null | undefined): number => {
    if (!videoDate || !prodDate) return 0.5
    const days = Math.abs(reviewLocalMidnightMs(videoDate) - reviewLocalMidnightMs(prodDate)) / 86400000
    if (days > 14) return 0
    return 1 - (days / 14)
  }
  const findCandidates = (video: Video) => {
    const scored = productions.map(p => {
      const ds = reviewDateProx(video.date_published, p.start_datetime)
      // If both have dates and they're outside the 14-day window, exclude
      if (ds === 0 && video.date_published && p.start_datetime) return null
      const ts = reviewTitleSim(video.title, p.title)
      const score = 0.7 * ts + 0.3 * ds
      const days = video.date_published && p.start_datetime
        ? Math.round(Math.abs(reviewLocalMidnightMs(video.date_published) - reviewLocalMidnightMs(p.start_datetime)) / 86400000)
        : null
      return { prod: p, score, titlePct: Math.round(ts * 100), daysApart: days }
    }).filter((c): c is { prod: Production; score: number; titlePct: number; daysApart: number | null } => c !== null && c.score >= 0.20)
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 3)
  }

  const openReviewQueue = () => {
    const unlinked = videos.filter(v => !v.production_id)
    if (unlinked.length === 0) { toast('No unlinked videos to review', 'info'); return }
    setReviewQueue(unlinked)
    setReviewIdx(0)
    setReviewSearchQuery('')
  }

  const closeReviewQueue = () => {
    setReviewQueue(null)
    setReviewIdx(0)
    setReviewSearchQuery('')
  }

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        // RFC4180 escape: "" inside a quoted value.
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    out.push(current.trim())
    return out
  }

  const linkReviewVideo = async (productionId: string, productionLabel: string) => {
    if (!reviewQueue) return
    const video = reviewQueue[reviewIdx]
    if (!video) return
    const { error } = await supabase.from('videos').update({ production_id: productionId, needs_review: false }).eq('id', video.id)
    if (error) { toast('Could not link video', 'error'); return }
    const prod = productions.find(p => p.id === productionId)
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, production_id: productionId, needs_review: false, productions: prod ? { title: prod.title, production_number: prod.production_number } : null } : v))
    toast(`Linked to ${productionLabel}`, 'success')
    setReviewSearchQuery('')
    if (reviewIdx + 1 >= reviewQueue.length) {
      closeReviewQueue()
      toast('All caught up!', 'success')
    } else {
      setReviewIdx(reviewIdx + 1)
    }
  }

  const skipReviewVideo = () => {
    if (!reviewQueue) return
    setReviewSearchQuery('')
    if (reviewIdx + 1 >= reviewQueue.length) {
      closeReviewQueue()
      toast('All caught up!', 'success')
    } else {
      setReviewIdx(reviewIdx + 1)
    }
  }

  const removeMissingVideo = async (videoId: string) => {
    if (!confirm('Remove this video permanently? It will be deleted from the Hub.')) return
    const { error } = await supabase.from('videos').delete().eq('id', videoId)
    if (error) { toast('Could not remove video', 'error'); return }
    setVideos(prev => prev.filter(v => v.id !== videoId))
    setMissingFromYoutube(prev => prev.filter(v => v.id !== videoId))
    toast('Removed', 'success')
  }

  const removeAllMissing = async () => {
    if (missingFromYoutube.length === 0) return
    if (!confirm(`Remove all ${missingFromYoutube.length} videos that are no longer on YouTube?`)) return
    const ids = missingFromYoutube.map(v => v.id)
    const { error } = await supabase.from('videos').delete().in('id', ids)
    if (error) { toast('Could not remove all missing videos', 'error'); return }
    setVideos(prev => prev.filter(v => !ids.includes(v.id)))
    setMissingFromYoutube([])
    toast(`Removed ${ids.length} videos`, 'success')
  }

  const createVideo = async () => {
    if (!newVideo.title || !currentUser) return
    setSaving(true)
    const { data, error } = await supabase.from('videos').insert({
      title: newVideo.title,
      description: newVideo.description || null,
      video_type: newVideo.video_type,
      status: newVideo.status,
      visibility: newVideo.visibility,
      production_id: newVideo.production_id || null,
      school_year: newVideo.school_year || null,
      date_filmed: newVideo.date_filmed || null,
      created_by: currentUser.id,
    }).select('*, productions(title, production_number)').single()
    if (error) { toast('Error: ' + error.message); setSaving(false); return }
    // Add tags
    if (data && newVideo.tags.trim()) {
      const tags = newVideo.tags.split(',').map(t => t.trim()).filter(Boolean)
      if (tags.length > 0) {
        const tagRows = tags.map(tag => ({ video_id: data.id, tag }))
        await supabase.from('video_tags').insert(tagRows)
        data.video_tags = tagRows
      }
    }
    if (data) setVideos(prev => [data, ...prev])
    setNewVideo({ title: '', description: '', video_type: 'Other', status: 'Filming', visibility: 'Internal', production_id: '', school_year: '', date_filmed: '', tags: '' })
    setShowNew(false)
    setSaving(false)
  }

  const needsReviewCount = videos.filter(v => v.needs_review).length

  const filtered = videos.filter(v => {
    const matchSearch = search === '' ||
      v.title.toLowerCase().includes(search.toLowerCase()) ||
      v.description?.toLowerCase().includes(search.toLowerCase()) ||
      (v.video_tags || []).some(t => t.tag.toLowerCase().includes(search.toLowerCase())) ||
      (v.youtube_tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
    const matchType = filterType === 'all' || v.video_type === filterType
    const matchStatus = filterStatus === 'all' ? v.status !== 'Hidden' : v.status === filterStatus
    const matchReview = !filterReview || v.needs_review
    return matchSearch && matchType && matchStatus && matchReview
  })

  const inputStyle: React.CSSProperties = { width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: 0 }}>Video library</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>{videos.filter(v => v.status !== 'Hidden').length} video{videos.filter(v => v.status !== 'Hidden').length !== 1 ? 's' : ''} tracked{videos.some(v => v.status === 'Hidden') ? ` · ${videos.filter(v => v.status === 'Hidden').length} hidden` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={syncChannel} disabled={syncing} style={{ background: '#ef4444', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: '#fff', cursor: syncing ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px', opacity: syncing ? 0.7 : 1 }}>
            {syncing ? '⏳ Syncing...' : '▶ Sync YouTube'}
          </button>
          <button onClick={openReviewQueue} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
            🔍 Review unlinked ({videos.filter(v => !v.production_id).length})
          </button>
          <button onClick={() => { setShowBulkImport(!showBulkImport); setShowNew(false) }} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
            Bulk import
          </button>
          <button onClick={() => { setShowNew(!showNew); setShowBulkImport(false) }} style={{ background: '#1e6cb5', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            + New video
          </button>
        </div>
      </div>

      {/* Needs Review Banner */}
      {needsReviewCount > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f59e0b' }}>⚠ {needsReviewCount} video{needsReviewCount !== 1 ? 's' : ''} need review</span>
            <span style={{ fontSize: '13px', color: muted, marginLeft: '8px' }}>Missing type, school, or production link</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setFilterReview(!filterReview)} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: filterReview ? '#f59e0b' : cardBg, color: filterReview ? '#fff' : muted, border: `0.5px solid ${filterReview ? '#f59e0b' : border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              {filterReview ? 'Show all' : 'Show needs review'}
            </button>
            <button onClick={categorizeVideos} disabled={categorizing} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: categorizing ? 0.7 : 1 }}>
              {categorizing ? '🤖 Categorizing...' : '🤖 AI Categorize'}
            </button>
          </div>
        </div>
      )}

      {(aiSuggestions || syncResults) && (
        <VideosHeavyPanels
          theme={{ text, muted, border, cardBg, dark }}
          aiSuggestions={aiSuggestions}
          onToggleSuggestion={i => setAiSuggestions(prev => prev ? prev.map((x, j) => j === i ? { ...x, approved: !x.approved } : x) : null)}
          onSelectAllSuggestions={() => setAiSuggestions(prev => prev ? prev.map(s => ({ ...s, approved: true })) : null)}
          onDismissSuggestions={() => setAiSuggestions(null)}
          onApplySuggestions={applyApprovedSuggestions}
          syncResults={syncResults}
          syncImporting={syncImporting}
          missingFromYoutube={missingFromYoutube}
          onCancelSync={() => { setSyncResults(null); setMissingFromYoutube([]) }}
          onImportSync={importSyncResults}
          onRemoveAllMissing={removeAllMissing}
          onRemoveMissing={removeMissingVideo}
        />
      )}

      {/* Review unlinked queue */}
      {reviewQueue && reviewQueue.length > 0 && reviewQueue[reviewIdx] && (() => {
        const video = reviewQueue[reviewIdx]
        const candidates = findCandidates(video)
        const filteredOther = reviewSearchQuery.length >= 2 ? productions.filter(p => {
          const q = reviewSearchQuery.toLowerCase()
          return p.title.toLowerCase().includes(q) || (p.organizer_name || '').toLowerCase().includes(q) || String(p.production_number).includes(q)
        }).slice(0, 8) : []
        return (
          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px' }}>🔍 Review unlinked videos</h3>
                <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{reviewIdx + 1} of {reviewQueue.length} · keyboard: <strong>1</strong>/<strong>2</strong>/<strong>3</strong> = match · <strong>s</strong> = skip · <strong>esc</strong> = close</p>
              </div>
              <button onClick={closeReviewQueue} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px 8px' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: '14px', padding: '12px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: '10px', marginBottom: '14px' }}>
              {video.youtube_thumbnail && <img src={video.youtube_thumbnail} alt="" style={{ width: '120px', height: '68px', objectFit: 'cover' as const, borderRadius: '6px', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px' }}>{video.title}</p>
                <p style={{ fontSize: '12px', color: muted, margin: 0 }}>
                  {video.date_published ? new Date(video.date_published + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                  {video.youtube_views !== null ? ` · ${video.youtube_views.toLocaleString()} views` : ''}
                  {video.youtube_duration ? ` · ${video.youtube_duration}` : ''}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 8px' }}>
                {candidates.length > 0 ? 'Suggested matches' : 'No good matches found'}
              </p>
              {candidates.length === 0 ? (
                <p style={{ fontSize: '13px', color: muted, margin: 0, padding: '10px 12px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: '8px' }}>
                  No production within 14 days has a similar title. Search for one below or skip this video.
                </p>
              ) : candidates.map((c, i) => (
                <div key={c.prod.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '6px', border: `0.5px solid ${border}` }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: dark ? 'rgba(91,163,224,0.15)' : '#dbeafe', color: '#5ba3e0', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: '0 0 2px' }}>#{c.prod.production_number} {c.prod.title}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: 0 }}>
                      Title {c.titlePct}% match
                      {c.daysApart !== null ? ` · ${c.daysApart} day${c.daysApart !== 1 ? 's' : ''} apart` : ''}
                      {c.prod.start_datetime ? ` · ${new Date(c.prod.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  </div>
                  <button onClick={() => linkReviewVideo(c.prod.id, `#${c.prod.production_number} ${c.prod.title}`)} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}>Match</button>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '14px', position: 'relative' as const }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }}>Search other productions</p>
              <input value={reviewSearchQuery} onChange={e => setReviewSearchQuery(e.target.value)} placeholder="Type a title, number, or organizer..." style={inputStyle} />
              {filteredOther.length > 0 && (
                <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, maxHeight: '240px', overflowY: 'auto' as const, background: dark ? '#0d1526' : '#fff', border: `1px solid ${border}`, borderRadius: '8px', zIndex: 20, marginTop: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                  {filteredOther.map(p => (
                    <div key={p.id} onClick={() => linkReviewVideo(p.id, `#${p.production_number} ${p.title}`)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: `0.5px solid ${border}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                    >
                      <span style={{ fontWeight: 500, color: text }}>#{p.production_number} {p.title}</span>
                      <span style={{ display: 'block', fontSize: '11px', color: muted }}>{p.start_datetime ? new Date(p.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}{p.organizer_name ? ` · ${p.organizer_name}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: `0.5px solid ${border}` }}>
              <button onClick={skipReviewVideo} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Skip (s)</button>
              <span style={{ fontSize: '12px', color: muted }}>{reviewQueue.length - reviewIdx - 1} more after this</span>
            </div>
          </div>
        )
      })()}

      {/* Bulk import panel */}
      {showBulkImport && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 8px' }}>Bulk import videos</h3>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>Paste CSV data with columns: Title, Type, Status, Date Published (YYYY-MM-DD), Description. One video per line.</p>
          <textarea value={bulkCSV} onChange={e => setBulkCSV(e.target.value)} placeholder={'Title, Type, Status, Date Published, Description\nSpring Concert 2025, Video, Published, 2025-05-15, Annual spring concert recording\nBoard Meeting March, Livestream, Published, 2025-03-18, Monthly board meeting'} style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' as const, fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6, marginBottom: '12px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={async () => {
              if (!bulkCSV.trim()) return
              setBulkImporting(true)
              const lines = bulkCSV.trim().split('\n').filter(l => l.trim())
              // Skip header if it looks like one
              const start = lines[0]?.toLowerCase().includes('title') ? 1 : 0
              const inserts = []
              for (let i = start; i < lines.length; i++) {
                const parts = parseCsvLine(lines[i])
                if (parts.length < 1 || !parts[0]) continue
                inserts.push({
                  title: parts[0],
                  video_type: parts[1] || 'Other',
                  status: parts[2] || 'Published',
                  date_published: parts[3] || null,
                  description: parts.slice(4).join(',').trim() || null,
                })
              }
              if (inserts.length > 0) {
                const { data, error } = await supabase.from('videos').insert(inserts).select('*')
                if (error) { toast('Bulk import failed', 'error'); setBulkImporting(false); return }
                if (data) setVideos(prev => [...data, ...prev])
              }
              setBulkCSV('')
              setBulkImporting(false)
              setShowBulkImport(false)
            }} disabled={bulkImporting || !bulkCSV.trim()} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: bulkCSV.trim() ? '#1e6cb5' : 'var(--surface-2)', color: bulkCSV.trim() ? '#fff' : muted, border: 'none', cursor: bulkCSV.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>
              {bulkImporting ? 'Importing...' : `Import ${bulkCSV.trim() ? bulkCSV.trim().split('\n').filter(l => l.trim()).length : 0} videos`}
            </button>
            <button onClick={() => setShowBulkImport(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* New video form */}
      {showNew && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 16px' }}>New video</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Title *</label>
              <input value={newVideo.title} onChange={e => setNewVideo(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 2026 Spring Board Meeting" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={newVideo.video_type} onChange={e => setNewVideo(f => ({ ...f, video_type: e.target.value }))} style={inputStyle}>
                {VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={newVideo.status} onChange={e => setNewVideo(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Visibility</label>
              <select value={newVideo.visibility} onChange={e => setNewVideo(f => ({ ...f, visibility: e.target.value }))} style={inputStyle}>
                {VISIBILITIES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date filmed</label>
              <input type="date" value={newVideo.date_filmed} onChange={e => setNewVideo(f => ({ ...f, date_filmed: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Link to production</label>
              <select value={newVideo.production_id} onChange={e => setNewVideo(f => ({ ...f, production_id: e.target.value }))} style={inputStyle}>
                <option value="">None (standalone)</option>
                {productions.map(p => <option key={p.id} value={p.id}>#{p.production_number} {p.title}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>School year</label>
              <input value={newVideo.school_year} onChange={e => setNewVideo(f => ({ ...f, school_year: e.target.value }))} placeholder="e.g. 2025-2026" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={newVideo.description} onChange={e => setNewVideo(f => ({ ...f, description: e.target.value }))} placeholder="What is this video about?" style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input value={newVideo.tags} onChange={e => setNewVideo(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. board meeting, athletics, drone" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={createVideo} disabled={!newVideo.title || saving} style={{ padding: '10px 20px', borderRadius: '8px', background: newVideo.title ? '#1e6cb5' : 'var(--surface-2)', color: newVideo.title ? '#fff' : muted, border: 'none', cursor: newVideo.title ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>
              {saving ? 'Creating...' : 'Create video'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search videos by title, description, or tags..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: text, fontFamily: 'inherit', width: '100%' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', minHeight: '44px', cursor: 'pointer' }}>
          <option value="all">All types</option>
          {VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', minHeight: '44px', cursor: 'pointer' }}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {STATUSES.map(s => {
          const count = videos.filter(v => v.status === s).length
          if (count === 0) return null
          const st = STATUS_COLORS[s] || STATUS_COLORS['Archived']
          return <span key={s} style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '20px', background: st.bg, color: st.color, fontWeight: 500 }}>{s}: {count}</span>
        })}
      </div>

      {/* Video table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
          <p style={{ fontSize: '40px', margin: '0 0 12px' }}>🎬</p>
          <p style={{ fontSize: '16px', color: text, fontWeight: 500, margin: '0 0 6px' }}>No videos match your filters</p>
          <button onClick={() => { setSearch(''); setFilterType('all'); setFilterStatus('all'); setFilterReview(false) }} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Clear filters</button>
        </div>
      ) : (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Video</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', width: '110px' }}>Type</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', width: '160px' }}>Production</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' as const, fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', width: '70px' }}>Views</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', width: '90px' }}>Date</th>
                  <th style={{ padding: '10px 8px', width: '120px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(video => {
                  const statusDot = video.needs_review ? '#f59e0b' : video.production_id ? '#22c55e' : '#ef4444'
                  return (
                    <tr key={video.id} style={{ borderBottom: `0.5px solid ${border}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = dark ? 'rgba(255,255,255,0.02)' : '#fafbfc'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      {/* Title + thumbnail */}
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusDot, flexShrink: 0 }} title={video.needs_review ? 'Needs review' : video.production_id ? 'Linked' : 'No production'} />
                          {video.youtube_thumbnail ? (
                            <a href={video.youtube_url || `https://youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                              <img src={video.youtube_thumbnail} alt="" style={{ width: '64px', height: '36px', objectFit: 'cover' as const, borderRadius: '4px' }} />
                            </a>
                          ) : <div style={{ width: '64px', height: '36px', borderRadius: '4px', background: 'var(--surface-2)', flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/dashboard/videos/${video.id}`} style={{ fontSize: '13px', fontWeight: 500, color: text, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '280px' }}>{video.title}</Link>
                            {video.youtube_duration && <span style={{ fontSize: '11px', color: muted }}>{video.youtube_duration}</span>}
                          </div>
                        </div>
                      </td>
                      {/* Type - inline editable */}
                      <td style={{ padding: '8px' }}>
                        <select value={video.video_type} onChange={async e => { const val = e.target.value; const { error } = await supabase.from('videos').update({ video_type: val }).eq('id', video.id); if (error) { toast('Could not update type', 'error'); return }; setVideos(prev => prev.map(v => v.id === video.id ? { ...v, video_type: val } : v)) }} style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '4px', border: `0.5px solid ${border}`, background: 'transparent', color: text, fontFamily: 'inherit', cursor: 'pointer', maxWidth: '100px' }}>
                          {VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      {/* Production */}
                      <td style={{ padding: '8px' }}>
                        {video.productions ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Link href={`/dashboard/productions/${video.productions.production_number}`} style={{ fontSize: '11px', color: '#5ba3e0', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '120px', display: 'block' }}>#{video.productions.production_number} {video.productions.title}</Link>
                            <button onClick={async () => { const { error } = await supabase.from('videos').update({ production_id: null }).eq('id', video.id); if (error) { toast('Could not unlink video', 'error'); return }; setVideos(prev => prev.map(v => v.id === video.id ? { ...v, production_id: null, productions: null } : v)); toast('Unlinked', 'success') }} style={{ fontSize: '9px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
                          </div>
                        ) : linkingVideoId === video.id ? (
                          <div style={{ position: 'relative' }}>
                            <input value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search..." autoFocus onBlur={() => setTimeout(() => setLinkingVideoId(null), 200)} style={{ width: '140px', padding: '3px 6px', borderRadius: '4px', border: `0.5px solid ${border}`, fontSize: '11px', color: text, background: inputBg, fontFamily: 'inherit', outline: 'none' }} />
                            {linkSearch.length >= 2 && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, width: '280px', maxHeight: '200px', overflowY: 'auto', background: dark ? '#0d1526' : '#fff', border: `1px solid ${border}`, borderRadius: '6px', zIndex: 20, marginTop: '2px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                                {productions.filter(p => { const q = linkSearch.toLowerCase(); return p.title.toLowerCase().includes(q) || (p.organizer_name || '').toLowerCase().includes(q) || (p.start_datetime && new Date(p.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase().includes(q)) || String(p.production_number).includes(q) }).slice(0, 8).map(p => (
                                  <div key={p.id} onMouseDown={async e => {
                                    e.preventDefault()
                                    const { error } = await supabase.from('videos').update({ production_id: p.id, needs_review: false }).eq('id', video.id)
                                    if (error) { toast('Could not link video', 'error'); return }
                                    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, production_id: p.id, needs_review: false, productions: { title: p.title, production_number: p.production_number } } : v))
                                    setLinkingVideoId(null); setLinkSearch('')
                                    toast(`Linked to #${p.production_number}`, 'success')
                                  }} style={{ padding: '5px 8px', cursor: 'pointer', fontSize: '11px', borderBottom: `0.5px solid ${border}` }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                                  >
                                    <span style={{ fontWeight: 500, color: text }}>#{p.production_number} {p.title}</span>
                                    <span style={{ display: 'block', fontSize: '10px', color: muted }}>{p.start_datetime ? new Date(p.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}{p.organizer_name ? ` · ${p.organizer_name}` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button onClick={() => { setLinkingVideoId(video.id); setLinkSearch('') }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>🔗 Link</button>
                        )}
                      </td>
                      {/* Views */}
                      <td style={{ padding: '8px', textAlign: 'right' as const, fontSize: '12px', color: muted }}>
                        {video.youtube_views != null ? video.youtube_views.toLocaleString() : '—'}
                      </td>
                      {/* Date */}
                      <td style={{ padding: '8px', fontSize: '12px', color: muted }}>
                        {video.date_published ? new Date(video.date_published + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {video.needs_review && (
                            <button onClick={async () => { const { error } = await supabase.from('videos').update({ needs_review: false }).eq('id', video.id); if (error) { toast('Could not approve video', 'error'); return }; setVideos(prev => prev.map(v => v.id === video.id ? { ...v, needs_review: false } : v)); toast('Approved', 'success') }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                          )}
                          {!video.production_id && (
                            <button onClick={async () => {
                              const { data: { session } } = await supabase.auth.refreshSession()
                              if (!session) return
                              const { data: sd } = await supabase.from('app_settings').select('value').eq('key', 'admin_assistant_email').single()
                              if (!sd?.value) { toast('Admin email not configured', 'error'); return }
                              const pubDate = video.date_published ? new Date(video.date_published + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown'
                              await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ type: 'create_production_request', recipientEmail: sd.value, subject: sanitizeEmailSubject(`Please create production: ${video.title}`), body: `Create a production and mark complete:\n\nTitle: ${video.title}\nDate: ${pubDate}\nYouTube: ${video.youtube_url || ''}\n\n— CSDtv` }) })
                              toast('Email sent', 'success')
                            }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(30,108,181,0.08)', color: '#5ba3e0', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>📧</button>
                          )}
                          <button onClick={async () => { const { error } = await supabase.from('videos').update({ status: 'Hidden' }).eq('id', video.id); if (error) { toast('Could not hide video', 'error'); return }; setVideos(prev => prev.map(v => v.id === video.id ? { ...v, status: 'Hidden' } : v)); toast('Hidden', 'success') }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: dark ? 'rgba(255,255,255,0.03)' : '#f1f5f9', color: muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>👁‍🗨</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}