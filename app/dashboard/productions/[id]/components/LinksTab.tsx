'use client'

import type { PTabCtx } from './production-tab-ctx'

export default function LinksTab({ c }: { c: PTabCtx }) {
  const { addKBLink, addLink, border, brandTone, cardBg, infoTone, inputStyle, kbArticles, links, muted, newLinkTitle, newLinkUrl, selectedKB, setNewLinkTitle, setNewLinkUrl, setSelectedKB, setShowKBLink, setShowLinkForm, showKBLink, showLinkForm } = c
  return (
        <div>
          {links.length === 0 && !showLinkForm && (
            <p style={{ color: muted, fontSize: '13px', marginBottom: '12px' }}>No links added yet</p>
          )}
          {links.map(link => (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', marginBottom: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: infoTone, textDecoration: 'none', fontWeight: 500 }}>{link.title}</a>
                <p style={{ fontSize: '11px', color: muted, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{link.url}</p>
              </div>
            </div>
          ))}

          {showLinkForm ? (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
              <input value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} placeholder="Link title" style={{ ...inputStyle, marginBottom: '8px' }} />
              <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="URL" style={{ ...inputStyle, marginBottom: '10px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={addLink} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: brandTone, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Add link</button>
                <button onClick={() => setShowLinkForm(false)} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowLinkForm(true)}
                style={{ fontSize: '13px', color: infoTone, background: 'none', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontFamily: 'inherit', minHeight: '40px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add link
              </button>
              {kbArticles.length > 0 && (
                showKBLink ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select value={selectedKB} onChange={e => setSelectedKB(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
                      <option value="">Select KB article...</option>
                      {kbArticles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                    <button
                      onClick={addKBLink}
                      disabled={!selectedKB}
                      style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: selectedKB ? brandTone : 'var(--surface-2)', color: selectedKB ? '#fff' : muted, border: 'none', cursor: selectedKB ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, minHeight: '40px' }}
                    >
                      Link
                    </button>
                    <button
                      onClick={() => setShowKBLink(false)}
                      style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '40px' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKBLink(true)}
                    style={{ fontSize: '13px', color: '#9b85e0', background: 'none', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontFamily: 'inherit', minHeight: '40px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
                    </svg>
                    Link KB article
                  </button>
                )
              )}
            </div>
          )}
        </div>
  )
}
