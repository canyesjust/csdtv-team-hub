'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Loader from '@/app/dashboard/components/Loader'
import { toast } from '@/lib/toast'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import type { VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'
import type { ControlBundle } from '@/app/dashboard/board-meetings/[productionId]/control/control-surface-types'
import MotionScreenView from './MotionScreenView'
import { isVoteResultActive } from '@/lib/board-meetings/motion-control'
import { tallyFromMotion, type MotionScreenModel, type MotionUi } from './motion-screen-types'

export default function MotionScreenClient({ productionId }: { productionId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [bundle, setBundle] = useState<ControlBundle | null>(null)
  const [motions, setMotions] = useState<MotionUi[]>([])
  const [attendance, setAttendance] = useState<{ person_id: string; name: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [motionText, setMotionText] = useState('')
  const [voteMode, setVoteMode] = useState<VoteMode>('voice')
  const [voteDraft, setVoteDraft] = useState<Record<string, VoteValue | null>>({})
  const [editStep, setEditStep] = useState<'mover' | 'seconder' | null>(null)
  const [recordedTally, setRecordedTally] = useState<ReturnType<typeof tallyFromMotion>>(null)
  const [recordedResult, setRecordedResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [cRes, mRes, aRes] = await Promise.all([
      fetch(`/api/board-meetings/${productionId}/control`),
      fetch(`/api/board-meetings/${productionId}/motions`),
      fetch(`/api/board-meetings/${productionId}/attendance`),
    ])
    const cBody = await cRes.json()
    const mBody = await mRes.json()
    const aBody = await aRes.json()
    if (cRes.ok) setBundle(cBody)
    if (mRes.ok) setMotions(mBody.motions || [])
    if (aRes.ok) setAttendance(aBody.records || [])
    setLoading(false)
  }, [productionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!bundle?.board_meeting?.id) return
    const channel = supabase
      .channel(`motion-screen-${bundle.board_meeting.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bundle?.board_meeting?.id, supabase, load])

  const currentId = bundle?.broadcast_state?.current_agenda_item_id
  const currentItem = bundle?.items.find(i => i.id === currentId)
  const status = bundle?.board_meeting.broadcast_status ?? 'draft'
  const canControl = !!bundle?.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'
  const disabled = !canControl || status !== 'live' || busy

  const activeMotion = useMemo(() => {
    const id = bundle?.broadcast_state?.active_motion_id
    if (id) return motions.find(m => m.id === id) ?? null
    return motions.find(m => ['open_for_discussion', 'voting'].includes(m.status)) ?? null
  }, [bundle?.broadcast_state?.active_motion_id, motions])

  const parentMotion = useMemo(() => {
    if (!activeMotion?.parent_motion_id) return null
    return motions.find(m => m.id === activeMotion.parent_motion_id) ?? null
  }, [activeMotion, motions])

  useEffect(() => {
    if (activeMotion) setMotionText(activeMotion.motion_text)
    if (activeMotion && ['passed', 'failed'].includes(activeMotion.status)) {
      setRecordedTally(tallyFromMotion(activeMotion))
      setRecordedResult(activeMotion.result)
    }
  }, [activeMotion?.id, activeMotion?.motion_text, activeMotion?.status, activeMotion?.result, activeMotion?.tally_yea, activeMotion?.tally_nay])

  useEffect(() => {
    if (!activeMotion) {
      setEditStep(null)
      setRecordedTally(null)
      setRecordedResult(null)
      return
    }
    if (activeMotion.status === 'voting') return
    if (!activeMotion.moved_by) setEditStep('mover')
    else if (!activeMotion.seconded_by) setEditStep('seconder')
    else setEditStep(null)
  }, [activeMotion?.id, activeMotion?.moved_by, activeMotion?.seconded_by, activeMotion?.status])

  const consentBlockItems = useMemo(() => {
    if (!currentItem?.consent_block) return []
    return (bundle?.items || []).filter(i => i.consent_block === currentItem.consent_block)
  }, [bundle?.items, currentItem])

  const members = useMemo(
    () => attendance.filter(p => p.status !== 'absent').map(p => ({ person_id: p.person_id, name: p.name })),
    [attendance],
  )

  const voters: VoterRow[] = useMemo(
    () =>
      attendance.map(p => ({
        person_id: p.person_id,
        name: p.name,
        eligible: p.status !== 'absent',
        default_vote: p.status === 'absent' ? 'absent' : 'yea',
      })),
    [attendance],
  )

  const model: MotionScreenModel = {
    activeMotion,
    parentMotion,
    currentItem: currentItem
      ? { id: currentItem.id, title: currentItem.title, item_number: currentItem.item_number, type: currentItem.type, consent_block: currentItem.consent_block }
      : null,
    members,
    voters,
    statusLabel: activeMotion?.status.replace(/_/g, ' ') ?? 'No motion',
    isConsentLead: !!(currentItem?.consent_block && consentBlockItems[0]?.id === currentItem.id),
    consentRange:
      consentBlockItems.length > 1
        ? `${consentBlockItems[0].item_number} – ${consentBlockItems[consentBlockItems.length - 1].item_number}`
        : null,
    canControl,
    isLive: status === 'live',
    resultOnOverlay: isVoteResultActive(bundle?.broadcast_state || {}),
  }

  const motionPost = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motion/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Action failed', 'error')
        return null
      }
      await load()
      return data
    } finally {
      setBusy(false)
    }
  }

  const openMain = async () => {
    if (!currentItem) return
    await motionPost('open', {
      motion_type: 'main',
      agenda_item_id: currentItem.id,
      motion_text: `Move to approve ${currentItem.title}`,
    })
    setEditStep('mover')
  }

  const openConsent = async () => {
    if (!currentItem?.consent_block) return
    await motionPost('open', {
      motion_type: 'main',
      consent_block: currentItem.consent_block,
      motion_text: 'Move to approve the consent agenda as presented',
    })
    setEditStep('mover')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '50vh' }}>
        <Loader />
      </div>
    )
  }

  if (!bundle) {
    return <p style={{ padding: 16, color: 'var(--text-muted)' }}>Board meeting not found.</p>
  }

  return (
    <MotionScreenView
      productionId={productionId}
      model={model}
      disabled={disabled}
      busy={busy}
      motionText={motionText}
      setMotionText={setMotionText}
      voteMode={voteMode}
      setVoteMode={setVoteMode}
      voteDraft={voteDraft}
      setVoteDraft={setVoteDraft}
      editStep={editStep}
      setEditStep={setEditStep}
      recordedTally={recordedTally}
      recordedResult={recordedResult}
      onSaveText={async () => {
        if (!activeMotion) return
        await motionPost(`${activeMotion.id}/set-text`, { motion_text: motionText })
      }}
      onPickMover={async id => {
        if (!activeMotion) return
        await motionPost(`${activeMotion.id}/set-mover`, { person_id: id })
        setEditStep('seconder')
      }}
      onPickSeconder={async id => {
        if (!activeMotion) return
        await motionPost(`${activeMotion.id}/set-seconder`, { person_id: id })
        setEditStep(null)
      }}
      onOpenVote={async () => {
        if (!activeMotion) return
        await motionPost(`${activeMotion.id}/set-vote-type`, { vote_mode: voteMode })
        await motionPost(`${activeMotion.id}/open-vote`, { vote_mode: voteMode })
        setVoteDraft({})
        setRecordedTally(null)
        setRecordedResult(null)
      }}
      onProposeSubstitute={async () => {
        if (!activeMotion) return
        await motionPost(`${activeMotion.id}/propose-substitute`, {})
      }}
      onWithdraw={async () => {
        if (!activeMotion) return
        await motionPost(`${activeMotion.id}/withdraw`)
        router.push(`/control/${productionId}`)
      }}
      onOpenMain={openMain}
      onOpenConsent={openConsent}
      onRecordVote={async () => {
        if (!activeMotion) return
        const payload = voters.map(v => {
          const vote =
            voteDraft[v.person_id] ??
            (voteMode === 'voice' ? (v.eligible ? 'yea' : 'absent') : null)
          return { person_id: v.person_id, vote: vote || 'absent' }
        })
        if (voteMode === 'roll_call' && payload.some(p => !p.vote)) {
          toast('Record a vote for each member', 'error')
          return
        }
        const data = await motionPost(`${activeMotion.id}/record-vote`, { votes: payload })
        if (data) {
          setRecordedTally({
            yea: data.tally?.yea ?? 0,
            nay: data.tally?.nay ?? 0,
            abstain: data.tally?.abstain ?? 0,
            absent: data.tally?.absent ?? 0,
            recused: data.tally?.recused ?? 0,
          })
          setRecordedResult(data.result ?? null)
          await load()
        }
      }}
      onPushResult={async () => {
        if (!activeMotion) return
        const ok = await motionPost(`${activeMotion.id}/push-result`)
        if (ok) router.push(`/control/${productionId}`)
      }}
    />
  )
}
