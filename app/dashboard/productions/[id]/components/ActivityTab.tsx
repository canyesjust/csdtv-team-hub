'use client'

import type { PTabCtx } from './production-tab-ctx'

export default function ActivityTab({ c }: { c: PTabCtx }) {
  const { activity, allTeam, border, muted, text } = c
  return (
        <div>
          {activity.length === 0 ? (
            <p style={{ color: muted, fontSize: '13px' }}>No activity yet</p>
          ) : (
            <div>
              {activity.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: i < activity.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', color: text, margin: '0 0 2px' }}>
                      <span style={{ fontWeight: 500 }}>{allTeam.find(t => t.id === item.user_id)?.name || item.team?.name || 'System'}</span> {item.action.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    {item.detail && <p style={{ fontSize: '12px', color: muted, margin: 0 }}>{item.detail}</p>}
                    <p style={{ fontSize: '11px', color: muted, margin: '3px 0 0' }}>
                      {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
  )
}
