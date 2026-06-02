'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { useRouter } from 'next/navigation'
import Loader from './Loader'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  created_at: string
  action_url: string | null
}

interface Props {
  onClose: () => void
  onUnreadChange: (count: number) => void
  userId: string | null
}

export default function NotificationPanel({ onClose, onUnreadChange, userId }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const router = useRouter()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const text   = 'var(--text-primary)'
  const muted  = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const bg     = 'var(--surface-1)'

  const loadNotifications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
    const unread = (data || []).filter(n => !n.read).length
    onUnreadChange(unread)
    setLoading(false)
  }, [supabase, onUnreadChange, userId])

  useEffect(() => { loadNotifications() }, [loadNotifications])

  const markAllRead = async () => {
    if (!userId) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    onUnreadChange(0)
  }

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    const unread = notifications.filter(n => !n.read && n.id !== id).length
    onUnreadChange(unread)
  }

  const formatTime = (d: string) => {
    const date = new Date(d)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const typeIcon = (type: string) => {
    if (type === 'assigned') return '📋'
    if (type === 'completed') return '✅'
    if (type === 'production') return '🎬'
    if (type === 'weekly_backup') return '💾'
    return '🔔'
  }

  return (
    <div style={{ position: 'fixed', top: '52px', right: '12px', width: '340px', maxHeight: '480px', background: bg, border: `0.5px solid ${border}`, borderRadius: '12px', boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.12)', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>Notifications</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {notifications.some(n => !n.read) && (
            <button onClick={markAllRead} style={{ fontSize: '13px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Mark all read</button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}><Loader size={32} /></div>
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '40px 20px' }}>
            <p style={{ fontSize: '15px', color: muted, margin: 0 }}>No notifications yet</p>
          </div>
        ) : notifications.map(n => (
          <div
            key={n.id}
            onClick={() => { markRead(n.id); if (n.action_url) { onClose(); router.push(n.action_url) } }}
            style={{ padding: '12px 16px', borderBottom: `0.5px solid ${border}`, cursor: 'pointer', background: n.read ? 'transparent' : (dark ? 'rgba(30,108,181,0.08)' : 'rgba(30,108,181,0.04)'), display: 'flex', gap: '10px', alignItems: 'flex-start' }}
          >
            <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{typeIcon(n.type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '15px', fontWeight: n.read ? 400 : 500, color: text, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{n.title}</p>
              {n.body && <p style={{ fontSize: '13px', color: muted, margin: '0 0 3px', lineHeight: 1.4 }}>{n.body}</p>}
              <p style={{ fontSize: '10px', color: muted, margin: 0 }}>{formatTime(n.created_at)}</p>
            </div>
            {!n.read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#1e6cb5', flexShrink: 0, marginTop: '4px' }} />}
          </div>
        ))}
      </div>
    </div>
  )
}