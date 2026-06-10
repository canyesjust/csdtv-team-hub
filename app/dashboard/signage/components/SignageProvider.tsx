'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'
import type { SignageArea, SignageScreen } from './SignageAdmin'

type AccessState = 'loading' | 'ok' | 'denied'

type SignageContextValue = {
  ready: boolean
  isManager: boolean
  isApprover: boolean
  areas: SignageArea[]
  screens: SignageScreen[]
  refreshCatalog: () => Promise<void>
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

  const refreshCatalog = useCallback(async () => {
    const [areasRes, screensRes] = await Promise.all([
      supabase.from('signage_areas').select('id, name, slug').order('sort_order'),
      supabase.from('signage_screens').select('id, code, name, area_id').order('code'),
    ])
    setAreas(areasRes.data || [])
    setScreens(screensRes.data || [])
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        router.replace('/login')
        return
      }
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

      if (!manager && !approver) {
        setAccess('denied')
        return
      }

      setAccess('ok')
      await refreshCatalog()
    })()
    return () => { cancelled = true }
  }, [supabase, router, refreshCatalog])

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
      refreshCatalog,
    }),
    [access, isManager, isApprover, areas, screens, refreshCatalog],
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
