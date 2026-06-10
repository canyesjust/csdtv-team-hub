'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { useTheme } from '@/lib/theme'
import Loader from '../../components/Loader'
import {
  ONBOARDING_TRACK_INTERN,
  ONBOARDING_TRACK_STUDENT_INTERN,
  type OnboardingTrackId,
} from '@/lib/onboarding/constants'
import { startOnboardingForMember } from '@/lib/onboarding/sync-template'
import { ensureOnboardingSeed } from '@/lib/onboarding/seed-database'
import { requiredProgress } from '@/lib/onboarding/checklist-utils'
import type { OnboardingAssignment } from '@/lib/onboarding/types'

type MemberRow = {
  id: string
  name: string
  avatar_color: string
  role: string
  assignment: OnboardingAssignment | null
  requiredTotal: number
  requiredDone: number
}

export default function ManagerOverview() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [interns, setInterns] = useState<MemberRow[]>([])
  const [students, setStudents] = useState<MemberRow[]>([])

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const loadMembers = useCallback(
    async (role: string, trackId: string) => {
      const { data: members } = await supabase
        .from('team')
        .select('id, name, avatar_color, role')
        .eq('role', role)
        .eq('active', true)
        .order('name')

      if (!members?.length) return []

      const ids = members.map((m) => m.id)
      const { data: assignments } = await supabase
        .from('onboarding_assignments')
        .select('*')
        .eq('track_id', trackId)
        .in('team_member_id', ids)

      const asnByMember = Object.fromEntries(
        (assignments || []).map((a) => [a.team_member_id, a as OnboardingAssignment]),
      )

      const rows: MemberRow[] = []
      for (const m of members) {
        const asn = asnByMember[m.id] || null
        let requiredTotal = 0
        let requiredDone = 0
        if (asn) {
          const { data: items } = await supabase
            .from('onboarding_item_instances')
            .select('required, completed, removed_at')
            .eq('assignment_id', asn.id)
          const prog = requiredProgress(
            (items || []).map((i) => ({
              ...i,
              id: '',
              assignment_id: asn.id,
              template_item_id: null,
              phase_id: null,
              category_id: null,
              title: '',
              description: '',
              library_article_id: null,
              sort_order: 0,
              completed_at: null,
              completed_by: null,
              removed_by: null,
              is_ad_hoc: false,
            })),
          )
          requiredTotal = prog.requiredTotal
          requiredDone = prog.requiredDone
        }
        rows.push({
          ...m,
          assignment: asn,
          requiredTotal,
          requiredDone,
        })
      }
      return rows
    },
    [supabase],
  )

  const load = useCallback(async () => {
    setLoading(true)
    await ensureOnboardingSeed(supabase)
    const [internRows, studentRows] = await Promise.all([
      loadMembers('Intern', ONBOARDING_TRACK_INTERN),
      loadMembers('Student Intern', ONBOARDING_TRACK_STUDENT_INTERN),
    ])
    setInterns(internRows)
    setStudents(studentRows)
    setLoading(false)
  }, [supabase, loadMembers])

  useEffect(() => {
    void load()
  }, [load])

  const handleStart = async (memberId: string, trackId: OnboardingTrackId) => {
    setStarting(memberId)
    const { error } = await startOnboardingForMember(supabase, trackId, memberId)
    if (error) toast(error, 'error')
    await load()
    setStarting(null)
  }

  const MemberCard = ({
    row,
    trackId,
    trackLabel,
  }: {
    row: MemberRow
    trackId: OnboardingTrackId
    trackLabel: string
  }) => {
    const asn = row.assignment
    const pct =
      row.requiredTotal > 0 ? Math.round((row.requiredDone / row.requiredTotal) * 100) : 0
    const isStarting = starting === row.id

    return (
      <div
        style={{
          background: cardBg,
          border: `0.5px solid ${border}`,
          borderRadius: '14px',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: row.avatar_color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              color: '#0a0f1e',
            }}
          >
            {row.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '16px', fontWeight: 600, color: text, margin: 0 }}>{row.name}</p>
            <p style={{ fontSize: '13px', color: muted, margin: '1px 0 0' }}>{trackLabel}</p>
          </div>
          {asn?.status === 'complete' && (
            <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>Complete</span>
          )}
          {asn?.status === 'pending_signoff' && (
            <span style={{ fontSize: '12px', color: '#e8a020', fontWeight: 600 }}>Awaiting sign-off</span>
          )}
        </div>

        {asn ? (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: muted }}>Required items</span>
                <span style={{ fontSize: '13px', color: text }}>
                  {row.requiredDone} / {row.requiredTotal}
                </span>
              </div>
              <div
                style={{
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
                    background: pct === 100 ? '#22c55e' : '#1e6cb5',
                  }}
                />
              </div>
            </div>
            <Link
              href={`/dashboard/onboarding/coach/${row.id}`}
              style={{
                display: 'block',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: 500,
                padding: '10px',
                borderRadius: '8px',
                background: hoverBg,
                border: `0.5px solid ${border}`,
                color: '#5ba3e0',
                textDecoration: 'none',
              }}
            >
              Open coach view
            </Link>
          </>
        ) : (
          <button
            type="button"
            disabled={isStarting}
            onClick={() => void handleStart(row.id, trackId)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              background: isStarting ? 'var(--surface-2)' : '#1e6cb5',
              color: isStarting ? muted : '#fff',
              border: 'none',
              cursor: isStarting ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'inherit',
            }}
          >
            {isStarting ? 'Starting…' : 'Start onboarding'}
          </button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <Loader />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: 0 }}>Onboarding</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '3px 0 0' }}>
            Coach interns and student interns through their checklists.
          </p>
        </div>
        <Link
          href="/dashboard/onboarding/admin"
          style={{
            fontSize: '14px',
            fontWeight: 500,
            padding: '10px 16px',
            borderRadius: '8px',
            background: '#1e6cb5',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Edit templates
        </Link>
      </div>

      <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Staff interns</h2>
      {interns.length === 0 ? (
        <p style={{ fontSize: '14px', color: muted, marginBottom: '32px' }}>
          No active interns. Add them in Settings with role Intern.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px',
            marginBottom: '40px',
          }}
        >
          {interns.map((row) => (
            <MemberCard
              key={row.id}
              row={row}
              trackId={ONBOARDING_TRACK_INTERN}
              trackLabel="Staff intern track"
            />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Student interns</h2>
      {students.length === 0 ? (
        <p style={{ fontSize: '14px', color: muted }}>No active student interns.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px',
          }}
        >
          {students.map((row) => (
            <MemberCard
              key={row.id}
              row={row}
              trackId={ONBOARDING_TRACK_STUDENT_INTERN}
              trackLabel="Student intern track"
            />
          ))}
        </div>
      )}
    </div>
  )
}
