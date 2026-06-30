'use client'

import { useCallback, useEffect, useState } from 'react'
import PlaylistEditor from '@/app/dashboard/board-meetings/components/PlaylistEditor'
import Loader from '@/app/dashboard/components/Loader'
import { toast } from '@/lib/toast'

type Template = { id: string; name: string; item_count: number }

export default function MeetingPlaylistSection({ productionId }: { productionId: string }) {
  const [hasPlaylist, setHasPlaylist] = useState<boolean | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [applyOpen, setApplyOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [loading, setLoading] = useState(true)

  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'

  const check = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/playlist`)
    const body = await res.json()
    setHasPlaylist(!!body.playlist)
    setLoading(false)
  }, [productionId])

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/playlist-templates')
    const body = await res.json()
    if (res.ok) setTemplates(body.templates || [])
  }, [])

  useEffect(() => { setLoading(true); check() }, [check])

  const applyTemplate = async (templateId: string) => {
    setApplying(true)
    const res = await fetch(`/api/board-meetings/${productionId}/playlist/apply-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId }),
    })
    const body = await res.json()
    setApplying(false)
    if (!res.ok) {
      toast(body.error || 'Apply failed', 'error')
      return
    }
    toast('Template applied', 'success')
    setApplyOpen(false)
    setHasPlaylist(true)
  }

  if (loading) return <Loader />

  return (
    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: `0.5px solid ${border}` }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: text }}>Pre-roll playlist <span style={{ fontSize: '12px', fontWeight: 400, color: muted }}>· shared by all meetings</span></h3>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: muted }}>This is the one station pre-roll that loops on the screens before every meeting goes live. Changes here apply to all meetings.</p>

      {!hasPlaylist ? (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: muted }}>No playlist yet.</p>
          <button type="button" onClick={() => { setApplyOpen(true); loadTemplates() }} style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Apply template</button>
        </div>
      ) : (
        <PlaylistEditor mode="meeting" productionId={productionId} />
      )}

      {applyOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }} onClick={() => !applying && setApplyOpen(false)}>
          <div style={{ background: cardBg, borderRadius: '12px', padding: '20px', maxWidth: '480px', width: '100%', border: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', color: text }}>Apply template</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {templates.map(t => (
                <button key={t.id} type="button" disabled={applying} onClick={() => applyTemplate(t.id)} style={{ textAlign: 'left', padding: '12px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: text }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: muted, marginTop: '2px' }}>{t.item_count} items</span>
                </button>
              ))}
            </div>
            {templates.length === 0 && <p style={{ color: muted, fontSize: '14px' }}>No templates. Create one under Board Meetings → Templates.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
