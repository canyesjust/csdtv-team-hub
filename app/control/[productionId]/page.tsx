'use client'

import { use } from 'react'
import ControlSurfaceClient from '@/app/dashboard/board-meetings/[productionId]/control/ControlSurfaceClient'

export default function ControlSurfacePage({ params }: { params: Promise<{ productionId: string }> }) {
  const { productionId } = use(params)
  return (
    <div className="control-page">
      <ControlSurfaceClient productionId={productionId} />
    </div>
  )
}
