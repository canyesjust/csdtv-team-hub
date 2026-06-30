'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { formatDate } from '@/lib/format-date'
import { confirmDialog } from '@/lib/confirm'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Loader from '../../components/Loader'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'

interface Video {
  id: string; title: string; description: string | null; video_type: string; status: string
  production_id: string | null; school_department: string | null; school_year: string | null
  visibility: string; date_filmed: string | null; date_published: string | null
  thumbnail_url: string | null; project_file_location: string | null; raw_footage_location: string | null
  script: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string
  productions?: { title: string; production_number: number } | null
}
interface Talent { id: string; name: string; role_title: string | null; school: string | null; release_status: string; release_notes: string | null; student_employee_number: string | null }
interface Destination { id: string; platform: string; url: string | null; published_at: string | null; notes: string | null }
interface VFile { id: string; file_type: string; file_name: string; file_url: string; created_at: string }
interface Tag { id: string; tag: string }
interface TeamMember { id: string; name: string; role: string }
interface Production { id: string; title: string; production_number: number }

const STATUSES = ['Filming', 'Editing', 'Review', 'Published', 'Archived']
const VIDEO_TYPES = ['Recap', 'Promo', 'Event Coverage', 'Interview', 'B-Roll', 'Tutorial', 'Announcement', 'Highlight Reel', 'Other']
const VISIBILITIES = ['Public', 'Internal', 'Unlisted']
const PLATFORMS = ['YouTube', 'District Website', 'Social Media', 'Google Drive', 'Vimeo', 'Internal', 'Other']
const FILE_TYPES = ['script', 'release_form', 'shot_list', 'thumbnail', 'other']
const RELEASE_STATUSES = ['signed', 'verbal', 'minor_parent', 'pending', 'not_required']

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Filming': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  'Editing': { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  'Review': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  'Published': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  'Archived': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
}

const RELEASE_LABELS: Record<string, { label: string; color: string }> = {
  'signed': { label: 'Signed', color: '#22c55e' },
  'verbal': { label: 'Verbal', color: '#3b82f6' },
  'minor_parent': { label: 'Minor — parent', color: '#f59e0b' },
  'pending': { label: 'Pending', color: '#ef4444' },
  'not_required': { label: 'Not required', color: '#94a3b8' },
}

export default function VideoDetailPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const router = useRouter()
  const params = useParams()
  const videoId = params.id as string
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const [video, setVideo] = useState<Video | null>(null)
  const [talent, setTalent] = useState<Talent[]>([])
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [files, setFiles] = useState<VFile[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [productions, setProductions] = useState<Production[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'details' | 'checklist' | 'people' | 'files' | 'distribution'>('details')
  const [checklistItems, setChecklistItems] = useState<{ id: string; title: string; completed: boolean; sort_order: number }[]>([])
  const [newCheckItem, setNewCheckItem] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Video>>({})

  // Add forms
  const [newTag, setNewTag] = useState('')
  const [newTalent, setNewTalent] = useState({ name: '', role_title: '', school: '', release_status: 'pending', student_employee_number: '' })
  const [csvPaste, setCsvPaste] = useState('')
  const [showCsvPaste, setShowCsvPaste] = useState(false)
  const [newDest, setNewDest] = useState({ platform: 'YouTube', url: '', notes: '' })
  const [newFile, setNewFile] = useState({ file_type: 'other', file_name: '', file_url: '' })

  const inputStyle: React.CSSProperties = { width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500, color: muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [videoRes, talentRes, destRes, filesRes, tagsRes, userRes, prodsRes] = await Promise.all([
      supabase.from('videos').select('*, productions(title, production_number)').eq('id', videoId).single(),
      supabase.from('video_talent').select('*').eq('video_id', videoId).order('created_at'),
      supabase.from('video_destinations').select('*').eq('video_id', videoId),
      supabase.from('video_files').select('*').eq('video_id', videoId).order('created_at'),
      supabase.from('video_tags').select('*').eq('video_id', videoId),
      resolveEffectiveTeamRow<TeamMember>(supabase, 'id, name, role'),
      supabase.from('productions').select('id, title, production_number').order('production_number', { ascending: false }).limit(100),
    ])
    setVideo(videoRes.data)
    setTalent(talentRes.data || [])
    setDestinations(destRes.data || [])
    setFiles(filesRes.data || [])
    setTags(tagsRes.data || [])
    setCurrentUser(userRes)
    setProductions(prodsRes.data || [])
    // Load video checklist
    const { data: checkData } = await supabase.from('video_checklist_items').select('*').eq('video_id', videoId).order('sort_order')
    setChecklistItems(checkData || [])
    setLoading(false)
  }, [supabase, videoId])

  useEffect(() => { loadData() }, [loadData])

  const updateVideo = async (updates: Partial<Video>) => {
    if (!video) return
    await supabase.from('videos').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', video.id)
    setVideo(prev => prev ? { ...prev, ...updates } : prev)
  }

  const saveEdit = async () => {
    await updateVideo(editForm)
    setEditing(false)
    loadData()
  }

  const addTag = async () => {
    if (!newTag.trim() || !video) return
    const { data } = await supabase.from('video_tags').insert({ video_id: video.id, tag: newTag.trim() }).select('*').single()
    if (data) setTags(prev => [...prev, data])
    setNewTag('')
  }

  const removeTag = async (tagId: string) => {
    await supabase.from('video_tags').delete().eq('id', tagId)
    setTags(prev => prev.filter(t => t.id !== tagId))
  }

  const addTalent = async () => {
    if (!newTalent.name || !video) return
    const { data } = await supabase.from('video_talent').insert({ video_id: video.id, name: newTalent.name, role_title: newTalent.role_title || null, school: newTalent.school || null, release_status: newTalent.release_status, student_employee_number: newTalent.student_employee_number || null }).select('*').single()
    if (data) setTalent(prev => [...prev, data])
    setNewTalent({ name: '', role_title: '', school: '', release_status: 'pending', student_employee_number: '' })
  }

  const importCsv = async () => {
    if (!csvPaste.trim() || !video) return
    const lines = csvPaste.trim().split('\n').filter(l => l.trim())
    const rows: { video_id: string; name: string; role_title: string | null; school: string | null; student_employee_number: string | null; release_status: string }[] = []
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map(s => s.trim()).filter(Boolean)
      if (parts.length === 0) continue
      // Skip header rows
      if (parts[0].toLowerCase() === 'name') continue
      rows.push({
        video_id: video.id,
        name: parts[0],
        role_title: parts[1] || null,
        school: parts[2] || null,
        student_employee_number: parts[3] || null,
        release_status: 'pending',
      })
    }
    if (rows.length === 0) return
    const { data } = await supabase.from('video_talent').insert(rows).select('*')
    if (data) setTalent(prev => [...prev, ...data])
    setCsvPaste('')
    setShowCsvPaste(false)
  }

  const removeTalent = async (id: string) => {
    await supabase.from('video_talent').delete().eq('id', id)
    setTalent(prev => prev.filter(t => t.id !== id))
  }

  const updateRelease = async (id: string, status: string) => {
    await supabase.from('video_talent').update({ release_status: status }).eq('id', id)
    setTalent(prev => prev.map(t => t.id === id ? { ...t, release_status: status } : t))
  }

  const addDestination = async () => {
    if (!newDest.platform || !video) return
    const { data } = await supabase.from('video_destinations').insert({ video_id: video.id, platform: newDest.platform, url: newDest.url || null, notes: newDest.notes || null, published_at: new Date().toISOString().split('T')[0] }).select('*').single()
    if (data) setDestinations(prev => [...prev, data])
    setNewDest({ platform: 'YouTube', url: '', notes: '' })
  }

  const removeDestination = async (id: string) => {
    await supabase.from('video_destinations').delete().eq('id', id)
    setDestinations(prev => prev.filter(d => d.id !== id))
  }

  const addFile = async () => {
    if (!newFile.file_name || !newFile.file_url || !video || !currentUser) return
    const { data } = await supabase.from('video_files').insert({ video_id: video.id, file_type: newFile.file_type, file_name: newFile.file_name, file_url: newFile.file_url, uploaded_by: currentUser.id }).select('*').single()
    if (data) setFiles(prev => [...prev, data])
    setNewFile({ file_type: 'other', file_name: '', file_url: '' })
  }

  const removeFile = async (id: string) => {
    await supabase.from('video_files').delete().eq('id', id)
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const deleteVideo = async () => {
    if (!video || !(await confirmDialog({ message: 'Delete this video and all its data? This cannot be undone.', tone: 'danger' }))) return
    await supabase.from('videos').delete().eq('id', video.id)
    router.push('/dashboard/videos')
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>
  if (!video) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
      <p style={{ color: muted }}>Video not found</p>
      <Link href="/dashboard/videos" style={{ color: 'var(--brand-primary)' }}>Back to library</Link>
    </div>
  )

  const statusStyle = STATUS_COLORS[video.status] || STATUS_COLORS['Archived']
  const TABS = [
    { key: 'details', label: 'Details' },
    { key: 'checklist', label: `Checklist (${checklistItems.filter(c => c.completed).length}/${checklistItems.length})` },
    { key: 'people', label: `People & releases (${talent.length})` },
    { key: 'files', label: `Files (${files.length})` },
    { key: 'distribution', label: `Distribution (${destinations.length})` },
  ] as const

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <button onClick={() => router.push('/dashboard/videos')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', marginBottom: '16px', padding: 0 }}>
        ← Video library
      </button>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', background: statusStyle.bg, color: statusStyle.color, fontWeight: 500 }}>{video.status}</span>
          <select value={video.status} onChange={e => updateVideo({ status: e.target.value })} style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', background: 'var(--surface-2)', color: muted }}>{video.video_type}</span>
          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', background: 'var(--surface-2)', color: muted }}>{video.visibility}</span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: text, margin: '0 0 6px' }}>{video.title}</h1>
        {video.productions && (
          <Link href={`/dashboard/productions/${video.productions.production_number}`} style={{ fontSize: '13px', color: 'var(--brand-primary)', textDecoration: 'none' }}>
            🎬 Production #{video.productions.production_number} — {video.productions.title}
          </Link>
        )}
        {/* Tags */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px', alignItems: 'center' }}>
          {tags.map(t => (
            <span key={t.id} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: 'var(--surface-2)', color: muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {t.tag}
              <button onClick={() => removeTag(t.id)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0, opacity: 0.5 }}>×</button>
            </span>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add tag" style={{ background: 'transparent', border: `0.5px solid ${border}`, borderRadius: '6px', padding: '3px 8px', fontSize: '12px', color: text, outline: 'none', width: '100px', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--brand-primary)' : '2px solid transparent', padding: '10px 18px', fontSize: '14px', fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? 'var(--brand-primary)' : muted, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DETAILS TAB */}
      {/* CHECKLIST TAB */}
      {tab === 'checklist' && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          {/* Progress bar */}
          {checklistItems.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, height: '6px', background: 'var(--surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${(checklistItems.filter(c => c.completed).length / checklistItems.length) * 100}%`, height: '100%', background: '#22c55e', borderRadius: '3px', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '13px', color: muted, flexShrink: 0 }}>{checklistItems.filter(c => c.completed).length}/{checklistItems.length}</span>
            </div>
          )}

          {/* Seed template button */}
          {checklistItems.length === 0 && (
            <div style={{ textAlign: 'center' as const, padding: '16px 0 20px' }}>
              <p style={{ fontSize: '14px', color: muted, margin: '0 0 12px' }}>No checklist items yet</p>
              <button onClick={async () => {
                const defaults = ['Create thumbnail', 'Add subtitles/captions', 'Color grade and audio mix', 'Export at 1080p H.264', 'Review final cut', 'Upload to YouTube', 'Add to district website', 'Update video library entry', 'Notify organizer of publication', 'Archive project files']
                const inserts = defaults.map((title, i) => ({ video_id: videoId, title, sort_order: i }))
                const { data } = await supabase.from('video_checklist_items').insert(inserts).select('*')
                if (data) setChecklistItems(data)
              }} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                Load default export checklist
              </button>
            </div>
          )}

          {/* Checklist items */}
          {checklistItems.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: i < checklistItems.length - 1 ? `0.5px solid ${border}` : 'none' }}>
              <button onClick={async () => {
                const completed = !item.completed
                await supabase.from('video_checklist_items').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', item.id)
                setChecklistItems(prev => prev.map(c => c.id === item.id ? { ...c, completed } : c))
              }} style={{ width: '20px', height: '20px', borderRadius: '5px', border: `1.5px solid ${item.completed ? '#22c55e' : border}`, background: item.completed ? '#22c55e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.completed && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <span style={{ flex: 1, fontSize: '14px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none' }}>{item.title}</span>
              <button onClick={async () => {
                await supabase.from('video_checklist_items').delete().eq('id', item.id)
                setChecklistItems(prev => prev.filter(c => c.id !== item.id))
              }} style={{ fontSize: '14px', color: muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>×</button>
            </div>
          ))}

          {/* Add item */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} onKeyDown={async e => {
              if (e.key === 'Enter' && newCheckItem.trim()) {
                const { data } = await supabase.from('video_checklist_items').insert({ video_id: videoId, title: newCheckItem.trim(), sort_order: checklistItems.length }).select('*').single()
                if (data) { setChecklistItems(prev => [...prev, data]); setNewCheckItem('') }
              }
            }} placeholder="Add checklist item..." style={{ ...inputStyle, flex: 1, fontSize: '14px' }} />
            <button onClick={async () => {
              if (!newCheckItem.trim()) return
              const { data } = await supabase.from('video_checklist_items').insert({ video_id: videoId, title: newCheckItem.trim(), sort_order: checklistItems.length }).select('*').single()
              if (data) { setChecklistItems(prev => [...prev, data]); setNewCheckItem('') }
            }} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: newCheckItem.trim() ? 'var(--brand-primary)' : 'var(--surface-2)', color: newCheckItem.trim() ? '#fff' : muted, border: 'none', cursor: newCheckItem.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>Add</button>
          </div>
        </div>
      )}

      {tab === 'details' && (
        <div>
          {!editing ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button onClick={() => { setEditing(true); setEditForm({ title: video.title, description: video.description, video_type: video.video_type, visibility: video.visibility, production_id: video.production_id, school_department: video.school_department, school_year: video.school_year, date_filmed: video.date_filmed, date_published: video.date_published, thumbnail_url: video.thumbnail_url, project_file_location: video.project_file_location, raw_footage_location: video.raw_footage_location, script: video.script, notes: video.notes }) }} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: 'var(--surface-2)', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Edit details
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>Video info</h3>
                  {([['Type', video.video_type], ['Status', video.status], ['Visibility', video.visibility], ['School year', video.school_year], ['Date filmed', video.date_filmed ? formatDate(video.date_filmed) : null], ['Date published', video.date_published ? formatDate(video.date_published) : null]] as [string, string | null][]).map(([l, v]) => v ? (
                    <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                      <span style={{ color: muted, minWidth: '90px', flexShrink: 0 }}>{l}</span>
                      <span style={{ color: text, minWidth: 0, wordBreak: 'break-word' as const }}>{v}</span>
                    </div>
                  ) : null)}
                </div>
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 12px' }}>File locations</h3>
                  {([['Project file', video.project_file_location], ['Raw footage', video.raw_footage_location], ['Thumbnail', video.thumbnail_url]] as [string, string | null][]).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
                      <span style={{ color: muted, minWidth: '90px', flexShrink: 0 }}>{l}</span>
                      <span style={{ color: v ? text : muted, minWidth: 0, wordBreak: 'break-word' as const, opacity: v ? 1 : 0.5 }}>{v || 'Not set'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {video.description && (
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginTop: '14px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Description</h3>
                  <p style={{ fontSize: '14px', color: text, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' as const }}>{video.description}</p>
                </div>
              )}
              {video.script && (
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginTop: '14px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Script</h3>
                  <p style={{ fontSize: '14px', color: text, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace' }}>{video.script}</p>
                </div>
              )}
              {video.notes && (
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginTop: '14px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Notes</h3>
                  <p style={{ fontSize: '14px', color: text, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' as const }}>{video.notes}</p>
                </div>
              )}
              <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: `1px solid ${border}` }}>
                <button onClick={deleteVideo} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>Delete video</button>
              </div>
            </div>
          ) : (
            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Title</label><input value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Type</label><select value={editForm.video_type || ''} onChange={e => setEditForm(f => ({ ...f, video_type: e.target.value }))} style={inputStyle}>{VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label style={labelStyle}>Visibility</label><select value={editForm.visibility || ''} onChange={e => setEditForm(f => ({ ...f, visibility: e.target.value }))} style={inputStyle}>{VISIBILITIES.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                <div><label style={labelStyle}>Date filmed</label><input type="date" value={editForm.date_filmed || ''} onChange={e => setEditForm(f => ({ ...f, date_filmed: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Date published</label><input type="date" value={editForm.date_published || ''} onChange={e => setEditForm(f => ({ ...f, date_published: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Production</label><select value={editForm.production_id || ''} onChange={e => setEditForm(f => ({ ...f, production_id: e.target.value || null }))} style={inputStyle}><option value="">None</option>{productions.map(p => <option key={p.id} value={p.id}>#{p.production_number} {p.title}</option>)}</select></div>
                <div><label style={labelStyle}>School year</label><input value={editForm.school_year || ''} onChange={e => setEditForm(f => ({ ...f, school_year: e.target.value }))} style={inputStyle} /></div>
                <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Thumbnail URL</label><input value={editForm.thumbnail_url || ''} onChange={e => setEditForm(f => ({ ...f, thumbnail_url: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Project file location</label><input value={editForm.project_file_location || ''} onChange={e => setEditForm(f => ({ ...f, project_file_location: e.target.value }))} placeholder="e.g. Drive folder or Mac path" style={inputStyle} /></div>
                <div><label style={labelStyle}>Raw footage location</label><input value={editForm.raw_footage_location || ''} onChange={e => setEditForm(f => ({ ...f, raw_footage_location: e.target.value }))} placeholder="e.g. SD card backup folder" style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: '12px' }}><label style={labelStyle}>Description</label><textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} /></div>
              <div style={{ marginBottom: '12px' }}><label style={labelStyle}>Script</label><textarea value={editForm.script || ''} onChange={e => setEditForm(f => ({ ...f, script: e.target.value }))} placeholder="Paste script or shot list" style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const, fontFamily: 'monospace' }} /></div>
              <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Notes</label><textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} /></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={saveEdit} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>Save</button>
                <button onClick={() => setEditing(false)} style={{ padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PEOPLE & RELEASES TAB */}
      {tab === 'people' && (
        <div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: text, margin: 0 }}>Add person</h3>
              <button onClick={() => setShowCsvPaste(!showCsvPaste)} style={{ fontSize: '12px', color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {showCsvPaste ? 'Single entry' : 'Paste CSV list'}
              </button>
            </div>
            {showCsvPaste ? (
              <div>
                <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px' }}>Paste a list — one person per line. Format: Name, Role, School, Student/Employee # (comma or tab separated). Header row is auto-skipped.</p>
                <textarea value={csvPaste} onChange={e => setCsvPaste(e.target.value)} placeholder={"Jane Smith, Teacher, Hillcrest Elementary, E12345\nJohn Doe, Student, Midvale Middle, S67890\nSarah Johnson, Principal, Corner Canyon High"} style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' as const, fontFamily: 'monospace', fontSize: '13px', marginBottom: '10px' }} />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={importCsv} disabled={!csvPaste.trim()} style={{ padding: '10px 16px', borderRadius: '8px', background: csvPaste.trim() ? 'var(--brand-primary)' : 'var(--surface-2)', color: csvPaste.trim() ? '#fff' : muted, border: 'none', cursor: csvPaste.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500 }}>
                    Import {csvPaste.trim() ? `(${csvPaste.trim().split('\n').filter(l => l.trim() && l.trim().toLowerCase().split(/[,\t]/)[0] !== 'name').length} people)` : ''}
                  </button>
                  <span style={{ fontSize: '12px', color: muted }}>All imported as "Pending" release — update individually after</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Name *</label><input value={newTalent.name} onChange={e => setNewTalent(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '120px' }}><label style={labelStyle}>Role / title</label><input value={newTalent.role_title} onChange={e => setNewTalent(f => ({ ...f, role_title: e.target.value }))} placeholder="e.g. Principal" style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '120px' }}><label style={labelStyle}>School</label><input value={newTalent.school} onChange={e => setNewTalent(f => ({ ...f, school: e.target.value }))} style={inputStyle} /></div>
                <div style={{ minWidth: '120px' }}><label style={labelStyle}>Student/Emp #</label><input value={newTalent.student_employee_number} onChange={e => setNewTalent(f => ({ ...f, student_employee_number: e.target.value }))} placeholder="Optional" style={inputStyle} /></div>
                <div style={{ minWidth: '120px' }}><label style={labelStyle}>Release</label><select value={newTalent.release_status} onChange={e => setNewTalent(f => ({ ...f, release_status: e.target.value }))} style={inputStyle}>{RELEASE_STATUSES.map(s => <option key={s} value={s}>{RELEASE_LABELS[s].label}</option>)}</select></div>
                <button onClick={addTalent} disabled={!newTalent.name} style={{ padding: '10px 16px', borderRadius: '8px', background: newTalent.name ? 'var(--brand-primary)' : 'var(--surface-2)', color: newTalent.name ? '#fff' : muted, border: 'none', cursor: newTalent.name ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500, minHeight: '42px' }}>Add</button>
              </div>
            )}
          </div>
          {talent.length === 0 ? (
            <p style={{ color: muted, textAlign: 'center' as const, padding: '40px 0', fontSize: '14px' }}>No people added yet</p>
          ) : (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
              {talent.map((person, i) => {
                const rel = RELEASE_LABELS[person.release_status] || RELEASE_LABELS['pending']
                return (
                  <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < talent.length - 1 ? `0.5px solid ${border}` : 'none', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{person.name}</p>
                      <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0' }}>
                        {[person.role_title, person.school, person.student_employee_number ? `#${person.student_employee_number}` : null].filter(Boolean).join(' · ') || 'No details'}
                      </p>
                    </div>
                    <select value={person.release_status} onChange={e => updateRelease(person.id, e.target.value)} style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', background: `${rel.color}15`, color: rel.color, border: `0.5px solid ${rel.color}30`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, outline: 'none' }}>
                      {RELEASE_STATUSES.map(s => <option key={s} value={s}>{RELEASE_LABELS[s].label}</option>)}
                    </select>
                    <button onClick={() => removeTalent(person.id)} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: 0.7 }}>Remove</button>
                  </div>
                )
              })}
            </div>
          )}
          {talent.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              {Object.entries(RELEASE_LABELS).map(([key, { label, color }]) => {
                const count = talent.filter(t => t.release_status === key).length
                if (count === 0) return null
                return <span key={key} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', background: `${color}15`, color }}>{label}: {count}</span>
              })}
            </div>
          )}
        </div>
      )}

      {/* FILES TAB */}
      {tab === 'files' && (
        <div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Attach file link</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: '120px' }}><label style={labelStyle}>Type</label><select value={newFile.file_type} onChange={e => setNewFile(f => ({ ...f, file_type: e.target.value }))} style={inputStyle}>{FILE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Name *</label><input value={newFile.file_name} onChange={e => setNewFile(f => ({ ...f, file_name: e.target.value }))} placeholder="e.g. Final script v2" style={inputStyle} /></div>
              <div style={{ flex: 2, minWidth: '200px' }}><label style={labelStyle}>URL *</label><input value={newFile.file_url} onChange={e => setNewFile(f => ({ ...f, file_url: e.target.value }))} placeholder="Google Drive link or URL" style={inputStyle} /></div>
              <button onClick={addFile} disabled={!newFile.file_name || !newFile.file_url} style={{ padding: '10px 16px', borderRadius: '8px', background: newFile.file_name && newFile.file_url ? 'var(--brand-primary)' : 'var(--surface-2)', color: newFile.file_name && newFile.file_url ? '#fff' : muted, border: 'none', cursor: newFile.file_name && newFile.file_url ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500, minHeight: '42px' }}>Add</button>
            </div>
          </div>
          {files.length === 0 ? (
            <p style={{ color: muted, textAlign: 'center' as const, padding: '40px 0', fontSize: '14px' }}>No files attached yet</p>
          ) : (
            <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
              {files.map((file, i) => (
                <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < files.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'var(--surface-2)', color: muted, fontWeight: 500, textTransform: 'capitalize' as const }}>{file.file_type.replace('_', ' ')}</span>
                  <a href={file.file_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: '14px', color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{file.file_name}</a>
                  <span style={{ fontSize: '12px', color: muted }}>{new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <button onClick={() => removeFile(file.id)} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: 0.7 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DISTRIBUTION TAB */}
      {tab === 'distribution' && (
        <div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Add destination</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: '140px' }}><label style={labelStyle}>Platform</label><select value={newDest.platform} onChange={e => setNewDest(f => ({ ...f, platform: e.target.value }))} style={inputStyle}>{PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div style={{ flex: 2, minWidth: '200px' }}><label style={labelStyle}>URL</label><input value={newDest.url} onChange={e => setNewDest(f => ({ ...f, url: e.target.value }))} placeholder="https://..." style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Notes</label><input value={newDest.notes} onChange={e => setNewDest(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" style={inputStyle} /></div>
              <button onClick={addDestination} style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500, minHeight: '42px' }}>Add</button>
            </div>
          </div>
          {destinations.length === 0 ? (
            <p style={{ color: muted, textAlign: 'center' as const, padding: '40px 0', fontSize: '14px' }}>No destinations added yet — add where this video is published</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {destinations.map(dest => (
                <div key={dest.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: text }}>{dest.platform}</span>
                    <button onClick={() => removeDestination(dest.id)} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: 0.7 }}>Remove</button>
                  </div>
                  {dest.url && <a href={dest.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--brand-primary)', textDecoration: 'none', wordBreak: 'break-all' as const, display: 'block', marginBottom: '6px' }}>{dest.url}</a>}
                  {dest.notes && <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>{dest.notes}</p>}
                  {dest.published_at && <p style={{ fontSize: '12px', color: muted, margin: 0, opacity: 0.7 }}>Published {formatDate(dest.published_at)}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}