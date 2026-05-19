'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import Loader from '../../../components/Loader'
import PlaylistEditor from '../../components/PlaylistEditor'
import { toast } from '@/lib/toast'

export default function TemplateEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = use(params)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/playlist-templates/${templateId}`)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load', 'error')
      setLoading(false)
      return
    }
    setName(body.template?.name || '')
    setLoading(false)
  }, [templateId])

  useEffect(() => { load() }, [load])

  if (loading) return <Loader />

  return (
    <div>
      <p style={{ margin: '0 0 16px' }}>
        <Link href="/dashboard/board-meetings" style={{ color: 'var(--brand-primary)', fontSize: '14px' }}>← Board Meetings</Link>
      </p>
      <h1 style={{ margin: '0 0 8px', fontSize: '22px' }}>{name || 'Playlist template'}</h1>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-muted)' }}>Edit template items. Meetings copy this structure when you apply the template.</p>
      <PlaylistEditor mode="template" templateId={templateId} />
    </div>
  )
}
