'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'

interface Video {
  id: string; title: string; description: string | null; video_type: string; status: string
  production_id: string | null; school_department: string | null; school_year: string | null
  visibility: string; date_filmed: string | null; date_published: string | null
  thumbnail_url: string | null; created_by: string | null; created_at: string; updated_at: string
  youtube_url: string | null; youtube_id: string | null; youtube_views: number | null
  youtube_likes: number | null; youtube_duration: string | null; youtube_thumbnail: string | null
  video_tags?: { tag: string }[]
  productions?: { title: string; production_number: number } | null
}
interface TeamMember { id: string; name: string; role: string }
interface Production { id: string; title: string; production_number: number }

const VIDEO_TYPES = ['Recap', 'Promo', 'Event Coverage', 'Interview', 'B-Roll', 'Tutorial', 'Announcement', 'Highlight Reel', 'Other']
const STATUSES = ['Filming', 'Editing', 'Review', 'Published', 'Archived']
const VISIBILITIES = ['Public', 'Internal', 'Unlisted']

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Filming': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  'Editing': { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  'Review': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  'Published': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  'Archived': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
}

const TYPE_COLORS: Record<string, string> = {
  'Recap': '#3b82f6', 'Promo': '#f59e0b', 'Event Coverage': '#22c55e', 'Interview': '#a855f7',
  'B-Roll': '#64748b', 'Tutorial': '#06b6d4', 'Announcement': '#ef4444', 'Highlight Reel': '#f97316', 'Other': '#94a3b8',
}

export default function VideosPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#8899bb' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const [videos, setVideos] = useState<Video[]>([])
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [productions, setProductions] = useState<Production[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkCSV, setBulkCSV] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newVideo, setNewVideo] = useState({ title: '', description: '', video_type: 'Other', status: 'Filming', visibility: 'Internal', production_id: '', school_year: '', date_filmed: '', tags: '' })
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<{ youtube_id: string; title: string; views: number; likes: number; duration: string; thumbnail: string; published_at: string; existing: boolean }[] | null>(null)
  const [syncImporting, setSyncImporting] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [videosRes, userRes, prodsRes] = await Promise.all([
      supabase.from('videos').select('*, video_tags(tag), productions(title, production_number)').order('updated_at', { ascending: false }),
      supabase.from('team').select('id, name, role').eq('supabase_user_id', session.user.id).single(),
      supabase.from('productions').select('id, title, production_number').order('production_number', { ascending: false }).limit(100),
    ])
    setVideos(videosRes.data || [])
    setCurrentUser(userRes.data)
    setProductions(prodsRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const syncChannel = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/youtube/channel')
      if (!res.ok) { toast('Failed to fetch channel videos', 'error'); setSyncing(false); return }
      const data = await res.json()
      // Check which videos already exist in our DB
      const existingIds = new Set(videos.map((v: any) => v.youtube_id).filter(Boolean))
      const results = data.videos.map((v: any) => ({
        ...v,
        existing: existingIds.has(v.youtube_id),
      }))
      setSyncResults(results)
      toast(`Found ${data.total} videos on channel. ${results.filter((r: any) => !r.existing).length} new.`, 'info')
    } catch { toast('Channel sync failed', 'error') }
    setSyncing(false)
  }

  const importSyncResults = async () => {
    if (!syncResults || !currentUser) return
    setSyncImporting(true)
    const newVids = syncResults.filter(r => !r.existing)
    let imported = 0
    // Batch insert in chunks of 20
    for (let i = 0; i < newVids.length; i += 20) {
      const batch = newVids.slice(i, i + 20).map(v => ({
        title: v.title,
        video_type: 'Other',
        status: 'Published',
        visibility: 'Public',
        date_published: v.published_at ? new Date(v.published_at).toISOString().split('T')[0] : null,
        description: null,
        youtube_url: `https://www.youtube.com/watch?v=${v.youtube_id}`,
        youtube_id: v.youtube_id,
        youtube_views: v.views,
        youtube_likes: v.likes,
        youtube_duration: v.duration,
        youtube_thumbnail: v.thumbnail,
        youtube_synced_at: new Date().toISOString(),
        created_by: currentUser.id,
      }))
      const { error } = await supabase.from('videos').insert(batch)
      if (!error) imported += batch.length
    }
    toast(`Imported ${imported} videos from YouTube`, 'success')
    setSyncResults(null)
    setSyncImporting(false)
    loadData()
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

  const filtered = videos.filter(v => {
    const matchSearch = search === '' ||
      v.title.toLowerCase().includes(search.toLowerCase()) ||
      v.description?.toLowerCase().includes(search.toLowerCase()) ||
      (v.video_tags || []).some(t => t.tag.toLowerCase().includes(search.toLowerCase()))
    const matchType = filterType === 'all' || v.video_type === filterType
    const matchStatus = filterStatus === 'all' || v.status === filterStatus
    return matchSearch && matchType && matchStatus
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
          <p style={{ fontSize: '14px', color: muted, margin: '4px 0 0' }}>{videos.length} video{videos.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={syncChannel} disabled={syncing} style={{ background: '#ef4444', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: '#fff', cursor: syncing ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px', opacity: syncing ? 0.7 : 1 }}>
            {syncing ? '⏳ Syncing...' : '▶ Sync YouTube'}
          </button>
          <button onClick={() => { setShowBulkImport(!showBulkImport); setShowNew(false) }} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
            Bulk import
          </button>
          <button onClick={() => { setShowNew(!showNew); setShowBulkImport(false) }} style={{ background: '#1e6cb5', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '14px', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, minHeight: '44px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            + New video
          </button>
        </div>
      </div>

      {/* Sync Channel Results */}
      {syncResults && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px' }}>YouTube Channel Sync</h3>
              <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{syncResults.length} total · {syncResults.filter(r => !r.existing).length} new · {syncResults.filter(r => r.existing).length} already imported</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSyncResults(null)} style={{ padding: '8px 14px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>Cancel</button>
              <button onClick={importSyncResults} disabled={syncImporting || syncResults.filter(r => !r.existing).length === 0} style={{ padding: '8px 14px', borderRadius: '8px', background: syncResults.filter(r => !r.existing).length > 0 ? '#22c55e' : (dark ? '#1a2540' : '#e2e8f0'), color: syncResults.filter(r => !r.existing).length > 0 ? '#fff' : muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500 }}>
                {syncImporting ? 'Importing...' : `Import ${syncResults.filter(r => !r.existing).length} new videos`}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {syncResults.slice(0, 50).map(v => (
              <div key={v.youtube_id} style={{ display: 'flex', gap: '10px', padding: '8px', borderRadius: '8px', border: `0.5px solid ${border}`, opacity: v.existing ? 0.4 : 1 }}>
                {v.thumbnail && <img src={v.thumbnail} alt="" style={{ width: '80px', height: '45px', objectFit: 'cover' as const, borderRadius: '4px', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: text, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.title}</p>
                  <p style={{ fontSize: '11px', color: muted, margin: 0 }}>{v.views.toLocaleString()} views{v.existing ? ' · ✓ imported' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                const parts = lines[i].split(',').map(p => p.trim())
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
                const { data } = await supabase.from('videos').insert(inserts).select('*')
                if (data) setVideos(prev => [...data, ...prev])
              }
              setBulkCSV('')
              setBulkImporting(false)
              setShowBulkImport(false)
            }} disabled={bulkImporting || !bulkCSV.trim()} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: bulkCSV.trim() ? '#1e6cb5' : (dark ? '#1a2540' : '#e2e8f0'), color: bulkCSV.trim() ? '#fff' : muted, border: 'none', cursor: bulkCSV.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>
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
            <button onClick={createVideo} disabled={!newVideo.title || saving} style={{ padding: '10px 20px', borderRadius: '8px', background: newVideo.title ? '#1e6cb5' : (dark ? '#1a2540' : '#e2e8f0'), color: newVideo.title ? '#fff' : muted, border: 'none', cursor: newVideo.title ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>
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

      {/* Video grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
          <p style={{ fontSize: '40px', margin: '0 0 12px' }}>🎬</p>
          <p style={{ fontSize: '16px', color: text, fontWeight: 500, margin: '0 0 6px' }}>No videos yet</p>
          <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px' }}>Start building your video library by adding your first video.</p>
          <button onClick={() => setShowNew(true)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>+ New video</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {filtered.map(video => {
            const typeColor = TYPE_COLORS[video.video_type] || '#94a3b8'
            const statusStyle = STATUS_COLORS[video.status] || STATUS_COLORS['Archived']
            const tags = (video.video_tags || []).map(t => t.tag)
            return (
              <Link key={video.id} href={`/dashboard/videos/${video.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden', transition: 'border-color 0.15s, transform 0.15s', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = typeColor; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = border; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
                >
                  {/* Thumbnail or colored bar */}
                  {(video.youtube_thumbnail || video.thumbnail_url) ? (
                    <div style={{ position: 'relative', height: '160px', background: dark ? '#111d33' : '#f0f4ff', overflow: 'hidden' }}>
                      <img src={video.youtube_thumbnail || video.thumbnail_url || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      {video.youtube_duration && <span style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>{video.youtube_duration}</span>}
                    </div>
                  ) : (
                    <div style={{ height: '6px', background: typeColor }} />
                  )}
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: `${typeColor}20`, color: typeColor, fontWeight: 500 }}>{video.video_type}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: statusStyle.bg, color: statusStyle.color, fontWeight: 500 }}>{video.status}</span>
                      {video.visibility !== 'Internal' && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', color: muted }}>{video.visibility}</span>
                      )}
                    </div>
                    <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{video.title}</p>
                    {(video.youtube_views !== null || video.youtube_likes !== null) && (
                      <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: muted, marginBottom: '6px' }}>
                        {video.youtube_views !== null && <span>👁 {video.youtube_views.toLocaleString()}</span>}
                        {video.youtube_likes !== null && <span>👍 {video.youtube_likes.toLocaleString()}</span>}
                      </div>
                    )}
                    {video.productions && (
                      <p style={{ fontSize: '12px', color: '#5ba3e0', margin: '0 0 6px' }}>🎬 #{video.productions.production_number} {video.productions.title}</p>
                    )}
                    {tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        {tags.slice(0, 4).map(tag => (
                          <span key={tag} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', color: muted }}>{tag}</span>
                        ))}
                        {tags.length > 4 && <span style={{ fontSize: '11px', color: muted }}>+{tags.length - 4}</span>}
                      </div>
                    )}
                    <p style={{ fontSize: '12px', color: muted, margin: 0, opacity: 0.7 }}>
                      {video.date_published ? new Date(video.date_published + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : video.date_filmed ? new Date(video.date_filmed + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}