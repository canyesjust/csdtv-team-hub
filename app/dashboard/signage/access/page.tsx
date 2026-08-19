'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'

type SiteRow = { id: string; name: string; slug: string; active: boolean; sort_order: number }
type ScreenRow = { id: string; code: string; name: string; site_id: string | null; active: boolean }
type TeamMember = { id: string; name: string | null; role: string; signage_approver: boolean; signage_role: string | null }

export default function SignageAccessPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])

  const [sites, setSites] = useState<SiteRow[]>([])
  const [screens, setScreens] = useState<ScreenRow[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [access, setAccess] = useState<Record<string, string[]>>({})
  const [screenAccess, setScreenAccess] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [savingSite, setSavingSite] = useState<string | null>(null)
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [savingScreens, setSavingScreens] = useState<string | null>(null)
  const [openMember, setOpenMember] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [siteRes, screenRes, teamRes, accessRes, screenAccessRes] = await Promise.all([
      supabase.from('signage_sites').select('id, name, slug, active, sort_order').order('sort_order'),
      supabase.from('signage_screens').select('id, code, name, site_id, active').order('code'),
      supabase.from('team').select('id, name, role, signage_approver, signage_role').eq('active', true).order('name'),
      supabase.from('signage_site_access').select('team_id, site_id'),
      fetch('/api/signage/sites/screen-access').then(r => r.json()).catch(() => ({ grants: [] })),
    ])
    setSites((siteRes.data as SiteRow[]) || [])
    setScreens((screenRes.data as ScreenRow[]) || [])
    setTeam((teamRes.data as TeamMember[]) || [])

    const map: Record<string, string[]> = {}
    for (const row of (accessRes.data as { team_id: string; site_id: string }[]) || []) {
      ;(map[row.site_id] ||= []).push(row.team_id)
    }
    setAccess(map)

    const byMember: Record<string, string[]> = {}
    for (const row of (screenAccessRes?.grants as { team_id: string; screen_id: string }[]) || []) {
      ;(byMember[row.team_id] ||= []).push(row.screen_id)
    }
    setScreenAccess(byMember)
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const nonManagers = team.filter(m => m.role !== 'Manager')
  const siteName = useCallback(
    (id: string | null) => sites.find(x => x.id === id)?.name || 'No location',
    [sites],
  )

  const persist = useCallback(async (siteId: string, teamIds: string[]) => {
    setSavingSite(siteId)
    const res = await fetch('/api/signage/sites/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, team_ids: teamIds }),
    })
    setSavingSite(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast(data.error || 'Save failed', 'error')
      void load()
      return
    }
    toast('Access updated', 'success')
  }, [load])

  const toggle = (siteId: string, memberId: string) => {
    setAccess(prev => {
      const current = prev[siteId] || []
      const next = current.includes(memberId) ? current.filter(x => x !== memberId) : [...current, memberId]
      void persist(siteId, next)
      return { ...prev, [siteId]: next }
    })
  }

  const persistScreens = useCallback(async (memberId: string, screenIds: string[]) => {
    setSavingScreens(memberId)
    const res = await fetch('/api/signage/sites/screen-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: memberId, screen_ids: screenIds }),
    })
    setSavingScreens(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast(data.error || 'Save failed', 'error')
      void load()
      return
    }
    toast('Screen access updated', 'success')
  }, [load])

  const toggleScreen = (memberId: string, screenId: string) => {
    setScreenAccess(prev => {
      const current = prev[memberId] || []
      const next = current.includes(screenId) ? current.filter(x => x !== screenId) : [...current, screenId]
      void persistScreens(memberId, next)
      return { ...prev, [memberId]: next }
    })
  }

  const setEditor = useCallback(async (memberId: string, makeEditor: boolean) => {
    setSavingRole(memberId)
    const res = await fetch('/api/signage/approvers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: memberId, signage_role: makeEditor ? 'editor' : null }),
    })
    setSavingRole(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast(data.error || 'Could not update role', 'error')
      return
    }
    setTeam(prev => prev.map(m => (m.id === memberId ? { ...m, signage_role: makeEditor ? 'editor' : null } : m)))
    toast(makeEditor ? 'Signage editor access granted' : 'Signage editor access removed', 'success')
  }, [])

  /** One-line plain-English summary of what a person can actually reach. */
  const reachLabel = (memberId: string): string => {
    const siteGrants = sites.filter(site => (access[site.id] || []).includes(memberId))
    const screenGrants = screenAccess[memberId] || []
    if (siteGrants.length === 0 && screenGrants.length === 0) return 'All locations (no grants set)'
    const parts: string[] = []
    if (siteGrants.length) parts.push(siteGrants.map(x => x.name).join(', '))
    if (screenGrants.length) parts.push(`${screenGrants.length} screen${screenGrants.length === 1 ? '' : 's'}`)
    return parts.join(' + ')
  }

  if (loading) {
    return (
      <SignagePageShell title="Access" subtitle="Who can manage which locations and screens">
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      </SignagePageShell>
    )
  }

  const screensBySite = sites
    .map(site => ({ site, list: screens.filter(sc => sc.site_id === site.id) }))
    .filter(g => g.list.length > 0)
  const orphanScreens = screens.filter(sc => !sc.site_id || !sites.some(x => x.id === sc.site_id))

  return (
    <SignagePageShell title="Access" subtitle="Who can manage which locations and screens">
      <p style={{ fontSize: 13, color: s.muted, maxWidth: 680, margin: '0 0 20px', lineHeight: 1.55 }}>
        Managers always see everything, so they aren&apos;t listed here. Grants stack: a <strong>location</strong> grant
        hands someone the whole site. A <strong>screen</strong> grant hands them one screen and nothing else, no
        announcements, areas, branding, or live takeover. Someone with no grants at all still falls back to every
        location, which is the old behavior.
      </p>

      {nonManagers.length === 0 && (
        <div style={{ ...s.card, color: s.muted }}>No non-manager team members to assign.</div>
      )}

      {nonManagers.length > 0 && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, color: s.text, fontSize: 14, marginBottom: 2 }}>Signage-only editors</div>
          <div style={{ fontSize: 12, color: s.muted, marginBottom: 12, lineHeight: 1.5 }}>
            A signage editor signs in to this tool only, no other part of the Hub. Pair with a location or screen grant below to scope them.
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {nonManagers.map(m => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
                <input
                  type="checkbox"
                  checked={m.signage_role === 'editor'}
                  disabled={savingRole === m.id}
                  onChange={e => void setEditor(m.id, e.target.checked)}
                />
                {m.name || '(unnamed)'}{' '}
                <span style={{ fontSize: 11, color: s.muted }}>{m.signage_role === 'editor' ? 'signage editor' : m.role}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ ...s.h3, marginBottom: 4 }}>Whole locations</h3>
      <p style={{ fontSize: 12.5, color: s.muted, margin: '0 0 12px' }}>
        Full run of a site: every screen, plus areas, announcements, wayfinding, branding, and live takeover.
      </p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginBottom: 28 }}>
        {sites.map(site => {
          const granted = access[site.id] || []
          return (
            <div key={site.id} style={{ ...s.card, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, color: s.text, fontSize: 14 }}>{site.name}</div>
                  <div style={{ fontSize: 11, color: s.muted }}>{site.slug}{site.active ? '' : ' · inactive'}</div>
                </div>
                <span style={{ fontSize: 11, color: s.muted }}>
                  {savingSite === site.id ? 'Saving…' : `${granted.length} assigned`}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {nonManagers.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
                    <input type="checkbox" checked={granted.includes(m.id)} onChange={() => toggle(site.id, m.id)} />
                    {m.name || '(unnamed)'} <span style={{ fontSize: 11, color: s.muted }}>{m.signage_approver ? 'approver' : m.role}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <h3 style={{ ...s.h3, marginBottom: 4 }}>Single screens</h3>
      <p style={{ fontSize: 12.5, color: s.muted, margin: '0 0 12px', maxWidth: 680, lineHeight: 1.55 }}>
        Pick a person, then tick the screens they run. They&apos;ll see only those screens: they can post and schedule
        content on them and change each screen&apos;s own layout and theme. They can&apos;t publish to all screens,
        target an area or building, add or delete screens, or touch anything else in the location. A location grant
        above already covers every screen in that site, so don&apos;t tick both.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {nonManagers.map(m => {
          const mine = screenAccess[m.id] || []
          const open = openMember === m.id
          return (
            <div key={m.id} style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setOpenMember(open ? null : m.id)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '12px 14px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left', color: s.text, fontSize: 13.5,
                }}
              >
                <span>
                  <span style={{ fontWeight: 600 }}>{m.name || '(unnamed)'}</span>{' '}
                  <span style={{ fontSize: 11.5, color: s.muted }}>
                    {m.signage_role === 'editor' ? 'signage editor' : m.role}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: s.muted, marginTop: 2 }}>
                    {savingScreens === m.id ? 'Saving…' : reachLabel(m.id)}
                  </span>
                </span>
                <span aria-hidden style={{ color: s.muted, fontSize: 12 }}>{open ? '▾' : '▸'}</span>
              </button>

              {open && (
                <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
                  {[...screensBySite, ...(orphanScreens.length ? [{ site: null, list: orphanScreens }] : [])].map(group => (
                    <div key={group.site?.id ?? 'orphan'}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: s.muted, margin: '0 0 5px' }}>
                        {group.site ? group.site.name : siteName(null)}
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {group.list.map(sc => (
                          <label key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
                            <input
                              type="checkbox"
                              checked={mine.includes(sc.id)}
                              disabled={savingScreens === m.id}
                              onChange={() => toggleScreen(m.id, sc.id)}
                            />
                            {sc.name}
                            <span style={{ fontSize: 11, color: s.muted, fontFamily: 'ui-monospace, monospace' }}>/{sc.code}</span>
                            {!sc.active && <span style={{ fontSize: 11, color: s.muted }}>· inactive</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {screens.length === 0 && (
                    <div style={{ fontSize: 12.5, color: s.muted }}>No screens exist yet.</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SignagePageShell>
  )
}
