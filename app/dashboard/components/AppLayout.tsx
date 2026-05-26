'use client'

import { useTheme } from '@/lib/theme'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import NotificationPanel from './NotificationPanel'
import SearchPanel from './SearchPanel'
import ImpersonationBanner from './ImpersonationBanner'
import { statusBadge, uiStyles, statusTone } from '@/lib/ui/styles'
import { isStudentInternRole, STUDENT_INTERN_HOME_PATH } from '@/lib/roles'
import {
  buildStaffDashboardNav,
  buildStudentInternDashboardNav,
  type DashboardNavItem,
  type DashboardNavSection,
} from '@/lib/dashboard-nav'

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
  mail: <><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  notes: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></>,
  students: <><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 4 3 6 3s6-1.34 6-3v-5"/></>,
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
  const [accessState, setAccessState] = useState<'loading' | 'ready' | 'not-on-team' | 'link-error'>('loading')
  const [linkErrorMsg, setLinkErrorMsg] = useState('')
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([])
  const [sidebarNavScrolling, setSidebarNavScrolling] = useState(false)
  const sidebarScrollHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewAs, setViewAs] = useState<{
    subjectName: string
    subjectRole: string
    actorName: string
  } | null>(null)

  const handleSidebarNavScroll = useCallback(() => {
    setSidebarNavScrolling(true)
    if (sidebarScrollHideRef.current) clearTimeout(sidebarScrollHideRef.current)
    sidebarScrollHideRef.current = setTimeout(() => setSidebarNavScrolling(false), 800)
  }, [])

  useEffect(() => () => {
    if (sidebarScrollHideRef.current) clearTimeout(sidebarScrollHideRef.current)
  }, [])

  const isStudentIntern = isStudentInternRole(userRole)
  const isViewAs = viewAs != null
  const navResolved = useMemo(() => {
    const base = isStudentIntern ? buildStudentInternDashboardNav() : buildStaffDashboardNav(userRole)
    if (!isViewAs) return base
    const stripSettings = (items: DashboardNavItem[]) =>
      items.filter(item => item.href !== '/dashboard/settings')
    return {
      navItems: base.navItems.map(section => ({
        ...section,
        items: stripSettings(section.items),
      })),
      bottomNav: base.bottomNav,
      moreItems: stripSettings(base.moreItems),
    }
  }, [isStudentIntern, userRole, isViewAs])

  const navItemsResolved: DashboardNavSection[] = navResolved.navItems
  const bottomNavResolved: DashboardNavItem[] = navResolved.bottomNav
  const moreItemsResolved: DashboardNavItem[] = navResolved.moreItems

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
  const bg       = 'var(--bg-main)'
  const sidebar  = 'var(--bg-sidebar)'
  const border   = 'var(--border-subtle)'
  const text     = 'var(--text-primary)'
  const muted    = 'var(--text-muted)'
  const searchBg = 'var(--surface-2)'
  const iconBg   = 'var(--surface-2)'

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const applyTeam = (row: { id: string; name: string; role: string; avatar_color: string | null }) => {
        setUserName(row.name)
        setUserRole(row.role)
        setUserColor(row.avatar_color || '#e8a020')
        setUserId(row.id)
        setAccessState('ready')
      }

      try {
        const sessionRes = await fetch('/api/impersonate/session', { cache: 'no-store' })
        if (sessionRes.ok) {
          const session = (await sessionRes.json()) as {
            active?: boolean
            subject?: { id: string; name: string; role: string; avatar_color: string | null }
            actor?: { name: string }
          }
          if (session.active && session.subject) {
            applyTeam(session.subject)
            setViewAs({
              subjectName: session.subject.name,
              subjectRole: session.subject.role,
              actorName: session.actor?.name ?? 'Manager',
            })
            return
          }
        }
      } catch {
        /* fall through to normal team load */
      }
      setViewAs(null)

      const email = user.email
      if (!email) {
        setAccessState('not-on-team')
        return
      }

      const emailNorm = email.trim().toLowerCase()
      const { data: teamByEmail, error: emailLookupErr } = await supabase
        .from('team')
        .select('id, name, role, avatar_color, supabase_user_id')
        .eq('email', emailNorm)
        .maybeSingle()

      if (emailLookupErr) {
        setLinkErrorMsg(emailLookupErr.message)
        setAccessState('link-error')
        return
      }

      if (teamByEmail && !teamByEmail.supabase_user_id) {
        const { error: linkErr } = await supabase
          .from('team')
          .update({ supabase_user_id: user.id })
          .eq('id', teamByEmail.id)
          .is('supabase_user_id', null)
        if (linkErr) {
          setLinkErrorMsg(linkErr.message)
          setAccessState('link-error')
          return
        }
        applyTeam(teamByEmail)
        return
      }

      const { data: byUid, error: uidErr } = await supabase
        .from('team')
        .select('id, name, role, avatar_color')
        .eq('supabase_user_id', user.id)
        .maybeSingle()

      if (uidErr) {
        setLinkErrorMsg(uidErr.message)
        setAccessState('link-error')
        return
      }
      if (!byUid) {
        setAccessState('not-on-team')
        return
      }
      applyTeam(byUid)
    }
    loadUser()
  }, [supabase, router])

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

  if (accessState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color: muted, fontFamily: 'var(--font-sans)' }}>
        Loading…
      </div>
    )
  }

  if (accessState === 'not-on-team' || accessState === 'link-error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color: text, fontFamily: 'var(--font-sans)', padding: '2rem' }}>
        <div style={{ maxWidth: '420px', textAlign: 'center' as const, background: sidebar, border: `0.5px solid ${border}`, borderRadius: '16px', padding: '2rem' }}>
          <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            {accessState === 'link-error' ? 'Could not link your account' : 'Not on the team roster'}
          </p>
          <p style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {accessState === 'link-error'
              ? (linkErrorMsg || 'Your team record could not be linked. Try again or contact your administrator.')
              : 'You are signed in, but no CSDtv team record matches this account. Ask your administrator to invite you with this email address.'}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            style={{ background: '#1e6cb5', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 500, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === href
    if (href === STUDENT_INTERN_HOME_PATH) {
      if (pathname === '/dashboard/students' || pathname.startsWith('/dashboard/students/')) return false
      return pathname === href || pathname.startsWith(`${href}/`)
    }
    if (href === '/dashboard/onboarding') {
      return pathname === href || pathname.startsWith(`${href}/`)
    }
    if (href === '/dashboard/library') {
      return pathname === href || pathname.startsWith(`${href}/`) || pathname === '/dashboard/knowledge' || pathname === '/dashboard/links'
    }
    if (href === '/dashboard/board-meetings') {
      return (
        pathname === href ||
        pathname.startsWith(`${href}/`) ||
        pathname === '/dashboard/board-update' ||
        pathname === '/dashboard/voting-records'
      )
    }
    return pathname.startsWith(href)
  }

  const NavLink = ({ href, icon, label, onClick }: { href: string; icon: string; label: string; onClick?: () => void }) => (
    <Link href={href} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
      borderRadius: '8px', fontSize: '15px', marginBottom: '2px', textDecoration: 'none',
      borderLeft: isActive(href) ? '2px solid var(--brand-primary)' : '2px solid transparent',
      background: isActive(href) ? 'var(--status-info-bg)' : 'transparent',
      color: isActive(href) ? 'var(--brand-primary-strong)' : muted,
      fontWeight: isActive(href) ? 600 : 450, minHeight: '40px',
      transition: 'background var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard)',
    }}>
      <Icon type={icon} />
      {label}
    </Link>
  )

  const sidebarContent = (onNavClick?: () => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: sidebar }}>
      <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${border}` }}>
        <Image src="/images/CSDtv Logo - New Logo Outlined.png" alt="CSDtv" width={110} height={48} style={{ objectFit: 'contain' }} priority />
      </div>
      <nav
        className={`csdtv-scroll csdtv-sidebar-nav${sidebarNavScrolling ? ' csdtv-scroll--active' : ''}`}
        style={{ flex: 1, overflowY: 'auto' as const, padding: '8px 4px 8px 8px' }}
        onScroll={handleSidebarNavScroll}
      >
        {navItemsResolved.map(({ section, items }) =>
          items.length === 0 ? null : (
          <div key={section}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: muted, letterSpacing: '1.2px', textTransform: 'uppercase' as const, padding: '10px 8px 4px', margin: 0 }}>{section}</p>
            {items.map(item => <NavLink key={`${section}-${item.href}`} href={item.href} icon={item.icon} label={item.label} onClick={onNavClick} />)}
          </div>
        ))}
      </nav>
      <div style={{ padding: '8px', borderTop: `0.5px solid ${border}` }}>
        {userName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', marginBottom: '4px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: userColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, color: '#071020', flexShrink: 0 }}>
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
    <div style={{ display: 'flex', minHeight: '100vh', background: bg, color: text, fontFamily: 'var(--font-sans)' }}>

      <aside className="csdtv-sidebar sidebar-bg" style={{ width: '236px', flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', borderRight: `0.5px solid ${border}`, display: 'none', flexDirection: 'column', boxShadow: 'var(--shadow-soft)' }}>
        {sidebarContent()}
      </aside>

      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMobileOpen(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.56)' }} />
          <aside style={{ position: 'relative', width: '270px', height: '100%', borderRight: `0.5px solid ${border}`, zIndex: 1 }} onClick={e => e.stopPropagation()}>
            {sidebarContent(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {showMore && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowMore(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.48)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: sidebar, borderRadius: '20px 20px 0 0', padding: '12px 16px 40px', zIndex: 1, borderTop: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 0 4px' }}>More</p>
              <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: '8px', fontSize: '18px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {moreItemsResolved.map(item => (
              <Link key={item.href} href={item.href} onClick={() => setShowMore(false)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 12px', borderRadius: '12px', textDecoration: 'none', marginBottom: '4px', background: isActive(item.href) ? 'var(--status-info-bg)' : 'transparent', color: isActive(item.href) ? 'var(--brand-primary-strong)' : text }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: isActive(item.href) ? 'var(--status-info-bg)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive(item.href) ? 'var(--brand-primary-strong)' : muted }}>
                  <Icon type={item.icon} size={18} />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 500 }}>{item.label}</span>
              </Link>
            ))}
            <div style={{ height: '1px', background: border, margin: '12px 0' }} />
            <button onClick={() => { setShowMore(false); handleSignOut() }} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 12px', borderRadius: '12px', color: statusTone.danger.color, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%', fontSize: '15px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: statusTone.danger.background, display: 'flex', alignItems: 'center', justifyContent: 'center', color: statusTone.danger.color }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </div>
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className="csdtv-main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: `0.5px solid ${border}`, background: 'var(--bg-topbar)', backdropFilter: 'blur(8px)' }}>
          <button className="csdtv-hamburger" onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', display: 'none', padding: '4px', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          {!isStudentIntern ? (
            <button onClick={() => { setShowSearch(true); setShowNotifications(false) }} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: searchBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '9px 14px', cursor: 'text', minHeight: '44px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="csdtv-search-label" style={{ fontSize: '15px', color: muted }}>Search productions, tasks, library...</span>
            </button>
          ) : (
            <div style={{ flex: 1, minHeight: '44px' }} aria-hidden />
          )}
          <button onClick={() => { setShowNotifications(!showNotifications); setShowSearch(false) }} style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '10px', background: iconBg, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: muted, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {unreadCount > 0 && <span style={{ position: 'absolute', top: '6px', right: '6px', minWidth: '16px', height: '16px', fontSize: '9px', color: '#071020', display: 'flex', alignItems: 'center', justifyContent: 'center', ...statusBadge('warning', true) }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <button onClick={toggleTheme} style={{ width: '44px', height: '44px', borderRadius: '10px', background: iconBg, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>
            {dark ? '☀️' : '🌙'}
          </button>
        </header>

        {viewAs && (
          <ImpersonationBanner
            subjectName={viewAs.subjectName}
            subjectRole={viewAs.subjectRole}
            actorName={viewAs.actorName}
          />
        )}

        <main className="csdtv-content" style={{ flex: 1, padding: '20px 16px' }}>
          <div style={{ width: '100%', maxWidth: '1800px', margin: '0 auto' }}>
            {children}
          </div>
        </main>

        <nav className="csdtv-mobile-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'none', background: sidebar, borderTop: `0.5px solid ${border}`, zIndex: 10, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bottomNavResolved.length}, 1fr)`, width: '100%' }}>
            {bottomNavResolved.map(item => {
              const active = item.href !== '#more' && isActive(item.href)
              const isMore = item.href === '#more'
              const itemStyle = { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '10px 0 8px', minHeight: '56px', color: active || (isMore && showMore) ? 'var(--brand-primary-strong)' : muted, textDecoration: 'none' as const, background: 'none' as const, border: 'none' as const, cursor: 'pointer' as const, fontFamily: 'inherit' as const }
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
      {showSearch && !isStudentIntern && <SearchPanel onClose={() => setShowSearch(false)} />}

      {/* Toast notifications */}
      <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column' as const, gap: '8px', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit',
            color: '#fff', pointerEvents: 'auto', cursor: 'pointer',
            background: t.type === 'success' ? 'var(--status-success)' : t.type === 'error' ? 'var(--status-danger)' : 'var(--brand-primary)',
            boxShadow: 'var(--shadow-raised)',
            animation: 'toast-in 0.25s ease-out',
            maxWidth: '380px',
            border: uiStyles.cardSoft.border,
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
          .csdtv-main { margin-left: 236px !important; }
          .csdtv-hamburger { display: none !important; }
          .csdtv-mobile-nav { display: none !important; }
          .csdtv-content { padding: 20px 24px !important; }
        }
        @media (min-width: 1440px) {
          .csdtv-content { padding: 22px 28px !important; }
        }
        @media (max-width: 767px) {
          .csdtv-hamburger { display: flex !important; }
          .csdtv-mobile-nav { display: flex !important; }
          .csdtv-content { padding: 10px 10px 80px 10px !important; }
          .csdtv-search-label { display: none !important; }
        }
      `}</style>
    </div>
  )
}
