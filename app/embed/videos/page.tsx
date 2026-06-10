'use client'

import { useEffect, useState } from 'react'

interface Video {
  id: string; title: string; video_type: string; status: string
  date_published: string | null; youtube_url: string | null; youtube_id: string | null
  youtube_views: number | null; youtube_likes: number | null
  youtube_duration: string | null; youtube_thumbnail: string | null; description: string | null
}

export default function EmbedVideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'views' | 'title'>('date')

  useEffect(() => {
    fetch('/api/videos/public').then(r => r.json()).then(d => {
      setVideos(d.videos || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const types = [...new Set(videos.map(v => v.video_type).filter(t => t && t !== 'Other'))].map(t => t.replace(/\(.*\)/, '').trim()).filter((t, i, a) => a.indexOf(t) === i)

  const filtered = videos.filter(v => {
    if (typeFilter !== 'all' && v.video_type.replace(/\(.*\)/, '').trim() !== typeFilter) return false
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'views') return (b.youtube_views || 0) - (a.youtube_views || 0)
    if (sortBy === 'title') return a.title.localeCompare(b.title)
    return new Date(b.date_published || '').getTime() - new Date(a.date_published || '').getTime()
  })

  const totalViews = videos.reduce((s, v) => s + (v.youtube_views || 0), 0)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#64748b' }}>
      Loading videos...
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: '1400px', margin: '0 auto', padding: '20px', background: '#fff', color: '#0f172a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>CSDtv Video Library</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>{videos.length} videos · {totalViews.toLocaleString()} total views</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search videos..."
          style={{ flex: '1 1 200px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'inherit', outline: 'none', minWidth: '160px' }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
          <option value="date">Newest first</option>
          <option value="views">Most viewed</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {filtered.map(v => (
          <a key={v.id} href={v.youtube_url || `https://youtube.com/watch?v=${v.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', transition: 'all 0.2s', background: '#fff' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none' }}
          >
            {/* Thumbnail */}
            <div style={{ position: 'relative', paddingTop: '56.25%', background: '#f1f5f9', overflow: 'hidden' }}>
              {v.youtube_thumbnail && <img src={v.youtube_thumbnail} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              {v.youtube_duration && (
                <span style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>{v.youtube_duration}</span>
              )}
            </div>
            {/* Info */}
            <div style={{ padding: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 6px', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{v.title}</h3>
              <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#64748b' }}>
                {v.youtube_views !== null && <span>👁 {v.youtube_views.toLocaleString()}</span>}
                {v.youtube_likes !== null && <span>👍 {v.youtube_likes.toLocaleString()}</span>}
                {v.date_published && <span>{new Date(v.date_published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              </div>
              {v.video_type && v.video_type !== 'Other' && <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>{v.video_type.replace(/\(.*\)/, '').trim()}</span>}
            </div>
          </a>
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px', fontSize: '15px' }}>No videos match your filters</p>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px 0 10px', fontSize: '12px', color: '#94a3b8' }}>
        Powered by CSDtv Production Office
      </div>
    </div>
  )
}
