'use client'

/** AI suggestions + YouTube sync panels — lazy-loaded to keep the main videos route bundle smaller. */

type ThemeColors = {
  text: string
  muted: string
  border: string
  cardBg: string
  dark: boolean
}

type AiSuggestion = {
  videoId: string
  videoTitle: string
  video_type: string
  school: string | null
  production_number: number | null
  prodTitle: string | null
  confidence: string
  approved: boolean
}

type SyncRow = {
  youtube_id: string
  title: string
  views: number
  existing: boolean
  thumbnail: string
}

type MissingVideo = {
  id: string
  title: string
  youtube_thumbnail: string | null
  date_published: string | null
  youtube_views: number | null
}

export interface VideosHeavyPanelsProps {
  theme: ThemeColors
  aiSuggestions: AiSuggestion[] | null
  onToggleSuggestion: (index: number) => void
  onSelectAllSuggestions: () => void
  onDismissSuggestions: () => void
  onApplySuggestions: () => void
  syncResults: SyncRow[] | null
  syncImporting: boolean
  syncComplete: boolean
  refreshedCount: number
  missingFromYoutube: MissingVideo[]
  onCancelSync: () => void
  onImportSync: () => void
  onArchiveAllMissing: () => void
  onRemoveMissing: (id: string) => void
}

export default function VideosHeavyPanels({
  theme,
  aiSuggestions,
  onToggleSuggestion,
  onSelectAllSuggestions,
  onDismissSuggestions,
  onApplySuggestions,
  syncResults,
  syncImporting,
  syncComplete,
  refreshedCount,
  missingFromYoutube,
  onCancelSync,
  onImportSync,
  onArchiveAllMissing,
  onRemoveMissing,
}: VideosHeavyPanelsProps) {
  const { text, muted, border, cardBg, dark } = theme

  return (
    <>
      {aiSuggestions && aiSuggestions.length > 0 && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px' }}>🤖 AI Suggestions — Review Before Applying</h3>
              <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{aiSuggestions.filter(s => s.approved).length} of {aiSuggestions.length} approved</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={onSelectAllSuggestions} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Select all</button>
              <button type="button" onClick={onDismissSuggestions} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="button" onClick={onApplySuggestions} disabled={aiSuggestions.filter(s => s.approved).length === 0} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: aiSuggestions.some(s => s.approved) ? '#22c55e' : 'var(--surface-2)', color: aiSuggestions.some(s => s.approved) ? '#fff' : muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                Apply {aiSuggestions.filter(s => s.approved).length} approved
              </button>
            </div>
          </div>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {aiSuggestions.map((s, i) => (
              <div key={i} role="button" tabIndex={0} onClick={() => onToggleSuggestion(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSuggestion(i) } }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', border: `0.5px solid ${s.approved ? 'rgba(34,197,94,0.3)' : border}`, background: s.approved ? 'rgba(34,197,94,0.04)' : 'transparent', cursor: 'pointer' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: `1.5px solid ${s.approved ? '#22c55e' : border}`, background: s.approved ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.approved && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: text, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.videoTitle}</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>{s.video_type}</span>
                    {s.school && <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>{s.school}</span>}
                    {s.prodTitle && <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>→ {s.prodTitle}</span>}
                  </div>
                </div>
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: s.confidence === 'high' ? 'rgba(34,197,94,0.1)' : s.confidence === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', color: s.confidence === 'high' ? '#22c55e' : s.confidence === 'medium' ? '#f59e0b' : '#ef4444', flexShrink: 0 }}>{s.confidence}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {syncResults && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 4px' }}>YouTube Channel Sync</h3>
              <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{syncResults.length} {syncComplete ? 'total' : 'fetched (partial)'} · {syncResults.filter(r => !r.existing).length} new · {syncResults.filter(r => r.existing).length} already imported{refreshedCount > 0 ? ` · ${refreshedCount} refreshed` : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={onCancelSync} style={{ padding: '8px 14px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>Cancel</button>
              <button type="button" onClick={onImportSync} disabled={syncImporting || syncResults.filter(r => !r.existing).length === 0} style={{ padding: '8px 14px', borderRadius: '8px', background: syncResults.filter(r => !r.existing).length > 0 ? '#22c55e' : 'var(--surface-2)', color: syncResults.filter(r => !r.existing).length > 0 ? '#fff' : muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500 }}>
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

          {missingFromYoutube.length > 0 && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: `0.5px solid ${border}` }}>
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444', margin: 0 }}>⚠ {missingFromYoutube.length} gone from YouTube</p>
                    <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>Checked against YouTube: these appear deleted or set to private. Unlisted videos still work and are not listed here. Archive keeps them in the Hub but hidden.</p>
                  </div>
                  <button type="button" onClick={onArchiveAllMissing} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, flexShrink: 0 }}>Archive all</button>
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto' as const }}>
                  {missingFromYoutube.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px' }}>
                      {v.youtube_thumbnail ? (
                        <img src={v.youtube_thumbnail} alt="" style={{ width: '48px', height: '27px', objectFit: 'cover' as const, borderRadius: '4px', flexShrink: 0, opacity: 0.5 }} />
                      ) : <div style={{ width: '48px', height: '27px', borderRadius: '4px', background: 'var(--surface-2)', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.title}</p>
                        <p style={{ fontSize: '11px', color: muted, margin: 0 }}>{v.date_published || 'No date'}{v.youtube_views != null ? ` · ${v.youtube_views.toLocaleString()} views` : ''}</p>
                      </div>
                      <button type="button" onClick={() => onRemoveMissing(v.id)} title="Delete permanently from the Hub" style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
