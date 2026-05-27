'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'
import { isStudentInternRole } from '@/lib/roles'
import {
  PRODUCTION_DETAIL_SELECT,
  normalizeProductionRow,
  type DetailPanelCurrentUser,
  type DetailPanelTeamMember,
  type EmailTemplate,
  type ProductionDetail,
} from '@/lib/productions/detail-panel-shared'
import { ProductionDetailDrawerOverlay } from './ProductionDetailDrawerOverlay'

interface ProductionDrawerContextValue {
  openByProductionNumber: (productionNumber: number) => void
  close: () => void
  isOpen: boolean
}

const ProductionDrawerContext = createContext<ProductionDrawerContextValue | null>(null)

export function useProductionDrawer(): ProductionDrawerContextValue {
  const ctx = useContext(ProductionDrawerContext)
  if (!ctx) {
    throw new Error('useProductionDrawer must be used within ProductionDrawerProvider')
  }
  return ctx
}

export function ProductionDrawerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const [production, setProduction] = useState<ProductionDetail | null>(null)
  const [team, setTeam] = useState<DetailPanelTeamMember[]>([])
  const [currentUser, setCurrentUser] = useState<DetailPanelCurrentUser | null>(null)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [bootstrapped, setBootstrapped] = useState(false)
  const [opening, setOpening] = useState(false)

  const close = useCallback(() => {
    setProduction(null)
  }, [])

  const bootstrap = useCallback(async () => {
    if (bootstrapped) return
    const effective = await fetchEffectiveTeam()
    const user = effective?.team
    if (user) {
      setCurrentUser({
        id: user.id,
        name: user.name,
        email: user.email ?? '',
        role: user.role,
      })
    }
    if (user && isStudentInternRole(user.role)) {
      setTeam([])
      setEmailTemplates([])
      setBootstrapped(true)
      return
    }
    const [teamRes, tplRes] = await Promise.all([
      supabase.from('team').select('id, name, avatar_color, email').eq('active', true).order('name'),
      supabase.from('email_templates').select('*').order('sort_order'),
    ])
    setTeam((teamRes.data as DetailPanelTeamMember[]) || [])
    setEmailTemplates((tplRes.data as EmailTemplate[]) || [])
    setBootstrapped(true)
  }, [bootstrapped, supabase])

  const openByProductionNumber = useCallback(
    async (productionNumber: number) => {
      if (pathname.startsWith('/dashboard/productions')) {
        return
      }
      setOpening(true)
      try {
        await bootstrap()
        const { data, error } = await supabase
          .from('productions')
          .select(PRODUCTION_DETAIL_SELECT)
          .eq('production_number', productionNumber)
          .maybeSingle()
        if (error || !data) {
          toast('Could not load production', 'error')
          return
        }
        setProduction(normalizeProductionRow(data))
      } finally {
        setOpening(false)
      }
    },
    [bootstrap, pathname, supabase],
  )

  useEffect(() => {
    if (pathname.startsWith('/dashboard/productions')) {
      close()
    }
  }, [pathname, close])

  const value = useMemo(
    () => ({
      openByProductionNumber,
      close,
      isOpen: production !== null,
    }),
    [openByProductionNumber, close, production],
  )

  return (
    <ProductionDrawerContext.Provider value={value}>
      {children}
      {production && !pathname.startsWith('/dashboard/productions') && (
        <ProductionDetailDrawerOverlay
          production={production}
          setProduction={setProduction}
          team={team}
          currentUser={currentUser}
          emailTemplates={emailTemplates}
          onClose={close}
          opening={opening}
        />
      )}
    </ProductionDrawerContext.Provider>
  )
}
