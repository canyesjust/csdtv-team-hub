'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import OnboardingChecklist from '../../components/OnboardingChecklist'
import {
  ONBOARDING_ASSIGNMENT_STATUS,
  ONBOARDING_TRACK_INTERN,
  ONBOARDING_TRACK_STUDENT_INTERN,
  trackIdForTeamRole,
} from '@/lib/onboarding/constants'
import {
  canSubmitForSignoff,
  groupInstancesByPhaseCategory,
  requiredProgress,
} from '@/lib/onboarding/checklist-utils'
import type {
  OnboardingAssignment,
  OnboardingCategory,
  OnboardingItemInstance,
  OnboardingPhase,
} from '@/lib/onboarding/types'

export default function OnboardingCoachPage() {
  const params = useParams()
  const teamId = params.teamId as string
  const router = useRouter()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [managerId, setManagerId] = useState<string | null>(null)
  const [member, setMember] = useState<{ id: string; name: string; avatar_color: string; role: string } | null>(null)
  const [assignment, setAssignment] = useState<OnboardingAssignment | null>(null)
  const [instances, setInstances] = useState<OnboardingItemInstance[]>([])
  const [phases, setPhases] = useState<OnboardingPhase[]>([])
  const [categories, setCategories] = useState<OnboardingCategory[]>([])
  const [notes, setNotes] = useState('')
  const [adhocTitle, setAdhocTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const { data: me } = await supabase
      .from('team')
      .select('id, role')
      .eq('supabase_user_id', session.user.id)
      .single()
    if (me?.role !== 'Manager') {
      router.replace('/dashboard/onboarding')
      return
    }
    setManagerId(me.id)

    const { data: tm } = await supabase.from('team').select('id, name, avatar_color, role').eq('id', teamId).single()
    if (!tm) {
      setLoading(false)
      return
    }
    setMember(tm)

    const trackId = trackIdForTeamRole(tm.role)
    if (!trackId) {
      setLoading(false)
      return
    }

    const [asnRes, phaseRes, catRes] = await Promise.all([
      supabase
        .from('onboarding_assignments')
        .select('*')
        .eq('team_member_id', teamId)
        .eq('track_id', trackId)
        .maybeSingle(),
      supabase.from('onboarding_phases').select('*').eq('track_id', trackId).order('sort_order'),
      supabase.from('onboarding_categories').select('*').eq('track_id', trackId).order('sort_order'),
    ])

    const asn = asnRes.data as OnboardingAssignment | null
    setAssignment(asn)
    setNotes(asn?.manager_notes || '')
    setPhases((phaseRes.data as OnboardingPhase[]) || [])
    setCategories((catRes.data as OnboardingCategory[]) || [])

    if (asn) {
      const { data: items } = await supabase
        .from('onboarding_item_instances')
        .select('*')
        .eq('assignment_id', asn.id)
        .order('sort_order')
      setInstances((items as OnboardingItemInstance[]) || [])
    }
    setLoading(false)
  }, [supabase, teamId, router])

  useEffect(() => {
    void load()
  }, [load])

  const toggleTask = async (task: OnboardingItemInstance) => {
    if (!assignment || !managerId || assignment.status === ONBOARDING_ASSIGNMENT_STATUS.complete) return
    const completed = !task.completed
    const completed_at = completed ? new Date().toISOString() : null
    const completed_by = completed ? managerId : null
    const { error } = await supabase
      .from('onboarding_item_instances')
      .update({ completed, completed_at, completed_by })
      .eq('id', task.id)
    if (error) {
      toast(error.message || 'Could not update checklist item', 'error')
      return
    }
    setInstances((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completed, completed_at, completed_by } : t,
      ),
    )
  }

  const removeForPerson = async (task: OnboardingItemInstance) => {
    if (!managerId || !confirm(`Remove "${task.title}" for ${member?.name}?`)) return
    const now = new Date().toISOString()
    await supabase
      .from('onboarding_item_instances')
      .update({ removed_at: now, removed_by: managerId })
      .eq('id', task.id)
    setInstances((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, removed_at: now, removed_by: managerId } : t)),
    )
  }

  const addAdHoc = async () => {
    if (!assignment || !adhocTitle.trim() || !phases[0] || !categories[0]) return
    const maxSort = instances.reduce((m, i) => Math.max(m, i.sort_order), 0)
    const { data, error } = await supabase
      .from('onboarding_item_instances')
      .insert({
        assignment_id: assignment.id,
        phase_id: phases[0].id,
        category_id: categories[0].id,
        title: adhocTitle.trim(),
        description: '',
        sort_order: maxSort + 1,
        required: false,
        is_ad_hoc: true,
      })
      .select('*')
      .single()
    if (!error && data) {
      setInstances((prev) => [...prev, data as OnboardingItemInstance])
      setAdhocTitle('')
    }
  }

  const saveNotes = async () => {
    if (!assignment) return
    setSaving(true)
    await supabase
      .from('onboarding_assignments')
      .update({ manager_notes: notes, updated_at: new Date().toISOString() })
      .eq('id', assignment.id)
    setSaving(false)
  }

  const signOff = async () => {
    if (!assignment || !managerId) return
    if (!confirm(`Sign off onboarding for ${member?.name}?`)) return
    const now = new Date().toISOString()
    await supabase
      .from('onboarding_assignments')
      .update({
        status: ONBOARDING_ASSIGNMENT_STATUS.complete,
        manager_signed_off_at: now,
        signed_off_by: managerId,
        updated_at: now,
      })
      .eq('id', assignment.id)
    setAssignment((a) =>
      a
        ? {
            ...a,
            status: ONBOARDING_ASSIGNMENT_STATUS.complete,
            manager_signed_off_at: now,
            signed_off_by: managerId,
          }
        : a,
    )
  }

  const reopen = async () => {
    if (!assignment) return
    await supabase
      .from('onboarding_assignments')
      .update({
        status: ONBOARDING_ASSIGNMENT_STATUS.reopened,
        trainee_submitted_at: null,
        manager_signed_off_at: null,
        signed_off_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
    setAssignment((a) =>
      a ? { ...a, status: ONBOARDING_ASSIGNMENT_STATUS.reopened, trainee_submitted_at: null } : a,
    )
  }

  const deleteAssignment = async () => {
    if (!assignment || !confirm(`Delete all onboarding progress for ${member?.name}?`)) return
    await supabase.from('onboarding_assignments').delete().eq('id', assignment.id)
    router.push('/dashboard/onboarding')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <Loader />
      </div>
    )
  }

  if (!member) {
    return <p style={{ color: muted }}>Team member not found.</p>
  }

  const trackId = trackIdForTeamRole(member.role)
  const trackName =
    trackId === ONBOARDING_TRACK_STUDENT_INTERN ? 'Student intern' : 'Staff intern'

  if (!assignment) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/dashboard/onboarding" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          ← Back
        </Link>
        <p style={{ marginTop: '16px', color: muted }}>Onboarding not started for {member.name}.</p>
      </div>
    )
  }

  const { requiredTotal, requiredDone, pct } = requiredProgress(instances)
  const grouped = groupInstancesByPhaseCategory(instances, phases, categories)
  const canCoach = assignment.status !== ONBOARDING_ASSIGNMENT_STATUS.complete

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Link
        href="/dashboard/onboarding"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '14px',
          color: muted,
          textDecoration: 'none',
          marginBottom: '16px',
        }}
      >
        ← All onboarding
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: member.avatar_color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: '#0a0f1e',
            }}
          >
            {member.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>{member.name}</h1>
            <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>
              {trackName} · {assignment.status.replace('_', ' ')}
            </p>
          </div>
        </div>
        <span style={{ fontSize: '14px', color: muted }}>
          {requiredDone}/{requiredTotal} ({pct}%)
        </span>
      </div>

      {assignment.status === ONBOARDING_ASSIGNMENT_STATUS.pending_signoff && (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: '16px',
            borderRadius: '10px',
            background: dark ? 'rgba(232,160,32,0.1)' : 'rgba(232,160,32,0.08)',
            border: '0.5px solid rgba(232,160,32,0.3)',
          }}
        >
          <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#e8a020' }}>
            Trainee submitted for sign-off
            {assignment.trainee_submitted_at
              ? ` · ${new Date(assignment.trainee_submitted_at).toLocaleString()}`
              : ''}
          </p>
          <button
            type="button"
            onClick={() => void signOff()}
            style={{
              fontSize: '14px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            Sign off onboarding
          </button>
        </div>
      )}

      <OnboardingChecklist
        grouped={grouped}
        canEdit={canCoach}
        onToggle={toggleTask}
        text={text}
        muted={muted}
        border={border}
        cardBg={cardBg}
      />

      {canCoach && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: muted, margin: 0 }}>Remove for this person</p>
          <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
            Open an item above and use the buttons below to remove individual rows (manager only).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {instances
              .filter((i) => !i.removed_at)
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => void removeForPerson(i)}
                  style={{
                    fontSize: '12px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: `0.5px solid ${border}`,
                    background: 'transparent',
                    color: muted,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Remove: {i.title.slice(0, 28)}
                  {i.title.length > 28 ? '…' : ''}
                </button>
              ))}
          </div>
        </div>
      )}

      {canCoach && (
        <div style={{ marginTop: '24px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 8px' }}>Add one-off item</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              value={adhocTitle}
              onChange={(e) => setAdhocTitle(e.target.value)}
              placeholder="Task title for this person only"
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `0.5px solid ${border}`,
                background: 'var(--surface-2)',
                color: text,
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => void addAdHoc()}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                background: '#1e6cb5',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '24px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 8px' }}>Manager notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `0.5px solid ${border}`,
            background: 'var(--surface-2)',
            color: text,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={() => void saveNotes()}
          disabled={saving}
          style={{
            marginTop: '8px',
            fontSize: '13px',
            padding: '8px 14px',
            borderRadius: '8px',
            border: `0.5px solid ${border}`,
            background: 'transparent',
            color: muted,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      <div style={{ marginTop: '28px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {assignment.status === ONBOARDING_ASSIGNMENT_STATUS.complete && (
          <button
            type="button"
            onClick={() => void reopen()}
            style={{
              fontSize: '13px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: `0.5px solid ${border}`,
              background: 'transparent',
              color: text,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reopen onboarding
          </button>
        )}
        {assignment.status === ONBOARDING_ASSIGNMENT_STATUS.in_progress &&
          canSubmitForSignoff(instances) && (
            <button
              type="button"
              onClick={() => void signOff()}
              style={{
                fontSize: '13px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Sign off early
            </button>
          )}
        <button
          type="button"
          onClick={() => void deleteAssignment()}
          style={{
            fontSize: '13px',
            padding: '8px 14px',
            borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            border: '0.5px solid rgba(239,68,68,0.2)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Delete onboarding
        </button>
      </div>
    </div>
  )
}
