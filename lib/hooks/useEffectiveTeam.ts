'use client'

import { useEffect, useState } from 'react'
import {
  fetchEffectiveTeam,
  type EffectiveTeamMember,
  type EffectiveTeamResponse,
} from '@/lib/effective-team-client'

type UseEffectiveTeamResult = {
  loading: boolean
  team: EffectiveTeamMember | null
  isViewAs: boolean
  actorName: string | null
  refresh: () => void
}

export function useEffectiveTeam(): UseEffectiveTeamResult {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<EffectiveTeamResponse | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchEffectiveTeam().then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tick])

  return {
    loading,
    team: data?.team ?? null,
    isViewAs: data?.isViewAs ?? false,
    actorName: data?.actor?.name ?? null,
    refresh: () => setTick((t) => t + 1),
  }
}
