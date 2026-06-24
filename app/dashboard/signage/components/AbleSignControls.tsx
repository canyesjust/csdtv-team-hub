'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { formatSignageDate, useSignageAdminStyles } from './SignageAdmin'
import { useTheme } from '@/lib/theme'

export type AbleSignScreenFields = {
  id: string
  ablesign_screen_id: number | null
  ablesign_webapp_id: number | null
  ablesign_synced_at: string | null
  ablesign_online: boolean | null
  ablesign_heartbeat_at: string | null
}

type AbleSignRemoteScreen = {
  id: number
  title: string
  orientation: string
  onlineStatus: string | null
  heartbeatTime: string | null
}

export function AbleSignStatusDot({
  online,
  size = 10,
}: {
  online: boolean | null | undefined
  size?: number
}) {
  const color = online == null ? '#9aa0ab' : online ? '#22c55e' : '#ef4444'
  const title = online == null ? 'Unknown' : online ? 'Online' : 'Offline'
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flex: 'none',
      }}
    />
  )
}

function AbleSignLinkPanel({
  hubScreenId,
  linkedId,
  onLinked,
  s,
  siteId,
}: {
  hubScreenId: string
  linkedId: number | null
  onLinked: () => void
  s: ReturnType<typeof useSignageAdminStyles>
  siteId?: string
}) {
  const [remoteScreens, setRemoteScreens] = useState<AbleSignRemoteScreen[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(linkedId ? String(linkedId) : '')
  const [pairCode, setPairCode] = useState('')
  const [busy, setBusy] = useState(false)

  const loadRemote = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/signage/ablesign/screens${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load AbleSign screens')
      setRemoteScreens(data.screens || [])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load AbleSign screens', 'error')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    void loadRemote()
  }, [loadRemote])

  useEffect(() => {
    setSelected(linkedId ? String(linkedId) : '')
  }, [linkedId])

  const link = async () => {
    if (!selected) {
      toast('Choose an AbleSign screen', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/signage/ablesign/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubScreenId, ablesignScreenId: Number(selected) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Link failed')
      toast('Linked to AbleSign', 'success')
      onLinked()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Link failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const register = async () => {
    const code = pairCode.trim()
    if (!/^[A-Za-z0-9]{6}$/.test(code)) {
      toast('Enter the 6-character pairing code from the TV', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/signage/ablesign/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubScreenId, registrationCode: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      toast('Device registered and synced', 'success')
      setPairCode('')
      onLinked()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Registration failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <p style={s.lbl}>Link to existing AbleSign screen</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            style={{ ...s.input, flex: '1 1 220px', height: 34 }}
            disabled={loading || busy}
          >
            <option value="">{loading ? 'Loading AbleSign screens…' : 'Select a screen'}</option>
            {remoteScreens.map(r => (
              <option key={r.id} value={String(r.id)}>
                {r.title} (#{r.id})
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadRemote()} style={s.btn} disabled={loading || busy}>
            Refresh
          </button>
          <button type="button" onClick={() => void link()} style={s.btnPrimary} disabled={busy || !selected}>
            Link
          </button>
        </div>
      </div>
      <div>
        <p style={s.lbl}>Add by pairing code</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={pairCode}
            onChange={e => setPairCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            style={{ ...s.input, width: 120, letterSpacing: '0.08em' }}
            disabled={busy}
          />
          <button type="button" onClick={() => void register()} style={s.btnPrimary} disabled={busy}>
            Register &amp; sync
          </button>
        </div>
      </div>
    </div>
  )
}

export function AbleSignScreenPanel({
  screen,
  onUpdated,
  siteId,
}: {
  screen: AbleSignScreenFields & { name: string; code: string }
  onUpdated: () => void
  siteId?: string
}) {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const [syncing, setSyncing] = useState(false)

  const syncOne = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/signage/ablesign/sync/${screen.id}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      toast(`Synced ${screen.name}`, 'success')
      onUpdated()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ ...s.card, marginTop: 16, background: s.infoBg, borderColor: s.infoBorder }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>AbleSign</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
          <AbleSignStatusDot online={screen.ablesign_online} />
          <span>
            {screen.ablesign_online == null
              ? 'Status unknown'
              : screen.ablesign_online
                ? 'Online'
                : 'Offline'}
          </span>
        </div>
      </div>

      <AbleSignLinkPanel
        hubScreenId={screen.id}
        linkedId={screen.ablesign_screen_id}
        onLinked={onUpdated}
        s={s}
        siteId={siteId}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <button
          type="button"
          onClick={() => void syncOne()}
          style={s.btnPrimary}
          disabled={syncing || !screen.ablesign_screen_id}
        >
          {syncing ? 'Syncing…' : 'Sync to AbleSign'}
        </button>
        <span style={{ fontSize: 12, color: s.muted }}>
          {screen.ablesign_synced_at
            ? `Last synced ${formatSignageDate(screen.ablesign_synced_at)}`
            : 'Not synced yet'}
          {screen.ablesign_screen_id ? ` · AbleSign #${screen.ablesign_screen_id}` : ''}
          {screen.ablesign_webapp_id ? ` · Web app #${screen.ablesign_webapp_id}` : ''}
        </span>
      </div>
    </div>
  )
}

export function AbleSignSyncAllButton({
  screenIds,
  onDone,
}: {
  screenIds: string[]
  onDone: () => void
}) {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '', failed: [] as string[] })

  const syncAll = async () => {
    if (!screenIds.length) {
      toast('No screens to sync', 'error')
      return
    }
    setRunning(true)
    const failed: string[] = []
    setProgress({ done: 0, total: screenIds.length, current: '', failed: [] })

    for (let i = 0; i < screenIds.length; i += 1) {
      const id = screenIds[i]
      setProgress(p => ({ ...p, current: id, done: i }))
      try {
        const res = await fetch(`/api/signage/ablesign/sync/${id}`, { method: 'POST' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          failed.push(data.error || `Screen ${id} failed`)
        }
      } catch {
        failed.push(`Screen ${id} failed`)
      }
      if (i < screenIds.length - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    setProgress(p => ({ ...p, done: screenIds.length, failed }))
    setRunning(false)
    onDone()

    if (failed.length) {
      toast(`Sync finished with ${failed.length} error(s)`, 'error')
    } else {
      toast('All screens synced', 'success')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button type="button" onClick={() => void syncAll()} style={s.btnPrimary} disabled={running}>
        {running ? 'Syncing all…' : 'Sync all to AbleSign'}
      </button>
      {running || progress.total > 0 ? (
        <div style={{ fontSize: 12, color: s.muted }}>
          {progress.done} / {progress.total} complete
          {progress.failed.length > 0 ? ` · ${progress.failed.length} failed` : ''}
        </div>
      ) : null}
    </div>
  )
}

export function AbleSignTestConnection({
  compact,
  siteId,
}: {
  compact?: boolean
  siteId?: string
}) {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ connected: boolean; totalScreens?: number; error?: string } | null>(null)

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/signage/ablesign/test${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''}`)
      const data = await res.json().catch(() => ({}))
      setResult(data)
      if (data.connected) {
        toast(`Connected — ${data.totalScreens ?? 0} AbleSign screen(s)`, 'success')
      } else {
        toast(data.error || 'Connection failed', 'error')
      }
    } catch {
      toast('Connection test failed', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={compact ? undefined : { ...s.card, marginBottom: 16 }}>
      {!compact && <h3 style={s.h3}>AbleSign API</h3>}
      <p style={{ margin: '0 0 10px', fontSize: 13, color: s.muted, lineHeight: 1.5 }}>
        The API key is configured in server environment variables (<code>ABLESIGN_API_KEY</code>), not in this dashboard.
      </p>
      <button type="button" onClick={() => void test()} style={s.btnPrimary} disabled={testing}>
        {testing ? 'Testing…' : 'Test connection'}
      </button>
      {result && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: result.connected ? s.info : '#ef4444' }}>
          {result.connected
            ? `Connected — ${result.totalScreens ?? 0} screen(s) in AbleSign`
            : result.error || 'Not connected'}
        </p>
      )}
    </div>
  )
}
