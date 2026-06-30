'use client'

import Link from 'next/link'
import { SIGNAGE_ANNOUNCEMENT_ICONS, type SignageAnnouncementIconId } from '@/lib/signage/announcement-icons'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { useTheme } from '@/lib/theme'
import { confirmDialog } from '@/lib/confirm'
import { useSignage } from './SignageProvider'
import { toast } from '@/lib/toast'
import SignageFloorMap from './SignageFloorMap'

export type SignageArea = { id: string; name: string; slug: string }
export type SignageScreen = { id: string; code: string; name: string; area_id: string | null }

export type TargetingValue = {
  all_screens: boolean
  target_area_ids: string[]
  target_screen_ids: string[]
}

/** Hub dashboard admin styles — ports reference sections 7–10. */
export function useSignageAdminStyles(theme: string) {
  const base = useSignageTheme(theme)
  const { dark, text, muted, border, cardBg, inputBg } = base
  const info = dark ? '#7eb8e8' : '#185fa5'
  const infoBg = dark ? 'rgba(30, 108, 181, 0.18)' : '#e6f1fb'
  const infoBorder = dark ? 'rgba(126, 184, 232, 0.35)' : '#b5d4f4'
  const inputBorder = dark ? border : '#d3d6dd'
  const segBg = dark ? '#13203a' : '#eef0f3'

  return {
    ...base,
    info,
    infoBg,
    infoBorder,
    inputBorder,
    segBg,
    lbl: { fontSize: 12, color: muted, margin: '0 0 5px' } satisfies React.CSSProperties,
    input: {
      height: 34,
      border: `1px solid ${inputBorder}`,
      borderRadius: 8,
      background: inputBg,
      color: text,
      padding: '0 10px',
      fontSize: 13,
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    } satisfies React.CSSProperties,
    textarea: {
      border: `1px solid ${inputBorder}`,
      borderRadius: 8,
      background: inputBg,
      color: text,
      padding: '8px 10px',
      fontSize: 13,
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      resize: 'vertical',
    } satisfies React.CSSProperties,
    btn: {
      fontSize: 13,
      padding: '7px 13px',
      borderRadius: 8,
      border: `1px solid ${inputBorder}`,
      background: dark ? 'transparent' : '#fff',
      color: text,
      cursor: 'pointer',
      fontFamily: 'inherit',
    } satisfies React.CSSProperties,
    btnPrimary: {
      fontSize: 13,
      padding: '7px 13px',
      borderRadius: 8,
      border: `1px solid ${info}`,
      background: dark ? 'transparent' : '#fff',
      color: info,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontWeight: 500,
    } satisfies React.CSSProperties,
    btnSmall: {
      padding: '2px 8px',
      fontSize: 11,
      borderRadius: 8,
      border: `1px solid ${inputBorder}`,
      background: dark ? 'transparent' : '#fff',
      color: text,
      cursor: 'pointer',
      fontFamily: 'inherit',
    } satisfies React.CSSProperties,
    card: {
      background: cardBg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '16px 18px',
    } satisfies React.CSSProperties,
    cardCompact: {
      background: cardBg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '8px 12px',
    } satisfies React.CSSProperties,
    h3: { fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: text } satisfies React.CSSProperties,
    seg: (active: boolean): React.CSSProperties => ({
      fontSize: 13,
      padding: '5px 12px',
      borderRadius: 8,
      color: active ? text : muted,
      background: active ? segBg : 'transparent',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
    }),
    chip: (active: boolean): React.CSSProperties => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12.5,
      padding: '5px 11px',
      borderRadius: 8,
      margin: '0 6px 6px 0',
      border: `1px solid ${active ? infoBorder : inputBorder}`,
      color: active ? info : muted,
      background: active ? infoBg : (dark ? 'transparent' : '#fff'),
      cursor: 'pointer',
      fontFamily: 'inherit',
    }),
    thumb: {
      background: dark ? '#13203a' : '#eef0f3',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: muted,
      flex: 'none',
    } satisfies React.CSSProperties,
    row: {
      display: 'flex',
      gap: 14,
      flexWrap: 'wrap',
    } satisfies React.CSSProperties,
    drop: {
      border: `1px dashed ${dark ? border : '#c4c8d0'}`,
      borderRadius: 8,
      padding: 18,
      textAlign: 'center',
      color: muted,
      fontSize: 13,
      cursor: 'pointer',
    } satisfies React.CSSProperties,
    tbl: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
    } satisfies React.CSSProperties,
    th: {
      textAlign: 'left',
      padding: 7,
      fontSize: 11,
      color: muted,
      fontWeight: 500,
    } satisfies React.CSSProperties,
    td: {
      padding: '9px 7px',
      fontSize: 12.5,
      borderTop: `1px solid ${border}`,
      color: text,
    } satisfies React.CSSProperties,
    tdMuted: {
      padding: '9px 7px',
      fontSize: 12.5,
      borderTop: `1px solid ${border}`,
      color: muted,
    } satisfies React.CSSProperties,
    divider: {
      borderTop: `1px solid ${border}`,
      marginTop: 14,
      paddingTop: 14,
    } satisfies React.CSSProperties,
  }
}

type TargetingProps = {
  areas: SignageArea[]
  screens: SignageScreen[]
  value: TargetingValue
  onChange: (value: TargetingValue) => void
  lbl?: React.CSSProperties
}

export default function SignageTargetingPicker({ areas, screens, value, onChange, lbl }: TargetingProps) {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const [showScreens, setShowScreens] = useState(value.target_screen_ids.length > 0)
  const [view, setView] = useState<'list' | 'map'>('list')

  const toggleAll = () => {
    onChange({ all_screens: !value.all_screens, target_area_ids: [], target_screen_ids: [] })
    setShowScreens(false)
  }

  const toggleArea = (id: string) => {
    const set = new Set(value.target_area_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange({ all_screens: false, target_area_ids: [...set], target_screen_ids: value.target_screen_ids })
  }

  const toggleScreen = (id: string) => {
    const set = new Set(value.target_screen_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange({ all_screens: false, target_area_ids: value.target_area_ids, target_screen_ids: [...set] })
  }

  return (
    <div>
      {lbl && <p style={lbl}>Show on</p>}
      <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 9, background: s.segBg, marginBottom: 10 }}>
        <button type="button" onClick={() => setView('list')} style={s.seg(view === 'list')}>List</button>
        <button type="button" onClick={() => setView('map')} style={s.seg(view === 'map')}>Map</button>
      </div>
      {view === 'map' ? (
        <SignageFloorMap mode="select" value={value} onChange={onChange} />
      ) : (
        <>
          <div>
            <button type="button" onClick={toggleAll} style={s.chip(value.all_screens)}>
              {value.all_screens ? '✓ ' : ''}All screens
            </button>
            {!value.all_screens && areas.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleArea(a.id)}
                style={s.chip(value.target_area_ids.includes(a.id))}
              >
                {value.target_area_ids.includes(a.id) ? '✓ ' : ''}{a.name}
              </button>
            ))}
            {!value.all_screens && (
              <button
                type="button"
                onClick={() => setShowScreens(v => !v)}
                style={s.chip(showScreens || value.target_screen_ids.length > 0)}
              >
                {showScreens ? '− ' : '+ '}Specific screen
              </button>
            )}
          </div>
          {!value.all_screens && showScreens && (
            <div style={{ marginTop: 4, maxHeight: 140, overflowY: 'auto' }}>
              {screens.map(sc => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => toggleScreen(sc.id)}
                  style={s.chip(value.target_screen_ids.includes(sc.id))}
                >
                  {value.target_screen_ids.includes(sc.id) ? '✓ ' : ''}{sc.name} ({sc.code})
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

type AnnouncementIconPickerProps = {
  value: SignageAnnouncementIconId
  onChange: (value: SignageAnnouncementIconId) => void
  lbl?: React.CSSProperties
}

export function SignageAnnouncementIconPicker({ value, onChange, lbl }: AnnouncementIconPickerProps) {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)

  return (
    <div style={{ marginBottom: 12 }}>
      {lbl && <p style={lbl}>Icon</p>}
      <div>
        {SIGNAGE_ANNOUNCEMENT_ICONS.map(icon => (
          <button
            key={icon.id}
            type="button"
            title={icon.label}
            onClick={() => onChange(icon.id)}
            style={s.chip(value === icon.id)}
          >
            <span aria-hidden>{icon.emoji}</span> {icon.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type SignageNavItem = { href: string; label: string; managerOnly?: boolean }
type SignageNavGroup = { key: string; label: string; href?: string; items: SignageNavItem[] }

const SIGNAGE_NAV: SignageNavGroup[] = [
  { key: 'overview', label: '', items: [{ href: '/dashboard/signage/overview', label: 'Overview', managerOnly: true }] },
  {
    key: 'content',
    label: 'Content',
    items: [
      { href: '/dashboard/signage/content', label: 'Content' },
      { href: '/dashboard/signage/announcements', label: 'Announcements', managerOnly: true },
      { href: '/dashboard/signage/visitors', label: 'Visitors', managerOnly: true },
    ],
  },
  {
    key: 'screens',
    label: 'Screens',
    items: [
      { href: '/dashboard/signage/screens', label: 'Screens', managerOnly: true },
      { href: '/dashboard/signage/floor-plan', label: 'Floor plan', managerOnly: true },
      { href: '/dashboard/signage/areas', label: 'Areas', managerOnly: true },
      { href: '/dashboard/signage/wayfinding', label: 'Wayfinding', managerOnly: true },
    ],
  },
  {
    key: 'live',
    label: 'Live',
    items: [{ href: '/dashboard/signage/live', label: 'Live takeover', managerOnly: true }],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [
      { href: '/dashboard/signage/sites', label: 'Sites & locations', managerOnly: true },
      { href: '/dashboard/signage/template', label: 'Template', managerOnly: true },
      { href: '/dashboard/signage/access', label: 'Access', managerOnly: true },
      { href: '/dashboard/signage/settings', label: 'Signage settings', managerOnly: true },
    ],
  },
]

/** Pick black or white text for a solid color background so the active item is always legible. */
function readableText(hex: string): string {
  const m = (hex || '').replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (full.length < 6) return '#fff'
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0f2c3f' : '#fff'
}

export function SignageRail({ active, isManager, accent }: { active: string; isManager: boolean; accent: string }) {
  const { theme } = useTheme()
  const { muted, dark } = useSignageAdminStyles(theme)
  const idle = dark ? '#aebfda' : '#41506b'

  const isActive = (href: string) => active === href || active.startsWith(`${href}/`)

  // Every group is always visible; each group keeps only the destinations this user can reach.
  const groups = SIGNAGE_NAV
    .map(g => ({ ...g, items: g.items.filter(it => isManager || !it.managerOnly) }))
    .filter(g => g.items.length > 0)

  return (
    <nav aria-label="Signage sections">
      {groups.map(g => (
        <div key={g.key} style={{ marginBottom: 10 }}>
          {g.label && (
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: muted, margin: '6px 10px 4px' }}>
              {g.label}
            </p>
          )}
          {g.items.map(it => {
            const on = isActive(it.href)
            return (
              <Link
                key={it.href}
                href={it.href}
                prefetch
                aria-current={on ? 'page' : undefined}
                className={`sig-rail-item${on ? ' sig-rail-on' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 11px',
                  borderRadius: 9,
                  fontSize: 13.5,
                  marginBottom: 1,
                  textDecoration: 'none',
                  fontWeight: on ? 600 : 450,
                  color: on ? readableText(accent) : idle,
                  background: on ? accent : 'transparent',
                }}
              >
                {it.label}
              </Link>
            )
          })}
        </div>
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

export function SignagePageShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const pathname = usePathname()
  const { isManager, sites, activeSiteId, setActiveSite } = useSignage()
  const { theme } = useTheme()
  const { text, muted, border, inputBg, cardBg, dark } = useSignageTheme(theme)
  const activeSite = sites.find(s => s.id === activeSiteId)

  const accent = activeSite?.accent || '#065687'

  return (
    <div className="sig-shell">
      {/* Persistent signage rail — every section is visible at once, no hidden tab rows. */}
      <aside className="sig-rail" style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 14, padding: 12 }}>
        <span style={{ display: 'block', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: muted, fontWeight: 700, margin: '0 4px 5px' }}>Active location</span>
        {sites.length > 1 ? (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: '8px 28px 8px 11px', background: inputBg, marginBottom: 14 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 0 3px ${accent}22` }} />
            <select
              value={activeSiteId}
              onChange={e => setActiveSite(e.target.value)}
              aria-label="Active location"
              style={{ appearance: 'none', WebkitAppearance: 'none', background: 'transparent', border: 'none', color: text, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', width: '100%' }}
            >
              {sites.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 10, color: muted, pointerEvents: 'none', fontSize: 11 }}>▾</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: '8px 12px', background: inputBg, marginBottom: 14 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{activeSite?.name || 'Digital signage'}</span>
          </div>
        )}
        <SignageRail active={pathname} isManager={isManager} accent={accent} />
      </aside>

      <div className="sig-main" style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 3px', color: text }}>{title}</h1>
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>
            {activeSite && (
              <span style={{ color: text, fontWeight: 600 }}>{activeSite.name}</span>
            )}
            {activeSite ? ' · ' : ''}
            {subtitle ?? 'Digital signage'}
          </p>
        </div>
        {children}
      </div>

      <style>{`
        .sig-shell { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .sig-rail-item { transition: background .12s ease, color .12s ease; }
        .sig-rail-item:not(.sig-rail-on):hover { background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(6,86,135,0.07)'}; color: ${dark ? '#ecf3ff' : '#112a3d'}; }
        @media (min-width: 900px) {
          .sig-shell { grid-template-columns: 226px minmax(0, 1fr); gap: 22px; align-items: start; }
          .sig-rail { position: sticky; top: 72px; }
        }
      `}</style>
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
      onClick={async () => {
        if (!(await confirmDialog(confirmMessage))) return
        void onConfirm()
      }}
    >
      {label}
    </button>
  )
}

const editBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: '#1e6cb5',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
}

export function SignageListHint({ color, children = 'Click a name to edit.' }: { color: string; children?: ReactNode }) {
  return (
    <p style={{ fontSize: 12, color, margin: '0 0 10px' }}>
      {children}
    </p>
  )
}

/** Primary label in a list/table row — opens the edit form (matches Screens page). */
export function SignageRowEditButton({
  onClick,
  children,
  textColor,
  fontWeight,
}: {
  onClick: () => void
  children: ReactNode
  textColor: string
  fontWeight?: number | string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Edit"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: textColor,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        textAlign: 'left',
        fontWeight: fontWeight ?? 'inherit',
      }}
    >
      {children}
    </button>
  )
}

export function SignageEditButton({ label = 'Edit', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" style={editBtnStyle} onClick={onClick}>
      {label}
    </button>
  )
}

export function formatSignageDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function layoutLabel(layout: string): string {
  if (layout === 'full_bleed') return 'Full bleed'
  if (layout === 'wayfinding') return 'Wayfinding'
  if (layout === 'zoned2') return 'Zoned 2'
  if (!layout || layout === 'inherit') return 'Inherit'
  return 'Zoned'
}

export function orientationLabel(orientation: string): string {
  return orientation === 'portrait' ? 'Portrait' : 'Landscape'
}
