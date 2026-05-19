'use client'

import { use } from 'react'
import ControlSurfaceClient from '@/app/dashboard/board-meetings/[productionId]/control/ControlSurfaceClient'

export default function ControlSurfacePage({ params }: { params: Promise<{ productionId: string }> }) {
  const { productionId } = use(params)
  return (
    <div
      style={{
        padding: '16px 20px 24px',
        minHeight: '100%',
        maxWidth: '1600px',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <ControlSurfaceClient productionId={productionId} />
    </div>
  )
}
