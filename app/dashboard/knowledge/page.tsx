'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Loader from '../components/Loader'

function KnowledgeRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const article = searchParams.get('article')
    const q = new URLSearchParams({ tab: 'articles' })
    if (article) q.set('article', article)
    router.replace(`/dashboard/library?${q.toString()}`)
  }, [router, searchParams])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )
}

/** @deprecated Use /dashboard/library?tab=articles */
export default function KnowledgeRedirectPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <Loader />
        </div>
      }
    >
      <KnowledgeRedirectContent />
    </Suspense>
  )
}
