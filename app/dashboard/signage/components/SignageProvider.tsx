'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'
import type { SignageArea, SignageScreen } from './SignageAdmin'

type AccessState = 'loading' | 'ok' | 'denied'

export type SignageSite = { id: string; name: string; slug: string; accent: string | null }

type SiteSelectRow = { id: string; name: string; slug: string; bg_color: string | null; school_code: string | null }

// A location's rail/chip color is its MAIN brand color: the school's
// primary_color (authoritative, from the schools table) wins, then the site's
// saved bg_color, otherwise a Canyons-navy default is applied where it's used.
// The yellow accent_color is intentionally not used for the rail.
function mapSite(r: SiteSelectRow, schoolPrimary: Map<string, string>): SignageSite {
  const code = (r.school_code || '').toLowerCase()
  return { id: r.id, name: r.name, slug: r.slug, accent: schoolPrimary.get(code) || r.bg_color || null }
}

const SITE_SELECT = 'id, name, slug, bg_color, school_code'

async function loadSchoolPrimary(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('schools')
    .select('code, primary_color')
    .not('primary_color', 'is', null)
  const map = new Map<string, string>()
  for (const row of (data as { code: string | null; primary_color: string | null }[]) || []) {
    if (row.code && row.primary_color) map.set(row.code.toLowerCase(), row.primary_color)
  }
  return map
}

const SITE_STORAGE_KEY = 'cic-signage-active-site'

type SignageContextValue = {
  ready: boolean
  isManager: boolean
  isApprover: boolean
  areas: SignageArea[]
  screens: SignageScreen[]
  sites: SignageSite[]
  activeSiteId: string
  setActiveSite: (id: string) => void
  refreshCatalog: () => Promise<void>
  refreshSites: () => Promise<void>
}

const SignageContext = createContext<SignageContextValue | null>(null)

export function useSignage(): SignageContextValue {
  const ctx = useContext(SignageContext)
  if (!ctx) throw new Error('useSignage must be used within SignageProvider')
  return ctx
}

export function SignageProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const [access, setAccess] = useState<AccessState>('loading')
  const [isManager, setIsManager] = useState(false)
  const [isApprover, setIsApprover] = useState(false)
  const [areas, setAreas] = useState<SignageArea[]>([])
  const [screens, setScreens] = useState<SignageScreen[]>([])
  const [sites, setSites] = useState<SignageSite[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string>('')

  const refreshCatalog = useCallback(async () => {
    if (!activeSiteId) { setAreas([]); setScreens([]); return }
    const [areasRes, screensRes] = await Promise.all([
      supabase.from('signage_areas').select('id, name, slug').eq('site_id', activeSiteId).order('sort_order'),
      supabase.from('signage_screens').select('id, code, name, area_id, building').eq('site_id', activeSiteId).order('code'),
    ])
    setAreas(areasRes.data || [])
    setScreens(screensRes.data || [])
  }, [supabase, activeSiteId])

  const refreshSites = useCallback(async () => {
    const [{ data }, schoolPrimary] = await Promise.all([
      supabase.from('signage_sites').select(SITE_SELECT).eq('active', true).order('sort_order'),
      loadSchoolPrimary(supabase),
    ])
    setSites(((data as SiteSelectRow[]) || []).map(r => mapSite(r, schoolPrimary)))
  }, [supabase])

  const setActiveSite = useCallback((id: string) => {
    setActiveSiteId(id)
    try { window.localStorage.setItem(SITE_STORAGE_KEY, id) } catch { /* ignore */ }
  }, [])

  // Resolve access and load the sites this user can work in (once).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/login'); return }

      const { data: user } = await supabase
        .from('team')
        .select('id, role, signage_approver, signage_role')
        .eq('supabase_user_id', session.user.id)
        .single()
      if (cancelled) return

      const managerRole = user?.role === 'Manager'
      const signageEditor = user?.signage_role === 'editor'
      const approver = Boolean(user?.signage_approver)
      // Editors can manage all signage pages; approvers get the limited content view.
      const canManage = managerRole || signageEditor
      setIsManager(canManage)
      setIsApprover(approver)
      if (!canManage && !approver) { setAccess('denied'); return }

      const [{ data: siteRows }, schoolPrimary] = await Promise.all([
        supabase.from('signage_sites').select(SITE_SELECT).eq('active', true).order('sort_order'),
        loadSchoolPrimary(supabase),
      ])
      if (cancelled) return

      let list: SignageSite[] = ((siteRows as SiteSelectRow[]) || []).map(r => mapSite(r, schoolPrimary))

      // Non-managers are scoped to the sites they've been granted access to.
      // If they have no explicit grants, fall back to all active sites so an
      // approver who predates the access model isn't locked out.
      if (!managerRole && user?.id) {
        const { data: accessRows } = await supabase
          .from('signage_site_access')
          .select('site_id')
          .eq('team_id', user.id)
        if (cancelled) return
        const allowed = new Set((accessRows || []).map(r => r.site_id))
        if (allowed.size > 0) list = list.filter(s => allowed.has(s.id))
      }

      setSites(list)
      let stored = ''
      try { stored = window.localStorage.getItem(SITE_STORAGE_KEY) || '' } catch { /* ignore */ }
      setActiveSiteId(list.find(s => s.id === stored)?.id || list[0]?.id || '')
      setAccess('ok')
    })()
    return () => { cancelled = true }
  }, [supabase, router])

  // (Re)load the catalog whenever the active site changes.
  useEffect(() => {
    if (access === 'ok') void refreshCatalog()
  }, [access, refreshCatalog])

  useEffect(() => {
    if (access !== 'ok' || isManager) return
    if (!pathname.startsWith('/dashboard/signage/content')) {
      router.replace('/dashboard/signage/content')
    }
  }, [access, isManager, pathname, router])

  const value = useMemo(
    () => ({
      ready: access === 'ok',
      isManager,
      isApprover,
      areas,
      screens,
      sites,
      activeSiteId,
      setActiveSite,
      refreshCatalog,
      refreshSites,
    }),
    [access, isManager, isApprover, areas, screens, sites, activeSiteId, setActiveSite, refreshCatalog, refreshSites],
  )

  if (access === 'loading') return <Loader />
  if (access === 'denied') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Manager or signage approver access required.</p>
      </div>
    )
  }

  return <SignageContext.Provider value={value}>{children}</SignageContext.Provider>
}
