'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Loader from '../components/Loader'
import { isManagerRole, trackIdForTeamRole } from '@/lib/onboarding/constants'
import ManagerOverview from './components/ManagerOverview'
import TraineeOnboardingView from './components/TraineeOnboardingView'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      const effective = await fetchEffectiveTeam()
      setRole(effective?.team.role || null)
      setLoading(false)
    })()
  }, [supabase, router])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  if (isManagerRole(role)) {
    return <ManagerOverview />
  }

  if (trackIdForTeamRole(role)) {
    return <TraineeOnboardingView />
  }

  return (
    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
      Onboarding is available for interns and student interns. Managers can open it from More.
    </p>
  )
}
