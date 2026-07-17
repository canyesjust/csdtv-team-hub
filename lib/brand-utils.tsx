import type { CSSProperties } from 'react'

/**
 * Helpers shared by the public brand viewer (app/brand/[code]) and the
 * manager brand editor (app/dashboard/brand/[code]).
 */

export const MAX_BRAND_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

export type LogoFormat = 'png' | 'jpg' | 'svg' | 'docx' | 'eps'

export const CONTENT_TYPE: Record<LogoFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  eps: 'application/postscript',
}

export function detectFormat(file: File): LogoFormat | null {
  const t = (file.type || '').toLowerCase()
  // Browsers/OSes report EPS inconsistently (often blank, sometimes
  // application/postscript or application/eps) -- check the extension first for it.
  const n = file.name.toLowerCase()
  if (n.endsWith('.eps')) return 'eps'
  if (t === 'image/png') return 'png'
  if (t === 'image/jpeg') return 'jpg'
  if (t === 'image/svg+xml') return 'svg'
  if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (t === 'application/postscript' || t === 'application/eps' || t === 'application/x-eps') return 'eps'
  if (n.endsWith('.png')) return 'png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg'
  if (n.endsWith('.svg')) return 'svg'
  if (n.endsWith('.docx')) return 'docx'
  return null
}

export function deriveLogoName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base || 'Logo'
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Coerce a stored value into a valid #rrggbb for a native <input type="color">.
export function toColorInputValue(v: string): string {
  const t = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(t)) return ('#' + t.slice(1).split('').map((c) => c + c).join('')).toLowerCase()
  return '#000000'
}

export type PreviewBg = 'check' | 'light' | 'dark'
export function previewBg(mode: PreviewBg): CSSProperties {
  if (mode === 'dark') return { background: '#2b2f3a' }
  if (mode === 'light') return { background: '#ffffff' }
  return {
    backgroundColor: '#ffffff',
    backgroundImage:
      'linear-gradient(45deg,#dfe3e8 25%,transparent 25%),linear-gradient(-45deg,#dfe3e8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe3e8 75%),linear-gradient(-45deg,transparent 75%,#dfe3e8 75%)',
    backgroundSize: '18px 18px',
    backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
  }
}

export const CATEGORY_ORDER = ['Official', 'Wordmark', 'Letterhead', 'PTA', 'Team/Sport', 'Specific', 'Other']

export function orderCategories(cats: string[]): string[] {
  const present = Array.from(new Set(cats))
  const known = CATEGORY_ORDER.filter((c) => present.includes(c))
  const extra = present.filter((c) => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b))
  return [...known, ...extra]
}

// Number of color slots in a brand color palette (client-safe copy of the constant in
// lib/server/brand-palettes.ts -- that file is server-only, so it cannot be imported
// from client components).
export const PALETTE_COLOR_SLOTS = 8

function FileBadgeBox({ label, compact }: { label: string; compact: boolean }) {
  return (
    <div style={{ width: compact ? 40 : 52, height: compact ? 50 : 64, border: '1px solid #185fa5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 10 : 12, fontWeight: 800, color: '#185fa5', background: '#ffffff' }}>{label}</div>
  )
}

// Small placeholder shown for Word documents, which have no image preview.
export function DocBadge({ compact = false, muted = '#6b7280' }: { compact?: boolean; muted?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 5 : 8 }}>
      <FileBadgeBox label="DOCX" compact={compact} />
      <span style={{ fontSize: compact ? 10.5 : 12, fontWeight: 700, color: muted }}>Word document</span>
    </div>
  )
}

// Small placeholder shown for EPS (vector) files, which also have no browser preview.
export function EpsBadge({ compact = false, muted = '#6b7280' }: { compact?: boolean; muted?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 5 : 8 }}>
      <FileBadgeBox label="EPS" compact={compact} />
      <span style={{ fontSize: compact ? 10.5 : 12, fontWeight: 700, color: muted }}>Vector file (EPS)</span>
    </div>
  )
}
