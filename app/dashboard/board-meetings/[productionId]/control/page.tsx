'use client'

import { use } from 'react'
import ControlSurfaceClient from './ControlSurfaceClient'

export default function BoardMeetingControlPage({ params }: { params: Promise<{ productionId: string }> }) {
  const { productionId } = use(params)
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <ControlSurfaceClient productionId={productionId} />
    </div>
  )
}
