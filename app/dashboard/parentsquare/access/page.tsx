'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { uiStyles } from '@/lib/ui/styles'

type TeamMember = { id: string; name: string | null; role: string; parentsquare_access: boolean }

export default function ParentSquareAccessPage() {
  const supabase = useMemo(() => createClient(), [])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('team')
      .select('id, name, role, parentsquare_access')
      .eq('active', true)
      .order('name')
    setTeam((data as TeamMember[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const nonManagers = team.filter(m => m.role !== 'Manager')

  const setAccess = useCallback(async (memberId: string, grant: boolean) => {
    setSavingId(memberId)
    const res = await fetch('/api/parentsquare/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: memberId, parentsquare_access: grant }),
    })
    setSavingId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast(data.error || 'Could not update access', 'error')
      return
    }
    setTeam(prev => prev.map(m => (m.id === memberId ? { ...m, parentsquare_access: grant } : m)))
    toast(grant ? 'ParentSquare access granted' : 'ParentSquare access removed', 'success')
  }, [])

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>ParentSquare access</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
        Managers always have ParentSquare access. Grant it to anyone else who needs to work in this section.
      </p>

      {nonManagers.length === 0 ? (
        <div style={{ ...uiStyles.card, padding: 16, color: 'var(--text-muted)' }}>No non-manager team members to assign.</div>
      ) : (
        <div style={{ ...uiStyles.card, padding: 16, display: 'grid', gap: 4 }}>
          {nonManagers.map(m => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={m.parentsquare_access}
                disabled={savingId === m.id}
                onChange={e => void setAccess(m.id, e.target.checked)}
              />
              {m.name || '(unnamed)'} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.role}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
