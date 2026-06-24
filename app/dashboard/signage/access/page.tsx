'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'

type SiteRow = { id: string; name: string; slug: string; active: boolean; sort_order: number }
type TeamMember = { id: string; name: string | null; role: string; signage_approver: boolean }

export default function SignageAccessPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])

  const [sites, setSites] = useState<SiteRow[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [access, setAccess] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [savingSite, setSavingSite] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [siteRes, teamRes, accessRes] = await Promise.all([
      supabase.from('signage_sites').select('id, name, slug, active, sort_order').order('sort_order'),
      supabase.from('team').select('id, name, role, signage_approver').eq('active', true).order('name'),
      supabase.from('signage_site_access').select('team_id, site_id'),
    ])
    setSites((siteRes.data as SiteRow[]) || [])
    setTeam((teamRes.data as TeamMember[]) || [])
    const map: Record<string, string[]> = {}
    for (const row of (accessRes.data as { team_id: string; site_id: string }[]) || []) {
      ;(map[row.site_id] ||= []).push(row.team_id)
    }
    setAccess(map)
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const nonManagers = team.filter(m => m.role !== 'Manager')

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

  if (loading) {
    return (
      <SignagePageShell title="Site access" subtitle="Who can manage each location">
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      </SignagePageShell>
    )
  }

  return (
    <SignagePageShell title="Site access" subtitle="Who can manage each location">
      <p style={{ fontSize: 13, color: s.muted, maxWidth: 640, margin: '0 0 16px', lineHeight: 1.5 }}>
        Managers always see every site, so they aren&apos;t listed here. Grant a non-manager access to a site and
        they&apos;ll only see that site&apos;s screens, content, and areas. People with no grants fall back to all
        sites (legacy behavior) until the per-site database policy is enabled.
      </p>

      {nonManagers.length === 0 && (
        <div style={{ ...s.card, color: s.muted }}>No non-manager team members to assign.</div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
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
    </SignagePageShell>
  )
}
