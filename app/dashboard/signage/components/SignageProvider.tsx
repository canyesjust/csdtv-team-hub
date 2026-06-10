'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'
import type { SignageArea, SignageScreen } from './SignageAdmin'

type AccessState = 'loading' | 'ok' | 'denied'

export type SignageSite = { id: string; name: string; slug: string }

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
      supabase.from('signage_screens').select('id, code, name, area_id').eq('site_id', activeSiteId).order('code'),
    ])
    setAreas(areasRes.data || [])
    setScreens(screensRes.data || [])
  }, [supabase, activeSiteId])

  const refreshSites = useCallback(async () => {
    const { data } = await supabase
      .from('signage_sites')
      .select('id, name, slug')
      .eq('active', true)
      .order('sort_order')
    setSites(data || [])
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
        .select('role, signage_approver')
        .eq('supabase_user_id', session.user.id)
        .single()
      if (cancelled) return

      const manager = user?.role === 'Manager'
      const approver = Boolean(user?.signage_approver)
      setIsManager(manager)
      setIsApprover(approver)
      if (!manager && !approver) { setAccess('denied'); return }

      const { data: siteRows } = await supabase
        .from('signage_sites')
        .select('id, name, slug')
        .eq('active', true)
        .order('sort_order')
      if (cancelled) return

      const list: SignageSite[] = siteRows || []
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
