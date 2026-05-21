'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Loader from '../components/Loader'

/** @deprecated Use /dashboard/library?tab=links */
export default function QuickLinksRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/library?tab=links')
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )
}
