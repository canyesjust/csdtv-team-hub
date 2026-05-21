'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Loader from '../components/Loader'

/** @deprecated Use /dashboard/board-meetings?tab=email */
export default function BoardUpdateRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/board-meetings?tab=email')
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )
}
