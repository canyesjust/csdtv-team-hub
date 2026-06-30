'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../../components/Loader'
import { ONBOARDING_ASSIGNMENT_STATUS } from '@/lib/onboarding/constants'
import { trackIdForTeamRole } from '@/lib/onboarding/constants'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
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
import OnboardingChecklist from './OnboardingChecklist'
import { toast } from '@/lib/toast'

interface CurrentUser {
  id: string
  name: string
  role: string
}

export default function TraineeOnboardingView() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [assignment, setAssignment] = useState<OnboardingAssignment | null>(null)
  const [instances, setInstances] = useState<OnboardingItemInstance[]>([])
  const [phases, setPhases] = useState<OnboardingPhase[]>([])
  const [categories, setCategories] = useState<OnboardingCategory[]>([])
  const [submitting, setSubmitting] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const user = await resolveEffectiveTeamRow<{ id: string; name: string; role: string }>(
      supabase,
      'id, name, role',
    )
    if (!user) return
    setCurrentUser(user)

    const trackId = trackIdForTeamRole(user.role)
    if (!trackId) {
      setLoading(false)
      return
    }

    const [asnRes, phaseRes, catRes] = await Promise.all([
      supabase
        .from('onboarding_assignments')
        .select('*')
        .eq('team_member_id', user.id)
        .eq('track_id', trackId)
        .maybeSingle(),
      supabase.from('onboarding_phases').select('*').eq('track_id', trackId).order('sort_order'),
      supabase.from('onboarding_categories').select('*').eq('track_id', trackId).order('sort_order'),
    ])

    setPhases((phaseRes.data as OnboardingPhase[]) || [])
    setCategories((catRes.data as OnboardingCategory[]) || [])

    const asn = asnRes.data as OnboardingAssignment | null
    setAssignment(asn)

    if (asn) {
      const { data: items } = await supabase
        .from('onboarding_item_instances')
        .select('*')
        .eq('assignment_id', asn.id)
        .order('sort_order')
      setInstances((items as OnboardingItemInstance[]) || [])
    } else {
      setInstances([])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  const toggleTask = async (task: OnboardingItemInstance) => {
    if (!assignment || !currentUser) return
    if (assignment.status === ONBOARDING_ASSIGNMENT_STATUS.complete) return
    if (
      assignment.status === ONBOARDING_ASSIGNMENT_STATUS.pending_signoff &&
      !task.completed
    ) {
      return
    }

    const completed = !task.completed
    const completed_at = completed ? new Date().toISOString() : null
    const completed_by = completed ? currentUser.id : null

    const { error: toggleErr } = await supabase
      .from('onboarding_item_instances')
      .update({ completed, completed_at, completed_by })
      .eq('id', task.id)

    if (toggleErr) {
      toast(toggleErr.message || 'Could not update checklist item', 'error')
      return
    }

    setInstances((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completed, completed_at, completed_by } : t,
      ),
    )

    if (assignment.status === ONBOARDING_ASSIGNMENT_STATUS.pending_signoff && !completed) {
      const { error: reopenErr } = await supabase
        .from('onboarding_assignments')
        .update({
          status: ONBOARDING_ASSIGNMENT_STATUS.in_progress,
          trainee_submitted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignment.id)
      if (reopenErr) {
        toast(reopenErr.message || 'Could not update assignment status', 'error')
        return
      }
      setAssignment((a) =>
        a
          ? {
              ...a,
              status: ONBOARDING_ASSIGNMENT_STATUS.in_progress,
              trainee_submitted_at: null,
            }
          : a,
      )
    }
  }

  const submitForSignoff = async () => {
    if (!assignment || !canSubmitForSignoff(instances)) return
    setSubmitting(true)
    const now = new Date().toISOString()
    const { error: submitErr } = await supabase
      .from('onboarding_assignments')
      .update({
        status: ONBOARDING_ASSIGNMENT_STATUS.pending_signoff,
        trainee_submitted_at: now,
        updated_at: now,
      })
      .eq('id', assignment.id)
    if (submitErr) {
      toast(submitErr.message || 'Could not submit for sign-off', 'error')
      setSubmitting(false)
      return
    }
    setAssignment((a) =>
      a
        ? {
            ...a,
            status: ONBOARDING_ASSIGNMENT_STATUS.pending_signoff,
            trainee_submitted_at: now,
          }
        : a,
    )
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <Loader />
      </div>
    )
  }

  if (!trackIdForTeamRole(currentUser?.role)) {
    return (
      <p style={{ color: muted, fontSize: '14px' }}>Onboarding is not available for your role.</p>
    )
  }

  const { requiredTotal, requiredDone, pct } = requiredProgress(instances)
  const grouped = groupInstancesByPhaseCategory(instances, phases, categories)
  const canEditItems =
    assignment &&
    assignment.status !== ONBOARDING_ASSIGNMENT_STATUS.complete &&
    assignment.status !== ONBOARDING_ASSIGNMENT_STATUS.pending_signoff

  const hint =
    currentUser?.role === 'Student Intern'
      ? 'Your student intern onboarding checklist'
      : 'Your onboarding checklist'

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>Onboarding</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '3px 0 0' }}>{hint}</p>
        </div>
        {assignment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '100px',
                height: '6px',
                background: 'var(--surface-2)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: pct === 100 ? '#22c55e' : 'var(--brand-primary)',
                  borderRadius: '3px',
                }}
              />
            </div>
            <span style={{ fontSize: '14px', color: muted }}>
              {requiredDone} / {requiredTotal}
            </span>
          </div>
        )}
      </div>

      {!assignment && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '14px',
          }}
        >
          <p style={{ fontSize: '15px', color: muted, margin: 0 }}>
            Your onboarding has not been started yet.
          </p>
          <p style={{ fontSize: '14px', color: muted, margin: '6px 0 0' }}>
            Ask your manager to start onboarding for you.
          </p>
        </div>
      )}

      {assignment?.status === ONBOARDING_ASSIGNMENT_STATUS.complete && (
        <div
          style={{
            padding: '14px 16px',
            marginBottom: '20px',
            borderRadius: '10px',
            background: dark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)',
            border: '0.5px solid rgba(34,197,94,0.25)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: '#22c55e', fontWeight: 600 }}>
            Onboarding complete — signed off by your manager.
          </p>
        </div>
      )}

      {assignment?.status === ONBOARDING_ASSIGNMENT_STATUS.pending_signoff && (
        <div
          style={{
            padding: '14px 16px',
            marginBottom: '20px',
            borderRadius: '10px',
            background: dark ? 'rgba(232,160,32,0.1)' : 'rgba(232,160,32,0.08)',
            border: '0.5px solid rgba(232,160,32,0.25)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: '#e8a020', fontWeight: 500 }}>
            Submitted for manager sign-off. You will be notified when onboarding is marked complete.
          </p>
        </div>
      )}

      {assignment && assignment.status !== ONBOARDING_ASSIGNMENT_STATUS.complete && (
        <>
          <OnboardingChecklist
            grouped={grouped}
            canEdit={!!canEditItems}
            onToggle={toggleTask}
            text={text}
            muted={muted}
            border={border}
            cardBg={cardBg}
          />
          {assignment.status === ONBOARDING_ASSIGNMENT_STATUS.in_progress ||
          assignment.status === ONBOARDING_ASSIGNMENT_STATUS.reopened ? (
            <div style={{ marginTop: '24px' }}>
              <button
                type="button"
                disabled={!canSubmitForSignoff(instances) || submitting}
                onClick={() => void submitForSignoff()}
                style={{
                  fontSize: '14px',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  background: canSubmitForSignoff(instances) ? 'var(--brand-primary)' : 'var(--surface-2)',
                  color: canSubmitForSignoff(instances) ? '#fff' : muted,
                  border: 'none',
                  cursor: canSubmitForSignoff(instances) ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit for manager sign-off'}
              </button>
              {!canSubmitForSignoff(instances) && (
                <p style={{ fontSize: '13px', color: muted, margin: '8px 0 0' }}>
                  Complete all required items before submitting.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}

      {assignment?.status === ONBOARDING_ASSIGNMENT_STATUS.complete && (
        <OnboardingChecklist
          grouped={grouped}
          canEdit={false}
          text={text}
          muted={muted}
          border={border}
          cardBg={cardBg}
        />
      )}
    </div>
  )
}
