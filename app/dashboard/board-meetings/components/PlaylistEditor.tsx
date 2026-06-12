'use client'

import { useCallback, useEffect, useState } from 'react'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import {
  INFO_CARD_LABELS,
  PLAYLIST_ITEM_TYPES,
  type LoopBehavior,
  type PlaylistItemRow,
  type PlaylistItemType,
} from '@/lib/board-meetings/playlist-types'

type EditorMode =
  | { mode: 'template'; templateId: string }
  | { mode: 'meeting'; productionId: string }

type PlaylistMeta = {
  id: string
  loop_behavior: LoopBehavior
  music_bed_id: string | null
  default_music_bed_id?: string | null
  name?: string
  play_during_live?: boolean
  play_during_recess?: boolean
}

type ItemRow = PlaylistItemRow & { asset_url?: string | null }

const INFO_TYPES = PLAYLIST_ITEM_TYPES.filter(t => t.startsWith('info_card_'))

export default function PlaylistEditor(props: EditorMode) {
  const [meta, setMeta] = useState<PlaylistMeta | null>(null)
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<PlaylistItemType>('info_card_countdown')
  const [assets, setAssets] = useState<{ id: string; name: string; asset_type: string }[]>([])
  const [selectedAsset, setSelectedAsset] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const baseUrl = props.mode === 'template'
    ? `/api/playlist-templates/${props.templateId}`
    : `/api/board-meetings/${props.productionId}/playlist`

  const load = useCallback(async () => {
    const res = await fetch(baseUrl)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load playlist', 'error')
      setLoading(false)
      return
    }
    if (props.mode === 'template') {
      setMeta(body.template)
      setItems(body.items || [])
    } else if (body.playlist) {
      setMeta(body.playlist)
      setItems(body.items || [])
    } else {
      setMeta(null)
      setItems([])
    }
    setLoading(false)
  }, [baseUrl, props.mode])

  useEffect(() => { setLoading(true); load() }, [load])

  const loadAssets = async (typeFilter?: string) => {
    const q = typeFilter ? `?type=${typeFilter}` : ''
    const res = await fetch(`/api/media-assets${q}`)
    const body = await res.json()
    if (res.ok) setAssets((body.assets || []).map((a: { id: string; name: string; asset_type: string }) => ({ id: a.id, name: a.name, asset_type: a.asset_type })))
  }

  const saveMeta = async (patch: Record<string, unknown>) => {
    setBusy(true)
    const res = await fetch(baseUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) { toast(body.error || 'Save failed', 'error'); return }
    if (props.mode === 'template') setMeta(body.template)
    else setMeta(body.playlist)
    toast('Saved', 'success')
  }

  const addItem = async () => {
    const label = newLabel.trim() || INFO_CARD_LABELS[addType] || addType
    const payload: Record<string, unknown> = { item_type: addType, label }
    if (addType === 'video' || addType === 'image' || addType === 'bumper') {
      if (!selectedAsset) { toast('Select a media asset', 'error'); return }
      payload.media_asset_id = selectedAsset
    }
    setBusy(true)
    const itemsUrl = props.mode === 'template' ? `${baseUrl}/items` : `${baseUrl}/items`
    const res = await fetch(itemsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) { toast(body.error || 'Add failed', 'error'); return }
    setAddOpen(false)
    setNewLabel('')
    setSelectedAsset('')
    await load()
  }

  const removeItem = async (id: string) => {
    if (!(await confirmDialog({ message: 'Remove this item?', tone: 'danger', confirmLabel: 'Remove' }))) return
    setBusy(true)
    const res = await fetch(`${baseUrl}/items/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json(); toast(b.error || 'Delete failed', 'error'); return }
    await load()
  }

  const moveItem = async (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= items.length) return
    const ordered = [...items]
    const [row] = ordered.splice(index, 1)
    ordered.splice(next, 0, row)
    setBusy(true)
    const res = await fetch(`${baseUrl}/items/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: ordered.map(i => i.id) }),
    })
    setBusy(false)
    if (!res.ok) { toast('Reorder failed', 'error'); return }
    await load()
  }

  const openAdd = (type: PlaylistItemType) => {
    setAddType(type)
    setNewLabel(INFO_CARD_LABELS[type] || '')
    if (type === 'video') loadAssets('video')
    else if (type === 'image') loadAssets('image')
    else if (type === 'bumper') loadAssets('bumper')
    setAddOpen(true)
  }

  if (loading) return <Loader />
  if (!meta) return <p style={{ color: muted }}>No playlist loaded.</p>

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'flex-end' }}>
        <label style={{ fontSize: '13px', color: muted }}>
          Loop
          <select value={meta.loop_behavior} disabled={busy} onChange={e => saveMeta({ loop_behavior: e.target.value })} style={{ display: 'block', marginTop: '4px', minHeight: '40px', padding: '8px', borderRadius: '8px', border: `0.5px solid ${border}`, fontFamily: 'inherit' }}>
            <option value="loop_all">Loop playlist</option>
            <option value="play_once">Play once</option>
          </select>
        </label>
        {props.mode === 'meeting' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: muted, minHeight: '44px' }}>
              <input type="checkbox" checked={!!meta.play_during_live} onChange={e => saveMeta({ play_during_live: e.target.checked })} />
              Play during live
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: muted, minHeight: '44px' }}>
              <input type="checkbox" checked={!!meta.play_during_recess} onChange={e => saveMeta({ play_during_recess: e.target.checked })} />
              Play during recess
            </label>
          </>
        )}
      </div>

      <div>
        <button type="button" disabled={busy} onClick={() => openAdd('video')} style={btnStyle(border, text)}>+ Video</button>
        <button type="button" disabled={busy} onClick={() => openAdd('image')} style={btnStyle(border, text)}>+ Image</button>
        <button type="button" disabled={busy} onClick={() => openAdd('bumper')} style={btnStyle(border, text)}>+ Bumper</button>
        {INFO_TYPES.map(t => (
          <button key={t} type="button" disabled={busy} onClick={() => openAdd(t)} style={btnStyle(border, text)}>+ {INFO_CARD_LABELS[t]}</button>
        ))}
      </div>

      <div>
        {items.map((it, idx) => (
          <div>
            <div>
              <button type="button" disabled={busy || idx === 0} onClick={() => moveItem(idx, -1)} style={smallBtn(border, text)}>↑</button>
              <button type="button" disabled={busy || idx === items.length - 1} onClick={() => moveItem(idx, 1)} style={smallBtn(border, text)}>↓</button>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: text, fontSize: '14px' }}>{it.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: muted }}>{INFO_CARD_LABELS[it.item_type] || it.item_type}{it.duration_seconds ? ` · ${it.duration_seconds}s` : ''}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => removeItem(it.id)} style={{ ...smallBtn(border, text), color: '#ef4444', border: 'none' }}>Remove</button>
          </div>
        ))}
      </div>

      {items.length === 0 && <p style={{ color: muted, fontSize: '14px' }}>Playlist is empty. Add items above.</p>}

      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }} onClick={() => !busy && setAddOpen(false)}>
          <div style={{ background: cardBg, borderRadius: '12px', padding: '20px', maxWidth: '400px', width: '100%', border: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: text }}>Add {INFO_CARD_LABELS[addType] || addType}</h3>
            <input placeholder="Label" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: `0.5px solid ${border}`, fontFamily: 'inherit' }} />
            {(addType === 'video' || addType === 'image' || addType === 'bumper') && (
              <select value={selectedAsset} onChange={e => setSelectedAsset(e.target.value)} style={{ width: '100%', marginBottom: '12px', minHeight: '44px', padding: '8px', borderRadius: '8px', border: `0.5px solid ${border}`, fontFamily: 'inherit' }}>
                <option value="">Select asset…</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <div>
              <button type="button" disabled={busy} onClick={() => setAddOpen(false)} style={btnStyle(border, text)}>Cancel</button>
              <button type="button" disabled={busy} onClick={addItem} style={{ ...btnStyle(border, text), background: 'var(--brand-primary)', color: '#fff', border: 'none' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function btnStyle(border: string, text: string): React.CSSProperties {
  return { fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }
}

function smallBtn(border: string, text: string): React.CSSProperties {
  return { fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit', minWidth: '36px' }
}
