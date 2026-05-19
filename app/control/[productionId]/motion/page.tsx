'use client'

import { use } from 'react'
import MotionScreenClient from './MotionScreenClient'

export default function MotionScreenPage({ params }: { params: Promise<{ productionId: string }> }) {
  const { productionId } = use(params)
  return (
    <div className="motion-screen">
      <MotionScreenClient productionId={productionId} />
    </div>
  )
}
