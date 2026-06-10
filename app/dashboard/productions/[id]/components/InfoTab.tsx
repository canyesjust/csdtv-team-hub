'use client'

import { getDefaultExternalCostForType } from '@/lib/external-production-costs'
import { getSchoolName } from '@/lib/schools'
import type { PTabCtx } from './production-tab-ctx'

export default function InfoTab({ c }: { c: PTabCtx }) {
  const { activity, border, brandTone, cameraOptionIdFromProduction, cameraPackages, cardBg, dangerTone, delivCount, delivNotes, effectiveProdStatus, externalCostUsd, fetchingYt, formatDateTime, formatOutsourcedUsd, formatRawCreatedOn, getTypeLabel, inputStyle, isOnBehalf, linkYoutubeVideo, muted, notesSaved, organizerEmail, organizerName, persistExternalCostFromInput, production, recomputeOneEstimatedCost, recomputingEstCost, saveTeamNotes, saveVideosProduced, savingDeliv, savingExternalCost, savingNotes, setDelivCount, setDelivNotes, setExternalCostUsd, setTeamNotes, setYoutubeUrl, showSubmitterCard, submitterEmail, submitterName, successTone, teamNotes, text, youtubeUrl } = c
  return (
        <div>
          {/* Timeline */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 14px' }}>Production timeline</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', position: 'relative' as const }}>
              {(() => {
                const steps = [
                  { label: 'Requested', date: null, done: true },
                  { label: 'Approved', date: null, done: (effectiveProdStatus || '') !== 'Idea/Request' },
                  { label: 'Scheduled', date: production.start_datetime, done: !!production.start_datetime },
                  { label: 'Complete Requested', date: activity.find(a => a.action === 'requested_complete' || a.action === 'marked_complete')?.created_at || null, done: effectiveProdStatus === 'Complete Requested' || effectiveProdStatus === 'Complete' || activity.some(a => a.action === 'requested_complete' || a.action === 'marked_complete') },
                  { label: 'Complete', date: activity.find(a => a.action === 'marked_complete')?.created_at || null, done: effectiveProdStatus === 'Complete' },
                ]
                return steps.map((step, i) => (
                  <div key={step.label} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', position: 'relative' as const }}>
                    {i > 0 && <div style={{ position: 'absolute' as const, top: '10px', right: '50%', width: '100%', height: '2px', background: step.done ? successTone : border, zIndex: 0 }} />}
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: step.done ? successTone : 'var(--surface-2)', border: step.done ? 'none' : `2px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, position: 'relative' as const }}>
                      {step.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: step.done ? text : muted, margin: '6px 0 0', textAlign: 'center' as const }}>{step.label}</p>
                    {step.date && <p style={{ fontSize: '10px', color: muted, margin: '2px 0 0' }}>{new Date(step.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                  </div>
                ))
              })()}
            </div>
            {production.synced_at && production.start_datetime && (
              <p style={{ fontSize: '12px', color: muted, margin: '12px 0 0', textAlign: 'center' as const }}>
                {Math.round((new Date(production.start_datetime).getTime() - new Date(production.synced_at).getTime()) / (1000 * 60 * 60 * 24))} days from request to shoot
                {effectiveProdStatus === 'Complete' || activity.some(a => a.action === 'marked_complete') ? ` · ${Math.round((new Date(activity.find(a => a.action === 'marked_complete')?.created_at || Date.now()).getTime() - new Date(production.synced_at).getTime()) / (1000 * 60 * 60 * 24))} days total turnaround` : ''}
              </p>
            )}
          </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 6px' }}>
              {isOnBehalf ? 'Organizer (request made on behalf)' : 'Organizer'}
            </h3>
            {isOnBehalf && (
              <p style={{ margin: '0 0 10px', fontSize: '11px', color: muted }}>
                This request was submitted by a staff member on behalf of the organizer.
              </p>
            )}
            {([[
              'Name',
              organizerName,
            ], [
              'Email',
              organizerEmail,
            ], [
              'School',
              getSchoolName(production.submitter_building_code) ||
              getSchoolName(production.filming_location) ||
              getSchoolName(production.school_department),
            ], [
              'Year',
              production.school_year,
            ], [
              'Focus',
              production.focus_area,
            ]] as [string, string | null][]).map(([l, v]) => v ? (
              <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '60px', flexShrink: 0 }}>{l}</span>
                <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
              </div>
            ) : null)}
          </div>
          {showSubmitterCard && (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>Submitted by</h3>
              {([['Name', submitterName], ['Email', submitterEmail], ['Username', production.submitter_username], ['Building', getSchoolName(production.submitter_building_code) || production.submitter_building_code], ['Employee #', production.submitter_employee_number]] as [string, string | null][]).map(([l, v]) => v ? (
                <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                  <span style={{ color: muted, minWidth: '80px', flexShrink: 0 }}>{l}</span>
                  <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
                </div>
              ) : null)}
            </div>
          )}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>Schedule & location</h3>
            {([['Start', formatDateTime(production.start_datetime)], ['Start label', production.start_datetime_label], ['End', formatDateTime(production.end_datetime)], ['End label', production.end_datetime_label], ['Location', getSchoolName(production.filming_location) || production.filming_location || getSchoolName(production.school_department)], ['Location detail', production.filming_location_details], ['Venue', production.event_location]] as [string, string | null][]).map(([l, v]) => v ? (
              <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '60px', flexShrink: 0 }}>{l}</span>
                <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
              </div>
            ) : null)}
          </div>
          {(() => {
            const hasStored = production.estimated_external_cost != null
            const displayAmount = hasStored
              ? Number(production.estimated_external_cost)
              : getDefaultExternalCostForType(production.request_type_label)
            const camId = cameraOptionIdFromProduction(production.camera_options)
            const camPkg = camId !== null ? cameraPackages.find(p => p.option_id === camId) : undefined
            const subtitle = hasStored
              ? (camPkg
                ? `Based on the ${camPkg.label} camera package`
                : 'Stored outsourced cost (no matching camera package row)')
              : `Based on production type default (${production.request_type_label || 'Unknown'})`
            return (
              <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 8px' }}>Estimated outsourced cost</h3>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: successTone, margin: '0 0 6px', lineHeight: 1.2 }}>{formatOutsourcedUsd(displayAmount)}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: 0, lineHeight: 1.45 }}>{subtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void recomputeOneEstimatedCost()}
                    disabled={recomputingEstCost}
                    style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', background: 'transparent', color: successTone, border: '1px solid rgba(34,197,94,0.35)', cursor: recomputingEstCost ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 600, flexShrink: 0, alignSelf: 'flex-start' }}
                  >
                    {recomputingEstCost ? 'Recomputing…' : 'Recompute'}
                  </button>
                </div>
              </div>
            )
          })()}
          <details style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <summary style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', cursor: 'pointer' }}>Source metadata</summary>
            <div style={{ marginTop: '12px' }}>
            {([
              ['Status code', production.status_code ? String(production.status_code) : null],
              ['Created on', formatRawCreatedOn(production.created_on)],
              ['On behalf', production.is_on_behalf === null ? null : (production.is_on_behalf ? 'Yes' : 'No')],
              ['Approved email sent', production.sent_approved_email === null ? null : (production.sent_approved_email ? 'Yes' : 'No')],
              ['Focus code', production.focus_area_code],
              ['Submitter user ID', production.submitter_user_id ? String(production.submitter_user_id) : null],
              ['Submitter site ID', production.submitter_site_user_id],
            ] as [string, string | null][]).map(([l, v]) => v ? (
              <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '120px', flexShrink: 0 }}>{l}</span>
                <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
              </div>
            ) : null)}
            {production.video_addons_array && production.video_addons_array.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '120px', flexShrink: 0 }}>Video addons</span>
                <span style={{ color: text }}>{production.video_addons_array.join(', ')}</span>
              </div>
            )}
            {production.audio_options_array && production.audio_options_array.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '120px', flexShrink: 0 }}>Audio options</span>
                <span style={{ color: text }}>{production.audio_options_array.join(', ')}</span>
              </div>
            )}
            {production.production_staff && production.production_staff.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '6px 0', fontSize: '13px' }}>
                <span style={{ color: muted, minWidth: '120px', flexShrink: 0 }}>Production staff</span>
                <span style={{ color: text }}>{production.production_staff.length} from source system</span>
              </div>
            )}
            </div>
          </details>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>Organizer YouTube link</h3>
            <div style={{ fontSize: '13px', color: text, lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 6px' }}>
                <span style={{ color: muted }}>Send logged: </span>
                {production.youtube_link_email_sent_at
                  ? new Date(production.youtube_link_email_sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : 'Not yet'}
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: muted }}>Tracked opens: </span>
                {production.youtube_link_email_click_count ?? 0}
                {production.youtube_link_email_first_click_at && (
                  <span style={{ color: muted }}>{' '}· first {new Date(production.youtube_link_email_first_click_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                )}
              </p>
              <p style={{ fontSize: '11px', color: muted, margin: '8px 0 0' }}>Tracked opens use the redirect URL built from the production’s synced livestream/video link (district sync), not Team Hub or YouTube API data.</p>
            </div>
          </div>
          {production.additional_notes && (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Organizer notes</h3>
              <p style={{ fontSize: '13px', color: text, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' as const }}>{production.additional_notes}</p>
            </div>
          )}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Team notes</h3>
            <p style={{ fontSize: '11px', color: muted, margin: '0 0 8px' }}>Internal notes — only visible to CSDtv staff</p>
            <textarea
              value={teamNotes}
              onChange={e => setTeamNotes(e.target.value)}
              placeholder="Add internal notes about this production..."
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const, lineHeight: 1.5, marginBottom: '8px' }}
            />
            <button onClick={saveTeamNotes} disabled={savingNotes} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: notesSaved ? successTone : brandTone, color: '#fff', border: 'none', cursor: savingNotes ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500, transition: 'background 0.2s' }}>
              {notesSaved ? '✓ Saved!' : savingNotes ? 'Saving...' : 'Save notes'}
            </button>
          </div>

          {/* Estimated external cost (Reports → Cost savings) */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 6px' }}>Estimated external cost</h3>
            <p style={{ fontSize: '11px', color: muted, margin: '0 0 10px', lineHeight: 1.45 }}>
              Used on <strong>Reports → Cost savings</strong> for this production. If you leave this blank, Reports use the default for request type{' '}
              <strong>{getTypeLabel(production)}</strong>:{' '}
              <strong style={{ color: text }}>${getDefaultExternalCostForType(production.request_type_label).toLocaleString()}</strong>.
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Override (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={externalCostUsd}
                  onChange={e => setExternalCostUsd(e.target.value)}
                  placeholder={`Default ${getDefaultExternalCostForType(production.request_type_label)}`}
                  style={{ ...inputStyle, width: '140px', padding: '7px 10px' }}
                />
              </div>
              <button
                type="button"
                onClick={() => void persistExternalCostFromInput(externalCostUsd)}
                disabled={savingExternalCost}
                style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: brandTone, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}
              >
                {savingExternalCost ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => void persistExternalCostFromInput('')}
                disabled={savingExternalCost}
                style={{ fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear override
              </button>
            </div>
          </div>

          {/* Videos Produced */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Videos Produced</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Count</label>
                <input type="number" value={delivCount} onChange={e => setDelivCount(parseInt(e.target.value) || 0)} min={0} style={{ ...inputStyle, width: '80px', padding: '7px 10px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Notes</label>
                <input value={delivNotes} onChange={e => setDelivNotes(e.target.value)} placeholder="e.g. 50 slideshows + 1 highlight reel" style={{ ...inputStyle, padding: '7px 10px' }} />
              </div>
              <button onClick={saveVideosProduced} disabled={savingDeliv} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: brandTone, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}>
                {savingDeliv ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Link YouTube Video */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Link YouTube Video</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
              <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="Paste YouTube URL..." style={{ ...inputStyle, flex: 1, padding: '7px 10px' }} onKeyDown={e => e.key === 'Enter' && linkYoutubeVideo()} />
              <button onClick={linkYoutubeVideo} disabled={fetchingYt || !youtubeUrl} style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: youtubeUrl ? dangerTone : 'var(--surface-2)', color: youtubeUrl ? '#fff' : muted, border: 'none', cursor: youtubeUrl ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}>
                {fetchingYt ? 'Fetching...' : '▶ Link'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: muted, margin: '6px 0 0' }}>Creates a Video Library entry with title, views, likes, and thumbnail from YouTube</p>
          </div>
        </div>
        </div>
  )
}
