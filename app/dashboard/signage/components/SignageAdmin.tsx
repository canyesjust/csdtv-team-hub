'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useTheme } from '@/lib/theme'
import { useSignage } from './SignageProvider'
import { toast } from '@/lib/toast'

export type SignageArea = { id: string; name: string; slug: string }
export type SignageScreen = { id: string; code: string; name: string; area_id: string | null }

export type TargetingValue = {
  all_screens: boolean
  target_area_ids: string[]
  target_screen_ids: string[]
}

type Props = {
  areas: SignageArea[]
  screens: SignageScreen[]
  value: TargetingValue
  onChange: (value: TargetingValue) => void
  dark: boolean
  border: string
  text: string
  muted: string
}

export default function SignageTargetingPicker({ areas, screens, value, onChange, dark, border, text, muted }: Props) {
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 20,
    border: `1px solid ${active ? '#96b7c8' : border}`,
    background: active ? (dark ? '#1e3649' : '#e8f0f4') : 'transparent',
    color: text,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  })

  const toggleArea = (id: string) => {
    const set = new Set(value.target_area_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange({ ...value, all_screens: false, target_area_ids: [...set] })
  }

  const toggleScreen = (id: string) => {
    const set = new Set(value.target_screen_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange({ ...value, all_screens: false, target_screen_ids: [...set] })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: text, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value.all_screens}
          onChange={e => onChange({
            all_screens: e.target.checked,
            target_area_ids: e.target.checked ? [] : value.target_area_ids,
            target_screen_ids: e.target.checked ? [] : value.target_screen_ids,
          })}
        />
        All screens
      </label>
      {!value.all_screens && (
        <>
          <div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Areas</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {areas.map(a => (
                <button key={a.id} type="button" onClick={() => toggleArea(a.id)} style={chip(value.target_area_ids.includes(a.id))}>{a.name}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Specific screens</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
              {screens.map(s => (
                <button key={s.id} type="button" onClick={() => toggleScreen(s.id)} style={chip(value.target_screen_ids.includes(s.id))}>{s.name} ({s.code})</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function SignageSubnav({ active, isManager }: { active: string; isManager: boolean }) {
  const { theme } = useTheme()
  const { text, border } = useSignageTheme(theme)
  const links: { href: string; label: string; managerOnly?: boolean }[] = [
    { href: '/dashboard/signage/content', label: 'Content' },
    { href: '/dashboard/signage/screens', label: 'Screens', managerOnly: true },
    { href: '/dashboard/signage/areas', label: 'Areas', managerOnly: true },
    { href: '/dashboard/signage/announcements', label: 'Announcements', managerOnly: true },
    { href: '/dashboard/signage/wayfinding', label: 'Wayfinding', managerOnly: true },
    { href: '/dashboard/signage/visitors', label: 'Visitors', managerOnly: true },
    { href: '/dashboard/signage/live', label: 'Live', managerOnly: true },
    { href: '/dashboard/signage/settings', label: 'Settings', managerOnly: true },
  ]

  const isActive = (href: string) => active === href || active.startsWith(`${href}/`)

  return (
    <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
      {links.filter(l => isManager || !l.managerOnly).map(l => (
        <Link
          key={l.href}
          href={l.href}
          prefetch
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: isActive(l.href) ? 600 : 400,
            background: isActive(l.href) ? '#162844' : 'transparent',
            color: isActive(l.href) ? '#fefefe' : text,
            textDecoration: 'none',
            border: `1px solid ${border}`,
          }}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}

export function useSignageTheme(theme: string) {
  const dark = theme === 'dark'
  return {
    dark,
    text: dark ? '#f0f4ff' : '#1a1f36',
    muted: dark ? '#94a3b8' : '#6b7280',
    border: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    cardBg: dark ? '#0d1525' : '#ffffff',
    inputBg: dark ? '#0a0f1e' : '#f8f9fc',
  }
}

export function SignagePageShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname()
  const { isManager } = useSignage()
  const { theme } = useTheme()
  const { text, muted } = useSignageTheme(theme)

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: text }}>{title}</h1>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 16px' }}>Canyons Innovation Center signage</p>
      <SignageSubnav active={pathname} isManager={isManager} />
      {children}
    </div>
  )
}

const deleteBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: '#ef4444',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
}

export async function deleteSignageItem(apiPath: string, id: string): Promise<boolean> {
  const res = await fetch(`${apiPath}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    toast(data.error || 'Delete failed', 'error')
    return false
  }
  toast('Deleted', 'success')
  return true
}

type SignageDeleteButtonProps = {
  label?: string
  confirmMessage: string
  onConfirm: () => void | Promise<void>
}

export function SignageDeleteButton({ label = 'Delete', confirmMessage, onConfirm }: SignageDeleteButtonProps) {
  return (
    <button
      type="button"
      style={deleteBtnStyle}
      onClick={() => {
        if (!confirm(confirmMessage)) return
        void onConfirm()
      }}
    >
      {label}
    </button>
  )
}
