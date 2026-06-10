'use client'

import { uiStyles } from '@/lib/ui/styles'
import type { PTabCtx } from './production-tab-ctx'

export default function TeamTab({ c }: { c: PTabCtx }) {
  const { addMember, addingMember, border, cardBg, infoTone, inputStyle, memberToAdd, members, muted, nonMembers, removeMember, setAddingMember, setMemberToAdd, text } = c
  return (
        <div>
          <div style={{ ...uiStyles.card, padding: '12px 14px', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: muted }}>
              Team assigned: <span style={{ color: text, fontWeight: 600 }}>{members.length}</span>
              {nonMembers.length > 0 ? (
                <> · Available to add: <span style={{ color: text, fontWeight: 600 }}>{nonMembers.length}</span></>
              ) : null}
            </p>
          </div>
          {members.length === 0 ? (
            <div style={{ ...uiStyles.card, padding: '14px', marginBottom: '12px' }}>
              <p style={{ color: muted, fontSize: '13px', margin: 0 }}>No team members assigned to this production yet.</p>
            </div>
          ) : (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
              {members.map((m, i) => m.team && (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: i < members.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                    {m.team.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{m.team.name}</p>
                    <p style={{ fontSize: '12px', color: muted, margin: 0, textTransform: 'capitalize' as const }}>{m.team.role}</p>
                  </div>
                  <button
                    onClick={() => m.team && removeMember(m.user_id, m.team.name)}
                    style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingMember ? (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: 500, color: text, margin: '0 0 10px' }}>Add team member</p>
              <select value={memberToAdd} onChange={e => setMemberToAdd(e.target.value)} style={{ ...inputStyle, marginBottom: '10px' }}>
                <option value="">Select a team member...</option>
                {nonMembers.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={addMember}
                  disabled={!memberToAdd}
                  style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: memberToAdd ? 'var(--brand-primary)' : 'var(--surface-2)', color: memberToAdd ? '#fff' : muted, border: 'none', cursor: memberToAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingMember(false); setMemberToAdd('') }}
                  style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : nonMembers.length > 0 ? (
            <button
              onClick={() => setAddingMember(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: infoTone, background: 'none', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', padding: '8px 14px', fontFamily: 'inherit', minHeight: '40px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add team member
            </button>
          ) : (
            <p style={{ color: muted, fontSize: '13px' }}>All team members are already on this production</p>
          )}
        </div>
  )
}
