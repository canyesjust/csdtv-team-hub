'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SIGNAGE_LOGIN_PATH } from '@/lib/auth-constants'
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
  /**
   * True when this person holds individual SCREEN grants only — no whole-location
   * grant anywhere. They get their screens' content and settings and nothing
   * site-wide. Mirrors requireSignageSiteManagerApi on the server.
   */
  screenScoped: boolean
  /** When screenScoped, the exact screen ids they were granted. */
  grantedScreenIds: string[]
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
  const [screenScoped, setScreenScoped] = useState(false)
  const [grantedScreenIds, setGrantedScreenIds] = useState<string[]>([])

  const refreshCatalog = useCallback(async () => {
    if (!activeSiteId) { setAreas([]); setScreens([]); return }
    const [areasRes, screensRes] = await Promise.all([
      supabase.from('signage_areas').select('id, name, slug').eq('site_id', activeSiteId).order('sort_order'),
      supabase.from('signage_screens').select('id, code, name, area_id, building').eq('site_id', activeSiteId).order('code'),
    ])
    setAreas(areasRes.data || [])
    // RLS already hides screens a screen-scoped user wasn't granted, but filter
    // here too so the UI is right even if the policy is ever relaxed.
    const allowed = new Set(grantedScreenIds)
    const rows = screensRes.data || []
    setScreens(screenScoped ? rows.filter(r => allowed.has(r.id)) : rows)
  }, [supabase, activeSiteId, screenScoped, grantedScreenIds])

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
     try {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace(SIGNAGE_LOGIN_PATH); return }

      const { data: user, error: userError } = await supabase
        .from('team')
        .select('id, role, signage_approver, signage_role')
        .eq('supabase_user_id', session.user.id)
        .single()
      if (cancelled) return
      if (userError) throw userError

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

      // Non-managers are scoped by their grants. Two kinds stack:
      //   signage_site_access   -> the whole location
      //   signage_screen_access -> one screen, plus read of the location it's in
      // No grants of either kind = all active sites, so an approver who predates
      // the access model isn't locked out.
      if (!managerRole && user?.id) {
        const [siteGrantRes, screenGrantRes] = await Promise.all([
          supabase.from('signage_site_access').select('site_id').eq('team_id', user.id),
          supabase.from('signage_screen_access').select('screen_id').eq('team_id', user.id),
        ])
        if (cancelled) return
        const siteGrants = new Set((siteGrantRes.data || []).map(r => r.site_id as string))
        const screenGrants = (screenGrantRes.data || []).map(r => r.screen_id as string)

        // Signage-only editors can't predate the access model, so for them an
        // empty grant set means no access at all, not the legacy "sees
        // everything" fallback. Mirrors resolveSignageScope() on the server.
        if (signageEditor && siteGrants.size === 0 && screenGrants.length === 0) {
          list = []
        } else if (siteGrants.size > 0 || screenGrants.length > 0) {
          const screenSiteIds = new Set<string>()
          if (screenGrants.length > 0) {
            const { data: grantedScreens } = await supabase
              .from('signage_screens')
              .select('id, site_id')
              .in('id', screenGrants)
            if (cancelled) return
            for (const row of grantedScreens || []) {
              if (row.site_id) screenSiteIds.add(row.site_id as string)
            }
          }
          list = list.filter(s => siteGrants.has(s.id) || screenSiteIds.has(s.id))
          setGrantedScreenIds(screenGrants)
          // Screen-scoped means: screens but no location anywhere.
          setScreenScoped(siteGrants.size === 0 && screenGrants.length > 0)
        }
      }

      setSites(list)
      let stored = ''
      try { stored = window.localStorage.getItem(SITE_STORAGE_KEY) || '' } catch { /* ignore */ }
      setActiveSiteId(list.find(s => s.id === stored)?.id || list[0]?.id || '')
      setAccess('ok')
     } catch (err) {
      // Any failure in the init query (auth, team lookup, sites) must not leave
      // the whole signage area stuck on the loader forever — fail closed.
      if (!cancelled) {
        console.error('Signage init failed', err)
        setAccess('denied')
      }
     }
    })()
    return () => { cancelled = true }
  }, [supabase, router])

  // (Re)load the catalog whenever the active site changes.
  useEffect(() => {
    if (access === 'ok') void refreshCatalog()
  }, [access, refreshCatalog])

  // Approvers (not editors) only ever get the content queue.
  useEffect(() => {
    if (access !== 'ok' || isManager) return
    if (!pathname.startsWith('/dashboard/signage/content')) {
      router.replace('/dashboard/signage/content')
    }
  }, [access, isManager, pathname, router])

  // Screen-scoped editors get their content plus their screens' own settings.
  // Everything else in the tool is site-wide, so bounce them back to content.
  useEffect(() => {
    if (access !== 'ok' || !screenScoped) return
    const allowed = [
      '/dashboard/signage/content',
      '/dashboard/signage/screens',
      '/dashboard/signage/layout-builder',
    ]
    if (!allowed.some(prefix => pathname.startsWith(prefix))) {
      router.replace('/dashboard/signage/content')
    }
  }, [access, screenScoped, pathname, router])

  const value = useMemo(
    () => ({
      ready: access === 'ok',
      isManager,
      isApprover,
      screenScoped,
      grantedScreenIds,
      areas,
      screens,
      sites,
      activeSiteId,
      setActiveSite,
      refreshCatalog,
      refreshSites,
    }),
    [access, isManager, isApprover, screenScoped, grantedScreenIds, areas, screens, sites, activeSiteId, setActiveSite, refreshCatalog, refreshSites],
  )

  if (access === 'loading') return <Loader />
  if (access === 'denied') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Manager or signage approver access required.</p>
      </div>
    )
  }
  if (sites.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>No screens assigned yet</p>
        <p style={{ opacity: 0.7, fontSize: 14 }}>
          Your account has signage access, but nobody has given you a location or a screen to manage.
          Ask a signage manager to assign you under Signage → Access.
        </p>
      </div>
    )
  }

  return <SignageContext.Provider value={value}>{children}</SignageContext.Provider>
}
