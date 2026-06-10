'use client'

import AsyncButton from '../../../components/AsyncButton'
import Link from 'next/link'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { formatDate } from '@/lib/format-date'
import type { PTabCtx } from './production-tab-ctx'

export default function VideosTab({ c }: { c: PTabCtx }) {
  const { border, cardBg, linkedVideos, muted, refreshYoutubeStats, setLinkedVideos, supabase, text } = c
  return (
        <div>
          {linkedVideos.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: muted }}>{linkedVideos.length} video{linkedVideos.length !== 1 ? 's' : ''} linked{linkedVideos.some(v => v.youtube_views) ? ` · ${linkedVideos.reduce((s, v) => s + (v.youtube_views || 0), 0).toLocaleString()} total views` : ''}</span>
              <AsyncButton onClick={async () => {
                if (!(await confirmDialog({ message: `Unlink all ${linkedVideos.length} videos from this production?`, tone: 'danger', confirmLabel: 'Unlink' }))) return
                for (const v of linkedVideos) await supabase.from('videos').update({ production_id: null }).eq('id', v.id)
                setLinkedVideos([])
                toast(`Unlinked ${linkedVideos.length} videos`, 'success')
              }} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Unlink all
              </AsyncButton>
            </div>
          )}
          {linkedVideos.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '30px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px' }}>
              <p style={{ fontSize: '14px', color: muted, margin: '0 0 8px' }}>No videos linked to this production</p>
              <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>Use the "Link YouTube Video" section in the Info tab to add one</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
              {linkedVideos.map(v => (
                <div key={v.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: '14px', padding: '14px' }}>
                    {v.youtube_thumbnail && (
                      <a href={v.youtube_url || `https://youtube.com/watch?v=${v.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                        <img src={v.youtube_thumbnail} alt="" style={{ width: '160px', height: '90px', objectFit: 'cover' as const, borderRadius: '8px' }} />
                      </a>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.title}</p>
                      <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px' }}>{v.video_type} · {v.status}{v.date_published ? ` · ${formatDate(v.date_published)}` : ''}</p>
                      {(v.youtube_views !== null || v.youtube_likes !== null || v.youtube_duration) && (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {v.youtube_views !== null && <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>👁 {v.youtube_views.toLocaleString()} views</span>}
                          {v.youtube_likes !== null && <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>👍 {v.youtube_likes.toLocaleString()}</span>}
                          {v.youtube_duration && <span style={{ fontSize: '13px', color: muted }}>⏱ {v.youtube_duration}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        {v.youtube_url && <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#ef4444', textDecoration: 'none', fontWeight: 500 }}>▶ Watch on YouTube</a>}
                        {v.youtube_id && <button onClick={() => refreshYoutubeStats(v.id, v.youtube_id!)} style={{ fontSize: '12px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>🔄 Refresh stats</button>}
                        <Link href={`/dashboard/videos/${v.id}`} style={{ fontSize: '12px', color: muted, textDecoration: 'none' }}>Open in library →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
  )
}
