'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../components/Loader'

export default function SignageDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')
  const isContentRoute = pathname.startsWith('/dashboard/signage/content')

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      const { data: user } = await supabase
        .from('team')
        .select('role, signage_approver')
        .eq('supabase_user_id', session.user.id)
        .single()

      const manager = user?.role === 'Manager'
      const approver = Boolean(user?.signage_approver)
      if (manager || (isContentRoute && approver)) {
        setState('ok')
        return
      }
      if (approver && !isContentRoute) {
        router.replace('/dashboard/signage/content')
        return
      }
      setState('denied')
    })()
  }, [supabase, router, isContentRoute, pathname])

  if (state === 'loading') return <Loader />
  if (state === 'denied') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Manager or signage approver access required.</p>
      </div>
    )
  }
  return <>{children}</>
}
