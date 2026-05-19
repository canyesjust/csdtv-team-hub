'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import ControlSurfaceView from './ControlSurfaceView'
import { dispatchControlSurfaceAction } from '@/lib/board-meetings/control-surface-actions'
import type { ControlLivePatch } from '@/lib/board-meetings/control-live-bundle'
import { normalizeLowerThirdPosition } from '@/lib/board-meetings/lower-third-control'
import type { ControlBundle, LowerThirdPerson, ResultOverlayState } from '@/lib/board-meetings/types'

const MOTION_ACTIONS = new Set([
  'open',
  'set-mover',
  'set-seconder',
  'set-text',
  'set-vote-type',
  'open-vote',
  'record-vote',
  'push-result',
  'withdraw',
  'propose-substitute',
])

const REALTIME_DEBOUNCE_MS = 200
/** Skip redundant realtime reload right after a local action refresh. */
const REALTIME_SUPPRESS_MS = 8000

const OPTIMISTIC_ACTIONS = new Set([
  'set-lower-third',
  'clear-lower-third',
  'set-lower-third-position',
  'jump-to',
  'advance',
  'go-back',
  'toggle-overlay',
  'toggle-channel',
  'reset-elapsed',
  'clear-elapsed',
])

type ControlPostResult = { ok: true; data: Record<string, unknown> } | { ok: false }

type BroadcastState = NonNullable<ControlBundle['broadcast_state']>

function patchBroadcastState(
  prev: ControlBundle['broadcast_state'],
  patch: Partial<BroadcastState>,
): BroadcastState {
  const base: BroadcastState = prev ?? { status: 'prepared', mode: 'normal' }
  return { ...base, ...patch }
}

type Props = {
  productionId: string
  initialBundle?: ControlBundle | null
}

function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delayMs: number): T {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  fnRef.current = fn

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fnRef.current(...args), delayMs)
    }) as T,
    [delayMs],
  )
}

export default function ControlSurfaceClient({ productionId, initialBundle = null }: Props) {
  const supabase = createClient()
  const [bundle, setBundle] = useState<ControlBundle | null>(initialBundle)
  const [resultOverlay, setResultOverlay] = useState<ResultOverlayState | null>(
    initialBundle?.result_overlay ?? null,
  )
  const [loading, setLoading] = useState(!initialBundle)
  const [busy, setBusy] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const utilitiesLoadedRef = useRef(!!initialBundle?.meeting_playlist)
  const stableWhenLockedRef = useRef<{
    agenda_items: ControlBundle['agenda_items']
    lower_third_people: ControlBundle['lower_third_people']
  } | null>(null)
  const suppressRealtimeUntilRef = useRef(0)
  const liveFetchGenRef = useRef(0)
  const optimisticEpochRef = useRef(0)

  const preserveUtilities = useCallback((prev: ControlBundle | null, next: ControlBundle): ControlBundle => {
    return {
      ...next,
      meeting_playlist: next.meeting_playlist ?? prev?.meeting_playlist ?? null,
      timer_templates:
        next.timer_templates && next.timer_templates.length > 0
          ? next.timer_templates
          : (prev?.timer_templates ?? []),
    }
  }, [])

  const applyBundle = useCallback(
    (body: ControlBundle) => {
      if (body.board_meeting.agenda_locked) {
        if (!stableWhenLockedRef.current) {
          stableWhenLockedRef.current = {
            agenda_items: body.agenda_items,
            lower_third_people: body.lower_third_people,
          }
        }
        const stable = stableWhenLockedRef.current
        setBundle(prev =>
          preserveUtilities(prev, {
            ...body,
            agenda_items: stable.agenda_items,
            items: stable.agenda_items,
            lower_third_people: stable.lower_third_people,
          }),
        )
      } else {
        stableWhenLockedRef.current = null
        setBundle(prev => preserveUtilities(prev, body))
      }
      setResultOverlay(body.result_overlay ?? null)
      if (body.meeting_playlist) utilitiesLoadedRef.current = true
    },
    [preserveUtilities],
  )

  const load = useCallback(
    async (opts?: { full?: boolean }) => {
      const q = opts?.full ? '?full=1' : ''
      const res = await fetch(`/api/board-meetings/${productionId}/control${q}`)
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Failed to load control data', 'error')
        setLoading(false)
        return
      }
      applyBundle(body)
      setLoading(false)
    },
    [productionId, applyBundle],
  )

  const applyLivePatch = useCallback((live: ControlLivePatch) => {
    setBundle(prev => (prev ? { ...prev, ...live } : prev))
    setResultOverlay(live.result_overlay ?? null)
  }, [])

  const loadLive = useCallback(async () => {
    const gen = ++liveFetchGenRef.current
    const epochAtStart = optimisticEpochRef.current
    const res = await fetch(`/api/board-meetings/${productionId}/control/live`)
    if (gen !== liveFetchGenRef.current) return
    if (epochAtStart !== optimisticEpochRef.current) return
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) {
      if (res.status !== 0) toast((body as { error?: string })?.error || 'Failed to sync live state', 'error')
      return
    }
    if (epochAtStart !== optimisticEpochRef.current) return
    applyLivePatch(body as ControlLivePatch)
  }, [productionId, applyLivePatch])

  const beginOptimisticAction = useCallback(() => {
    optimisticEpochRef.current += 1
    liveFetchGenRef.current += 1
    suppressRealtimeUntilRef.current = Date.now() + REALTIME_SUPPRESS_MS
  }, [])

  const refreshInBackground = useCallback(() => {
    suppressRealtimeUntilRef.current = Date.now() + REALTIME_SUPPRESS_MS
    void loadLive()
  }, [loadLive])

  /** Slim bundle — skips full playlist items and timer templates. */
  const loadDebounced = useDebouncedCallback(() => {
    if (Date.now() < suppressRealtimeUntilRef.current) return
    void loadLive()
  }, REALTIME_DEBOUNCE_MS)

  const loadUtilitiesDebounced = useDebouncedCallback(() => {
    void loadUtilities()
  }, REALTIME_DEBOUNCE_MS)

  const loadUtilities = useCallback(async () => {
    if (utilitiesLoadedRef.current) return
    const res = await fetch(`/api/board-meetings/${productionId}/control/utilities`)
    if (!res.ok) return
    const utilities = await res.json()
    if (utilities.meeting_playlist || (utilities.timer_templates || []).length > 0) {
      utilitiesLoadedRef.current = true
    }
    setBundle(prev =>
      prev
        ? {
            ...prev,
            meeting_playlist: utilities.meeting_playlist ?? prev.meeting_playlist,
            timer_templates: utilities.timer_templates ?? prev.timer_templates,
          }
        : prev,
    )
  }, [productionId])

  const refreshAttendance = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/attendance`)
    if (!res.ok) return
    const attendance = await res.json()
    setBundle(prev => (prev ? { ...prev, attendance } : prev))
  }, [productionId])

  useEffect(() => {
    if (!initialBundle) {
      void load({ full: true })
    } else {
      void loadUtilities()
    }
  }, [initialBundle, load, loadUtilities])

  useEffect(() => {
    if (!resultOverlay?.active || resultOverlay.held) return
    const interval = setInterval(() => {
      setResultOverlay(prev => {
        if (!prev || !prev.active || prev.held) return prev
        const newRemaining = Math.max(0, prev.seconds_remaining - 1)
        if (newRemaining === 0) {
          return { ...prev, seconds_remaining: 0 }
        }
        return { ...prev, seconds_remaining: newRemaining }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [resultOverlay?.active, resultOverlay?.held])

  const motionIds = useMemo(() => {
    const ids = new Set<string>()
    const activeId = bundle?.motion_lifecycle?.active_motion?.id
    const parentId = bundle?.motion_lifecycle?.parent_motion?.id
    if (activeId) ids.add(activeId)
    if (parentId) ids.add(parentId)
    if (resultOverlay?.motion_id) ids.add(resultOverlay.motion_id)
    return [...ids]
  }, [
    bundle?.motion_lifecycle?.active_motion?.id,
    bundle?.motion_lifecycle?.parent_motion?.id,
    resultOverlay?.motion_id,
  ])

  useEffect(() => {
    if (!bundle?.board_meeting?.id) return
    const meetingId = bundle.board_meeting.id

    let channel = supabase.channel(`control-surface-${meetingId}`)

    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${meetingId}` },
      () => {
        loadDebounced()
      },
    )

    channel = channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_timers', filter: `board_meeting_id=eq.${meetingId}` },
        () => {
          loadDebounced()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${meetingId}` },
        () => {
          loadDebounced()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_attendance', filter: `board_meeting_id=eq.${meetingId}` },
        () => {
          void refreshAttendance()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_playlists', filter: `board_meeting_id=eq.${meetingId}` },
        () => {
          loadDebounced()
          loadUtilitiesDebounced()
        },
      )

    for (const motionId of motionIds) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motion_votes', filter: `motion_id=eq.${motionId}` },
        () => {
          loadDebounced()
        },
      )
    }

    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [bundle?.board_meeting?.id, supabase, loadDebounced, loadUtilitiesDebounced, motionIds, refreshAttendance])

  const patchBundle = useCallback((patch: (prev: ControlBundle) => ControlBundle) => {
    setBundle(prev => (prev ? patch(prev) : prev))
  }, [])

  const applyOptimistic = useCallback((action: string, payload?: Record<string, unknown>) => {
    setBundle(prev => {
      if (!prev) return prev

      if (action === 'set-lower-third') {
        const personId = payload?.person_id as string
        const fromPayload = payload?.person as LowerThirdPerson | undefined
        const person = fromPayload ?? prev.lower_third_people?.find(p => p.id === personId)
        if (!person) return prev
        const position = normalizeLowerThirdPosition(
          payload?.position ?? prev.broadcast_state?.lower_third_position,
        )
        const active = {
          person_id: person.id,
          display_name: person.display_name,
          primary_title: person.primary_title,
          affiliation: person.affiliation,
          officer_position: person.officer_position,
          photo_url: null,
        }
        return {
          ...prev,
          lower_third_active: active,
          active_lower_third: active,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            active_lower_third_person_id: person.id,
            lower_third_position: position,
          }),
        }
      }

      if (action === 'set-lower-third-position') {
        const position = normalizeLowerThirdPosition(payload?.position)
        return {
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            lower_third_position: position,
          }),
        }
      }

      if (action === 'clear-lower-third') {
        return {
          ...prev,
          lower_third_active: null,
          active_lower_third: null,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            active_lower_third_person_id: null,
          }),
        }
      }

      if (action === 'jump-to') {
        const agendaItemId = payload?.agenda_item_id as string
        if (!agendaItemId) return prev
        return {
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            current_agenda_item_id: agendaItemId,
          }),
        }
      }

      if (action === 'advance' || action === 'go-back') {
        const items = prev.agenda_items || []
        const currentId = prev.broadcast_state?.current_agenda_item_id ?? null
        const idx = currentId ? items.findIndex(i => i.id === currentId) : -1
        const nextIdx = action === 'advance' ? (idx < 0 ? 0 : idx + 1) : idx <= 0 ? -1 : idx - 1
        const next = nextIdx >= 0 && nextIdx < items.length ? items[nextIdx] : null
        if (!next) return prev
        return {
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            current_agenda_item_id: next.id,
          }),
        }
      }

      if (action === 'toggle-overlay') {
        const visible = prev.broadcast_state?.agenda_overlay_visible !== false
        return {
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            agenda_overlay_visible: !visible,
            overlay_visible: !visible,
          }),
        }
      }

      if (action === 'toggle-channel') {
        const channelId = payload?.output_channel_id as string
        if (!channelId) return prev
        const has = (prev.channel_assignments || []).some(a => a.output_channel_id === channelId)
        return {
          ...prev,
          channel_assignments: has
            ? (prev.channel_assignments || []).filter(a => a.output_channel_id !== channelId)
            : [...(prev.channel_assignments || []), { output_channel_id: channelId }],
        }
      }

      if (action === 'reset-elapsed') {
        return {
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            elapsed_started_at: new Date().toISOString(),
          }),
        }
      }

      if (action === 'clear-elapsed') {
        return {
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            elapsed_started_at: null,
          }),
        }
      }

      return prev
    })
  }, [])

  const postControl = async (path: string, body?: Record<string, unknown>): Promise<ControlPostResult> => {
    const res = await fetch(`/api/board-meetings/${productionId}/control/${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast((data as { error?: string }).error || 'Action failed', 'error')
      return { ok: false }
    }
    return { ok: true, data: data as Record<string, unknown> }
  }

  const postMotion = async (path: string, body?: Record<string, unknown>): Promise<ControlPostResult> => {
    const res = await fetch(`/api/board-meetings/${productionId}/motion/${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast((data as { error?: string }).error || 'Action failed', 'error')
      return { ok: false }
    }
    return { ok: true, data: data as Record<string, unknown> }
  }

  const applyServerHints = useCallback(
    (action: string, data: Record<string, unknown>) => {
      if (action === 'advance' || action === 'go-back') {
        const item = data.current_item as { id?: string } | undefined
        if (item?.id) {
          patchBundle(prev => ({
            ...prev,
            broadcast_state: patchBroadcastState(prev.broadcast_state, {
              current_agenda_item_id: item.id,
            }),
          }))
        }
      }

      if (action === 'reset-elapsed' && typeof data.elapsed_started_at === 'string') {
        patchBundle(prev => ({
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            elapsed_started_at: data.elapsed_started_at as string,
          }),
        }))
      }

      if (action === 'clear-elapsed') {
        patchBundle(prev => ({
          ...prev,
          broadcast_state: patchBroadcastState(prev.broadcast_state, {
            elapsed_started_at: null,
          }),
        }))
      }
    },
    [patchBundle],
  )

  const postOptimisticInBackground = useCallback(
    (
      action: string,
      payload?: Record<string, unknown>,
      opts?: { channelWasAssigned?: boolean },
    ) => {
      const epochAtSend = optimisticEpochRef.current

      const onFailure = () => {
        if (epochAtSend !== optimisticEpochRef.current) return
        void loadLive()
      }

      if (action === 'toggle-channel') {
        const channelId = payload?.output_channel_id as string
        const method = opts?.channelWasAssigned ? 'DELETE' : 'POST'
        void fetch(`/api/board-meetings/${productionId}/channels`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output_channel_id: channelId }),
        })
          .then(async res => {
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              toast((data as { error?: string }).error || 'Channel update failed', 'error')
              onFailure()
            }
          })
          .catch(() => onFailure())
        return
      }

      void postControl(action, payload)
        .then(result => {
          if (epochAtSend !== optimisticEpochRef.current) return
          if (result.ok) {
            applyServerHints(action, result.data)
            return
          }
          onFailure()
        })
        .catch(() => onFailure())
    },
    [applyServerHints, loadLive, productionId],
  )

  const onAction = async (action: string, body?: unknown) => {
    if (action === 'open-attendance') {
      setAttendanceOpen(true)
      return
    }

    const payload = body as Record<string, unknown> | undefined

    if (OPTIMISTIC_ACTIONS.has(action)) {
      const channelId =
        action === 'toggle-channel' ? (payload?.output_channel_id as string | undefined) : undefined
      const channelWasAssigned = channelId
        ? (bundle?.channel_assignments || []).some(a => a.output_channel_id === channelId)
        : false
      beginOptimisticAction()
      flushSync(() => applyOptimistic(action, payload))
      postOptimisticInBackground(action, payload, { channelWasAssigned })
      return
    }

    setBusy(true)
    try {
      if (action === 'hold-result') {
        const res = await dispatchControlSurfaceAction(productionId, 'hold-result')
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          toast((d as { error?: string }).error || 'Action failed', 'error')
          refreshInBackground()
        } else {
          setResultOverlay(prev =>
            prev?.active
              ? { ...prev, held: true, seconds_remaining: prev.total_duration }
              : prev,
          )
        }
        return
      }

      if (action === 'dismiss-result') {
        const res = await dispatchControlSurfaceAction(productionId, 'dismiss-result')
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          toast((d as { error?: string }).error || 'Action failed', 'error')
          refreshInBackground()
        } else {
          setResultOverlay(null)
          refreshInBackground()
        }
        return
      }

      if (MOTION_ACTIONS.has(action) || action.startsWith('motion/')) {
        const path = action.startsWith('motion/') ? action.slice('motion/'.length) : action
        const result = await postMotion(path, payload)
        if (result.ok) refreshInBackground()
        return
      }

      if (action === 'clear-qr') {
        const result = await postControl('dismiss-qr')
        if (result.ok) refreshInBackground()
        return
      }

      if (action.startsWith('playlist-')) {
        const playlistAction = action.replace('playlist-', '')
        const res = await fetch(`/api/board-meetings/${productionId}/playlist/${playlistAction}`, {
          method: 'POST',
          headers: payload ? { 'Content-Type': 'application/json' } : undefined,
          body: payload ? JSON.stringify(payload) : undefined,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast((data as { error?: string }).error || 'Playlist action failed', 'error')
        } else {
          refreshInBackground()
          void loadUtilities()
        }
        return
      }

      const result = await postControl(action, payload)
      if (result.ok) {
        applyServerHints(action, result.data)
        refreshInBackground()
      }
    } finally {
      setBusy(false)
    }
  }

  const viewBundle = useMemo(
    () => (bundle ? { ...bundle, result_overlay: resultOverlay } : null),
    [bundle, resultOverlay],
  )

  if (loading) {
    return (
      <div className="control-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </div>
    )
  }

  if (!viewBundle) return <p style={{ color: 'var(--text-muted)', padding: 16 }}>Board meeting not found.</p>

  const status = viewBundle.broadcast_state?.status || viewBundle.board_meeting.broadcast_status
  const canControl = viewBundle.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'

  return (
    <ControlSurfaceView
      productionId={productionId}
      bundle={viewBundle}
      busy={busy}
      canControl={canControl}
      onAction={onAction}
      attendanceOpen={attendanceOpen}
      onAttendanceOpenChange={setAttendanceOpen}
    />
  )
}
