'use client'

import { getSchoolName } from '@/lib/schools'
import type { PTabCtx } from './production-tab-ctx'

export default function CallsheetTab({ c }: { c: PTabCtx }) {
  const { border, callSheet, cardBg, currentUser, dark, emailCallSheet, generateCallSheet, generatingSheet, muted, printCallSheet, production, text } = c
  return (
        <div>
          {!callSheet ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 20px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
              <p style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 6px' }}>No call sheet yet</p>
              <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px' }}>Generate one from this production's details using AI</p>
              <button onClick={generateCallSheet} disabled={generatingSheet} style={{ fontSize: '14px', padding: '12px 24px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: generatingSheet ? 0.7 : 1 }}>
                {generatingSheet ? 'Generating...' : '✨ Generate call sheet'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button onClick={printCallSheet} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>🖨 Print</button>
                <button onClick={emailCallSheet} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit' }}>📧 Email to crew</button>
                <button onClick={generateCallSheet} disabled={generatingSheet} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>{generatingSheet ? 'Regenerating...' : '🔄 Regenerate'}</button>
              </div>
              <div id="call-sheet-print">
                <div className="cs-header" style={{ borderBottom: `3px solid ${text}`, paddingBottom: '14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div className="cs-title" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: muted, marginBottom: '4px' }}>CSDtv Call Sheet</div>
                    <div className="cs-name" style={{ fontSize: '20px', fontWeight: 700, color: text }}>{production?.title}</div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div className="cs-date" style={{ fontSize: '20px', fontWeight: 500, color: '#c0392b' }}>{production?.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : 'TBD'}</div>
                    <div className="cs-day" style={{ fontSize: '11px', color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px' }}>{production?.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' }) : ''}</div>
                  </div>
                </div>
                <div className="cs-bar" style={{ display: 'flex', border: `1px solid ${border}`, borderRadius: '4px', marginBottom: '16px', fontSize: '12px' }}>
                  {[{ l: 'Status', v: production?.status || 'Scheduled' }, { l: 'Type', v: production?.request_type_label || 'Production' }, { l: 'School', v: getSchoolName(production?.school_department) || production?.school_department || '' }].map((item, i) => (
                    <div key={i} style={{ flex: 1, padding: '8px 12px', borderRight: i < 2 ? `1px solid ${border}` : 'none', background: cardBg }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.8px', color: muted, marginBottom: '2px' }}>{item.l}</div>
                      <div style={{ fontWeight: 600, color: text }}>{item.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Timeline</div>
                    {(callSheet.schedule || []).map((s: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: i > 0 ? `1px dotted ${border}` : 'none' }}>
                        <span style={{ color: muted, fontWeight: 500 }}>{s.time}</span>
                        <span style={{ fontWeight: 600, color: text, textAlign: 'right' as const }}>{s.activity}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Equipment</div>
                    {(callSheet.equipment || []).map((e: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '13px' }}>
                        <input type="checkbox" checked={e.checked} readOnly style={{ width: '14px', height: '14px' }} />
                        <span style={{ color: text }}>{e.item}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Location</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
                      <span style={{ color: muted, fontWeight: 500 }}>Venue</span>
                      <span style={{ fontWeight: 600, color: text }}>{getSchoolName(production?.filming_location) || getSchoolName(production?.school_department) || production?.filming_location || 'TBD'}</span>
                    </div>
                    {callSheet.content?.production_snapshot?.school_address && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: `1px dotted ${border}` }}>
                        <span style={{ color: muted, fontWeight: 500 }}>Address</span>
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(callSheet.content.production_snapshot.school_address)}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, color: '#5ba3e0', textDecoration: 'none', textAlign: 'right' as const, maxWidth: '60%' }}>{callSheet.content.production_snapshot.school_address} 📍</a>
                      </div>
                    )}
                    {callSheet.parking_access && <div style={{ fontSize: '13px', color: muted, marginTop: '8px', padding: '6px 8px', background: cardBg, borderRadius: '4px' }}>🅿️ {callSheet.parking_access}</div>}
                  </div>
                  <div style={{ border: `1px solid ${border}`, borderRadius: '4px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${cardBg}` }}>Crew</div>
                    {(callSheet.crew || []).map((c: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: i > 0 ? `1px dotted ${border}` : 'none' }}>
                        <span style={{ color: muted, fontWeight: 500 }}>{c.role}</span>
                        <span style={{ fontWeight: 600, color: c.name ? text : muted, fontStyle: c.name ? 'normal' : 'italic' }}>{c.name || 'Unassigned'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {(callSheet.producer_notes || []).length > 0 && (
                  <div style={{ background: dark ? 'rgba(30,58,95,0.2)' : '#eff6ff', borderLeft: '3px solid #1e3a5f', padding: '12px 14px', borderRadius: '0 4px 4px 0', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1px', color: '#1e3a5f', marginBottom: '6px' }}>Producer Notes</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {callSheet.producer_notes.map((n: string, i: number) => (
                        <li key={i} style={{ fontSize: '13px', padding: '3px 0', paddingLeft: '16px', position: 'relative' as const, lineHeight: 1.45 }}>
                          <span style={{ position: 'absolute' as const, left: 0, color: '#1e3a5f', fontWeight: 700 }}>—</span>
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '14px', borderTop: `2px solid ${text}`, fontSize: '12px' }}>
                  <div><strong>Organizer:</strong> {production?.organizer_name || 'N/A'}<br /><span style={{ color: muted }}>{production?.organizer_email || ''}</span></div>
                  <div style={{ textAlign: 'right' as const }}><strong>CSDtv</strong><br /><span style={{ color: muted }}>{currentUser?.name || 'Justin Andersen'}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
  )
}
