'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

interface Comment { id: string; body: string; user_id: string; created_at: string; user?: { name: string; avatar_color: string } | null }
interface TeamMember { id: string; name: string; avatar_color: string }

export default function CommentsSection({ entityType, entityId, currentUserId, team }: { entityType: 'production' | 'task'; entityId: string; currentUserId: string; team: TeamMember[] }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const inputBg = 'var(--surface-2)'

  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, user:team!comments_user_id_fkey(name, avatar_color)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }, [supabase, entityType, entityId])

  useEffect(() => { loadComments() }, [loadComments])

  // Realtime
  useEffect(() => {
    const channel = supabase.channel(`comments-${entityId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `entity_id=eq.${entityId}` }, () => { loadComments() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, entityId, loadComments])

  const postComment = async () => {
    if (!newComment.trim() || !currentUserId) return
    setPosting(true)

    const { data } = await supabase
      .from('comments')
      .insert({ entity_type: entityType, entity_id: entityId, user_id: currentUserId, body: newComment.trim() })
      .select('*, user:team!comments_user_id_fkey(name, avatar_color)')
      .single()

    // Handle @mentions
    const mentions = newComment.match(/@(\w+)/g)
    if (mentions && data) {
      const mentionedUsers = mentions.map(m => m.slice(1).toLowerCase())
      const matchedUsers = team.filter(t => mentionedUsers.some(mu => t.name.toLowerCase().includes(mu)))
      if (matchedUsers.length > 0) {
        const mentionRows = matchedUsers.map(u => ({ comment_id: data.id, user_id: u.id }))
        await supabase.from('comment_mentions').insert(mentionRows)
        // Create notifications for mentioned users
        const notifs = matchedUsers.filter(u => u.id !== currentUserId).map(u => ({
          user_id: u.id,
          type: 'mention',
          title: `${team.find(t => t.id === currentUserId)?.name || 'Someone'} mentioned you`,
          body: newComment.trim().slice(0, 100),
          action_url: entityType === 'production' ? `/dashboard/productions/${entityId}` : `/dashboard/tasks`,
        }))
        if (notifs.length > 0) await supabase.from('notifications').insert(notifs)
      }
    }

    if (data) setComments(prev => [...prev, data])
    setNewComment('')
    setPosting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() }
  }

  const handleInput = (value: string) => {
    setNewComment(value)
    const lastAt = value.lastIndexOf('@')
    if (lastAt >= 0 && lastAt === value.length - 1) {
      setShowSuggestions(true)
      setMentionFilter('')
    } else if (lastAt >= 0) {
      const afterAt = value.slice(lastAt + 1)
      if (!afterAt.includes(' ')) {
        setShowSuggestions(true)
        setMentionFilter(afterAt.toLowerCase())
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const insertMention = (member: TeamMember) => {
    const lastAt = newComment.lastIndexOf('@')
    const before = newComment.slice(0, lastAt)
    setNewComment(`${before}@${member.name.split(' ')[0]} `)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const renderBody = (body: string) => {
    return body.split(/(@\w+)/g).map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} style={{ color: 'var(--brand-primary)', fontWeight: 500 }}>{part}</span>
      }
      return part
    })
  }

  const filteredTeam = team.filter(t => !mentionFilter || t.name.toLowerCase().includes(mentionFilter))

  return (
    <div>
      {/* Comment list */}
      {comments.length === 0 ? (
        <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '20px 0' }}>No comments yet — start the conversation</p>
      ) : (
        <div style={{ marginBottom: '12px' }}>
          {comments.map(c => {
            const user = c.user || team.find(t => t.id === c.user_id)
            return (
              <div key={c.id} style={{ display: 'flex', gap: '10px', padding: '10px 0', borderBottom: `0.5px solid ${border}` }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: (user as any)?.avatar_color || 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>
                  {((user as any)?.name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: text }}>{(user as any)?.name || 'Unknown'}</span>
                    <span style={{ fontSize: '11px', color: muted }}>{formatTime(c.created_at)}</span>
                  </div>
                  <p style={{ fontSize: '14px', color: text, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>{renderBody(c.body)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New comment input */}
      <div style={{ position: 'relative' }}>
        {showSuggestions && filteredTeam.length > 0 && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--surface-1)', border: `1px solid ${border}`, borderRadius: '8px', marginBottom: '4px', overflow: 'hidden', zIndex: 5 }}>
            {filteredTeam.map(m => (
              <button key={m.id} onClick={() => insertMention(m)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', color: text, textAlign: 'left' as const }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
              >
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: m.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e' }}>{m.name.slice(0, 2).toUpperCase()}</div>
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment... Use @ to mention someone"
            style={{ flex: 1, background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none', resize: 'none' as const, minHeight: '38px', maxHeight: '120px', boxSizing: 'border-box' as const }}
            rows={1}
          />
          <button onClick={postComment} disabled={!newComment.trim() || posting} style={{ padding: '9px 14px', borderRadius: '8px', background: newComment.trim() ? 'var(--brand-primary)' : 'var(--surface-2)', color: newComment.trim() ? '#fff' : muted, border: 'none', cursor: newComment.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, flexShrink: 0, minHeight: '38px' }}>
            {posting ? '...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}