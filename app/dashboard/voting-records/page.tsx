'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Loader from '../components/Loader'

/** @deprecated Use /dashboard/board-meetings?tab=voting */
export default function VotingRecordsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/board-meetings?tab=voting')
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )
}
