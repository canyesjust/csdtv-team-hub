'use client'

import { useTheme } from '@/lib/theme'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import NotificationPanel from './NotificationPanel'
import SearchPanel from './SearchPanel'

const NAV_ITEMS = [
  { section: 'Main', items: [{ label: 'Home', href: '/dashboard', icon: 'home' }] },
  { section: 'Work', items: [
    { label: 'Productions', href: '/dashboard/productions', icon: 'video' },
    { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
    { label: 'Schedule', href: '/dashboard/schedule', icon: 'calendar' },
    { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
    { label: 'Video library', href: '/dashboard/videos', icon: 'film' },
  ]},
  { section: 'Resources', items: [
    { label: 'Reports', href: '/dashboard/reports', icon: 'chart' },
    { label: 'Contacts', href: '/dashboard/contacts', icon: 'contact' },
    { label: 'Notes', href: '/dashboard/notes', icon: 'notes' },
    { label: 'Knowledge base', href: '/dashboard/knowledge', icon: 'book' },
    { label: 'Quick links', href: '/dashboard/links', icon: 'link' },
    { label: 'Onboarding', href: '/dashboard/onboarding', icon: 'star' },
  ]},
  { section: 'Account', items: [
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ]},
]

const BOTTOM_NAV = [
  { label: 'Home', href: '/dashboard', icon: 'home' },
  { label: 'Prods', href: '/dashboard/productions', icon: 'video' },
  { label: 'Tasks', href: '/dashboard/tasks', icon: 'check' },
  { label: 'Schedule', href: '/dashboard/schedule', icon: 'calendar' },
  { label: 'More', href: '#more', icon: 'more' },
]

const MORE_ITEMS = [
  { label: 'Equipment', href: '/dashboard/equipment', icon: 'equipment' },
  { label: 'Video library', href: '/dashboard/videos', icon: 'film' },
  { label: 'Reports', href: '/dashboard/reports', icon: 'chart' },
  { label: 'Contacts', href: '/dashboard/contacts', icon: 'contact' },
  { label: 'Notes', href: '/dashboard/notes', icon: 'notes' },
  { label: 'Knowledge base', href: '/dashboard/knowledge', icon: 'book' },
  { label: 'Quick links', href: '/dashboard/links', icon: 'link' },
  { label: 'Onboarding', href: '/dashboard/onboarding', icon: 'star' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
]

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
  video: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>,
  check: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  book: <><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></>,
  link: <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  equipment: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 3v4M8 3v4M6 11h12M6 15h8"/></>,
  film: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></>,
  calview: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="22"/><line x1="15" y1="4" x2="15" y2="22"/></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  contact: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  notes: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></>,
}

function Icon({ type, size = 16 }: { type: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[type]}
    </svg>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userColor, setUserColor] = useState('#e8a020')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([])

  // Global toast listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type = 'info' } = (e as CustomEvent).detail
      const id = Date.now()
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
    }
    window.addEventListener('toast', handler)
    return () => window.removeEventListener('toast', handler)
  }, [])

  const dark = theme === 'dark'
  const bg       = dark ? '#0a0f1e' : '#f8f9fc'
  const sidebar  = dark ? '#0d1525' : '#ffffff'
  const border   = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const text     = dark ? '#f0f4ff' : '#1a1f36'
  const muted    = dark ? '#8899bb' : '#6b7280'
  const searchBg = dark ? '#0d1525' : '#f3f4f6'
  const iconBg   = dark ? 'rgba(255,255,255,0.05)' : '#f3f4f6'

  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Auto-link supabase_user_id for new users who logged in via magic link
      // Check if there's a team record for this email with no supabase_user_id
      const { data: teamByEmail } = await supabase
        .from('team')
        .select('id, name, role, avatar_color, supabase_user_id')
        .eq('email', session.user.email!)
        .single()

      if (teamByEmail && !teamByEmail.supabase_user_id) {
        // Link this auth user to their team record
        await supabase
          .from('team')
          .update({ supabase_user_id: session.user.id })
          .eq('id', teamByEmail.id)
        setUserName(teamByEmail.name)
        setUserRole(teamByEmail.role)
        setUserColor(teamByEmail.avatar_color || '#e8a020')
        setUserId(teamByEmail.id)
        return
      }

      // Normal lookup by supabase_user_id
      const { data } = await supabase
        .from('team')
        .select('id, name, role, avatar_color')
        .eq('supabase_user_id', session.user.id)
        .single()
      if (data) {
        setUserName(data.name)
        setUserRole(data.role)
        setUserColor(data.avatar_color || '#e8a020')
        setUserId(data.id)
      }
    }
    loadUser()
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    const loadUnread = async () => {
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)
      setUnreadCount(count || 0)
    }
    loadUnread()
    // Subscribe to realtime notification changes
    const channel = supabase.channel('notifications-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => { loadUnread() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, userId])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }, [supabase, router])

  const isActive = (href: string) => href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  const NavLink = ({ href, icon, label, onClick }: { href: string; icon: string; label: string; onClick?: () => void }) => (
    <Link href={href} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
      borderRadius: '8px', fontSize: '15px', marginBottom: '2px', textDecoration: 'none',
      borderLeft: isActive(href) ? '2px solid #1e6cb5' : '2px solid transparent',
      background: isActive(href) ? 'rgba(30,108,181,0.12)' : 'transparent',
      color: isActive(href) ? '#5ba3e0' : muted,
      fontWeight: isActive(href) ? 500 : 400, minHeight: '40px',
    }}>
      <Icon type={icon} />
      {label}
    </Link>
  )

  const sidebarContent = (onNavClick?: () => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: sidebar }}>
      <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${border}` }}>
        <Image src="/images/CSDtv Logo - New Logo Outlined.png" alt="CSDtv" width={110} height={48} style={{ objectFit: 'contain' }} priority />
      </div>
      <nav style={{ flex: 1, overflowY: 'auto' as const, padding: '8px' }}>
        {NAV_ITEMS.map(({ section, items }) => (
          <div key={section}>
            <p style={{ fontSize: '9px', fontWeight: 500, color: muted, letterSpacing: '1.5px', textTransform: 'uppercase' as const, padding: '10px 8px 4px', margin: 0 }}>{section}</p>
            {items.map(item => <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} onClick={onNavClick} />)}
          </div>
        ))}
      </nav>
      <div style={{ padding: '8px', borderTop: `0.5px solid ${border}` }}>
        {userName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', marginBottom: '4px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: userColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, color: '#0a0f1e', flexShrink: 0 }}>
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{userName}</p>
              <p style={{ fontSize: '13px', color: muted, margin: 0, textTransform: 'capitalize' as const }}>{userRole}</p>
            </div>
          </div>
        )}
        <button onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', fontSize: '15px', color: muted, background: 'none', border: 'none', cursor: 'pointer', width: '100%', fontFamily: 'inherit', minHeight: '40px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: bg, color: text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      <aside className="csdtv-sidebar" style={{ width: '220px', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', borderRight: `0.5px solid ${border}`, display: 'none', flexDirection: 'column' }}>
        {sidebarContent()}
      </aside>

      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMobileOpen(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
          <aside style={{ position: 'relative', width: '260px', height: '100%', borderRight: `0.5px solid ${border}`, zIndex: 1 }} onClick={e => e.stopPropagation()}>
            {sidebarContent(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {showMore && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowMore(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: sidebar, borderRadius: '20px 20px 0 0', padding: '12px 16px 40px', zIndex: 1 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 0 4px' }}>More</p>
              <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: '8px', fontSize: '18px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {MORE_ITEMS.map(item => (
              <Link key={item.href} href={item.href} onClick={() => setShowMore(false)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 12px', borderRadius: '12px', textDecoration: 'none', marginBottom: '4px', background: isActive(item.href) ? 'rgba(30,108,181,0.12)' : 'transparent', color: isActive(item.href) ? '#5ba3e0' : text }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: isActive(item.href) ? 'rgba(30,108,181,0.2)' : (dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive(item.href) ? '#5ba3e0' : muted }}>
                  <Icon type={item.icon} size={18} />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 500 }}>{item.label}</span>
              </Link>
            ))}
            <div style={{ height: '1px', background: border, margin: '12px 0' }} />
            <button onClick={() => { setShowMore(false); handleSignOut() }} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 12px', borderRadius: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%', fontSize: '15px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </div>
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className="csdtv-main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: `0.5px solid ${border}`, background: sidebar }}>
          <button className="csdtv-hamburger" onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', display: 'none', padding: '4px', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button onClick={() => { setShowSearch(true); setShowNotifications(false) }} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: searchBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '9px 14px', cursor: 'text', minHeight: '44px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span className="csdtv-search-label" style={{ fontSize: '15px', color: muted }}>Search productions, tasks, knowledge base...</span>
          </button>
          <button onClick={() => { setShowNotifications(!showNotifications); setShowSearch(false) }} style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '10px', background: iconBg, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: muted, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {unreadCount > 0 && <span style={{ position: 'absolute', top: '6px', right: '6px', minWidth: '16px', height: '16px', borderRadius: '8px', background: '#e8a020', fontSize: '9px', fontWeight: 700, color: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <button onClick={toggleTheme} style={{ width: '44px', height: '44px', borderRadius: '10px', background: iconBg, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>
            {dark ? '☀️' : '🌙'}
          </button>
        </header>

        <main className="csdtv-content" style={{ flex: 1, padding: '20px 16px' }}>
          {children}
        </main>

        <nav className="csdtv-mobile-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'none', background: sidebar, borderTop: `0.5px solid ${border}`, zIndex: 10, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', width: '100%' }}>
            {BOTTOM_NAV.map(item => {
              const active = item.href !== '#more' && isActive(item.href)
              const isMore = item.href === '#more'
              const itemStyle = { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '10px 0 8px', minHeight: '56px', color: active || (isMore && showMore) ? '#5ba3e0' : muted, textDecoration: 'none' as const, background: 'none' as const, border: 'none' as const, cursor: 'pointer' as const, fontFamily: 'inherit' as const }
              return isMore ? (
                <button key="more" onClick={() => { setShowMore(!showMore); setShowNotifications(false) }} style={itemStyle}>
                  <Icon type="more" size={24} />
                  <span style={{ fontSize: '11px', fontWeight: showMore ? 600 : 400, textAlign: 'center' as const }}>More</span>
                </button>
              ) : (
                <Link key={item.href} href={item.href} onClick={() => setShowMore(false)} style={itemStyle}>
                  <Icon type={item.icon} size={24} />
                  <span style={{ fontSize: '11px', fontWeight: active ? 600 : 400, textAlign: 'center' as const }}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>

      {showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} onUnreadChange={setUnreadCount} userId={userId} />}
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}

      {/* Toast notifications */}
      <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column' as const, gap: '8px', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit',
            color: '#fff', pointerEvents: 'auto', cursor: 'pointer',
            background: t.type === 'success' ? '#22c55e' : t.type === 'error' ? '#ef4444' : '#1e6cb5',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            animation: 'toast-in 0.25s ease-out',
            maxWidth: '380px',
          }} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✕ ' : ''}{t.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (min-width: 768px) {
          .csdtv-sidebar { display: flex !important; }
          .csdtv-main { margin-left: 220px !important; }
          .csdtv-hamburger { display: none !important; }
          .csdtv-mobile-nav { display: none !important; }
          .csdtv-content { padding: 24px 24px !important; }
        }
        @media (max-width: 767px) {
          .csdtv-hamburger { display: flex !important; }
          .csdtv-mobile-nav { display: flex !important; }
          .csdtv-content { padding: 12px 8px 80px 8px !important; }
          .csdtv-search-label { display: none !important; }
        }
      `}</style>
    </div>
  )
}