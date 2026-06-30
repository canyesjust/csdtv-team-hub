'use client'

import Link from 'next/link'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { formatMonthDay } from '@/lib/format-date'
import type { PTabCtx } from './production-tab-ctx'

export default function ChecklistTab({ c }: { c: PTabCtx }) {
  const { allProductions, allTeam, assignSuccess, border, brandTone, cardBg, checklist, completedCount, copySetupTo, copyTargetId, createTaskForProduction, currentUser, dark, infoTone, successTone, initChecklist, inputBg, inputStyle, kbArticles, linkedTasks, loadData, massAssign, members, moveItem, muted, newTaskAssignee, newTaskDue, newTaskHideFromSignage, newTaskPriority, newTaskPurchaseLink, newTaskPurchaseRequest, newTaskTitle, production, progress, selectedMember, setChecklist, setCopyTargetId, setNewTaskAssignee, setNewTaskDue, setNewTaskHideFromSignage, setNewTaskPriority, setNewTaskPurchaseLink, setNewTaskPurchaseRequest, setNewTaskTitle, setSelectedMember, setShowCopySetup, setShowCreateTask, showCopySetup, showCreateTask, supabase, text, toggleItem, typeLabel, uuid } = c
  return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' as const }}>
            <button onClick={async () => {
              if (!production || !uuid) return
              const typeLabel = production.request_type_label || production.type
              if (!typeLabel) { toast('No production type set'); return }
              // Find the most recent completed production of same type
              const { data: lastProd } = await supabase.from('productions').select('id, production_number, title').eq('request_type_label', typeLabel).neq('id', uuid).order('start_datetime', { ascending: false }).limit(1).single()
              if (!lastProd) { toast(`No previous ${typeLabel} production found`, 'error'); return }
              if (!(await confirmDialog({ message: `Apply checklist and team from #${lastProd.production_number} ${lastProd.title}?`, confirmLabel: 'Apply' }))) return
              const [clRes, tmRes] = await Promise.all([
                supabase.from('checklist_items').select('title, sort_order').eq('production_id', lastProd.id).order('sort_order'),
                supabase.from('production_members').select('user_id').eq('production_id', lastProd.id),
              ])
              if (clRes.data && clRes.data.length > 0) {
                await supabase.from('checklist_items').insert(clRes.data.map((c: any, i: number) => ({ production_id: uuid, title: c.title, completed: false, sort_order: i })))
              }
              if (tmRes.data && tmRes.data.length > 0) {
                await supabase.from('production_members').insert(tmRes.data.map((m: any) => ({ production_id: uuid, user_id: m.user_id })))
              }
              loadData()
            }} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}>
              Apply last {production.request_type_label?.split('(')[0]?.trim() || 'type'} setup
            </button>
            <button onClick={() => setShowCopySetup(!showCopySetup)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}>
              Copy setup to...
            </button>
            <button
              onClick={() => {
                setShowCreateTask(prev => {
                  const next = !prev
                  if (next) setNewTaskAssignee(a => a || currentUser?.id || '')
                  return next
                })
              }}
              style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '38px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create task for this production
            </button>
          </div>

          {showCopySetup && (
            <div style={{ background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <p style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>Copy checklist ({checklist.length} items) and team ({members.length} members) to another production:</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={copyTargetId} onChange={e => setCopyTargetId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">Select a production...</option>
                  {allProductions.map(p => <option key={p.id} value={p.id}>#{p.production_number} {p.title}</option>)}
                </select>
                <button onClick={copySetupTo} disabled={!copyTargetId} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: copyTargetId ? brandTone : 'var(--surface-2)', color: copyTargetId ? '#fff' : muted, border: 'none', cursor: copyTargetId ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap' as const }}>Copy</button>
              </div>
            </div>
          )}

          {showCreateTask && (
            <div style={{ background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title" style={{ ...inputStyle, marginBottom: '8px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {allTeam.map(m => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
                </select>
                <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)} style={inputStyle}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="day of">Day of</option>
                </select>
                <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: newTaskPurchaseRequest ? '8px' : '10px' }}>
                <input
                  type="checkbox"
                  id="prod_task_purchase_request"
                  checked={newTaskPurchaseRequest}
                  onChange={e => { setNewTaskPurchaseRequest(e.target.checked); if (!e.target.checked) setNewTaskPurchaseLink('') }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                />
                <label htmlFor="prod_task_purchase_request" style={{ fontSize: '13px', color: muted, cursor: 'pointer' }}>Purchase request</label>
              </div>
              {newTaskPurchaseRequest && (
                <input
                  value={newTaskPurchaseLink}
                  onChange={e => setNewTaskPurchaseLink(e.target.value)}
                  placeholder="Purchase link (optional)"
                  style={{ ...inputStyle, marginBottom: '10px' }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  id="prod_task_hide_signage"
                  checked={newTaskHideFromSignage}
                  onChange={e => setNewTaskHideFromSignage(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                />
                <label htmlFor="prod_task_hide_signage" style={{ fontSize: '13px', color: muted, cursor: 'pointer' }}>Hide from task signage</label>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={createTaskForProduction}
                  disabled={!newTaskTitle}
                  style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: newTaskTitle ? brandTone : 'var(--surface-2)', color: newTaskTitle ? '#fff' : muted, border: 'none', cursor: newTaskTitle ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}
                >
                  Create task
                </button>
                <button
                  onClick={() => setShowCreateTask(false)}
                  style={{ fontSize: '13px', padding: '7px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {checklist.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 20px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
              <p style={{ color: muted, fontSize: '14px', marginBottom: '12px' }}>No checklist yet</p>
              <button
                onClick={initChecklist}
                style={{ fontSize: '13px', padding: '8px 20px', borderRadius: '8px', background: brandTone, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
              >
                Load {typeLabel} template
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ flex: 1, height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? successTone : brandTone, borderRadius: '3px', transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '12px', color: muted, flexShrink: 0 }}>{completedCount} of {checklist.length}</span>
              </div>

              {/* Mass assign */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: muted, flexShrink: 0 }}>Assign all to:</span>
                <div style={{ display: 'flex', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
                  {allTeam.map(member => (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMember(selectedMember === member.id ? null : member.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', border: `0.5px solid ${selectedMember === member.id ? successTone : border}`, background: selectedMember === member.id ? 'rgba(34,197,94,0.1)' : 'transparent', color: selectedMember === member.id ? successTone : muted, fontFamily: 'inherit' }}
                    >
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700, color: '#0a0f1e' }}>
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      {member.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={massAssign}
                  disabled={!selectedMember}
                  style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', border: 'none', background: selectedMember ? brandTone : 'var(--surface-2)', color: selectedMember ? '#fff' : muted, cursor: selectedMember ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}
                >
                  {assignSuccess ? '✓ Assigned' : 'Assign all'}
                </button>
              </div>

              <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                {checklist.map((item, i) => {
                  const assignee = allTeam.find(m => m.id === item.assigned_to)
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, padding: '12px 16px', borderBottom: i < checklist.length - 1 ? `0.5px solid ${border}` : 'none', background: item.completed ? (dark ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.03)') : 'transparent' }}>
                      <button
                        onClick={() => toggleItem(item)}
                        style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, border: `1.5px solid ${item.completed ? successTone : border}`, background: item.completed ? successTone : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {item.completed && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                      <span style={{ flex: '1 1 260px', minWidth: 0, fontSize: '13px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none' }}>
                        {item.title}
                        {item.kb_article_id && (() => {
                          const kb = kbArticles.find(a => a.id === item.kb_article_id)
                          return kb ? <Link href="/dashboard/library?tab=articles" style={{ fontSize: '11px', color: 'var(--brand-primary)', marginLeft: '6px', textDecoration: 'none' }}>📖 {kb.title}</Link> : null
                        })()}
                      </span>
                      <select value={item.kb_article_id || ''} onChange={e => {
                        const val = e.target.value || null
                        supabase.from('checklist_items').update({ kb_article_id: val }).eq('id', item.id)
                        setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, kb_article_id: val } : c))
                      }} style={{ fontSize: '11px', padding: '3px 6px', borderRadius: '6px', border: `0.5px solid ${border}`, background: inputBg, color: item.kb_article_id ? infoTone : muted, cursor: 'pointer', fontFamily: 'inherit', maxWidth: '60px', opacity: 0.8 }} title="Link KB article">
                        <option value="">📖</option>
                        {kbArticles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                      </select>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                        <button onClick={() => moveItem(i, 'up')} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'transparent' : muted, fontSize: '10px', padding: '0 4px', lineHeight: 1, opacity: 0.5 }}>▲</button>
                        <button onClick={() => moveItem(i, 'down')} disabled={i === checklist.length - 1} style={{ background: 'none', border: 'none', cursor: i === checklist.length - 1 ? 'default' : 'pointer', color: i === checklist.length - 1 ? 'transparent' : muted, fontSize: '10px', padding: '0 4px', lineHeight: 1, opacity: 0.5 }}>▼</button>
                      </div>
                      <select
                        value={item.assigned_to || ''}
                        onChange={e => {
                          supabase.from('checklist_items').update({ assigned_to: e.target.value || null }).eq('id', item.id)
                          setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, assigned_to: e.target.value || null } : c))
                        }}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: `0.5px solid ${border}`, background: inputBg, color: item.assigned_to ? text : muted, cursor: 'pointer', fontFamily: 'inherit', maxWidth: '130px' }}
                      >
                        <option value="">Unassigned</option>
                        {allTeam.map(m => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
                      </select>
                      {assignee && (
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                          {assignee.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={async () => {
                  const t = prompt('New step:')
                  if (!t || !uuid) return
                  const { data } = await supabase.from('checklist_items').insert({ production_id: uuid, title: t, sort_order: checklist.length, completed: false }).select('*').single()
                  if (data) setChecklist(prev => [...prev, data])
                }}
                style={{ marginTop: '10px', fontSize: '12px', color: muted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 0' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add step
              </button>
            </div>
          )}

          {/* Linked tasks */}
          {linkedTasks.length > 0 && (
            <div style={{ marginTop: '16px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 10px' }}>Tasks ({linkedTasks.length})</p>
              {linkedTasks.map((task, i) => {
                const assignee = allTeam.find(m => m.id === task.assigned_to)
                const statusColors: Record<string, string> = { pending: '#94a3b8', 'in progress': '#f59e0b', 'in review': '#a855f7', complete: successTone }
                const sc = statusColors[task.status] || '#94a3b8'
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < linkedTasks.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc, flexShrink: 0 }} />
                    <Link href="/dashboard/tasks" style={{ flex: 1, fontSize: '14px', color: text, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{task.title}</Link>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${sc}20`, color: sc }}>{task.status}</span>
                    {task.due_date && <span style={{ fontSize: '11px', color: muted }}>{formatMonthDay(task.due_date)}</span>}
                    {assignee && (
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>{assignee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
  )
}
