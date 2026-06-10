'use client'

import { Suspense } from 'react'
import ScreenClient from './ScreenClient'

export default function SignageScreenPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#162844', color: '#96b7c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        Loading…
      </div>
    }>
      <ScreenClient />
    </Suspense>
  )
}
