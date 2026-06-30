'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'

const nudgeBtn: React.CSSProperties = {
  fontSize: '13px', padding: '6px 10px', borderRadius: '7px',
  border: '0.5px solid var(--border-subtle)', background: 'var(--surface-2)',
  color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
}

function parseTimecode(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  if (/^\d+$/.test(t)) return Number(t) // plain seconds
  const parts = t.split(':').map(p => p.trim())
  if (parts.some(p => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return null
}

export default function GenerateChaptersButton({ productionId }: { productionId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [nudge, setNudge] = useState(0)
  const [streamAnchored, setStreamAnchored] = useState(true)
  const [welcome, setWelcome] = useState('')

  const generate = async (nudgeSeconds = nudge, welcomeStr = welcome) => {
    setLoading(true)
    try {
      const welcomeSec = parseTimecode(welcomeStr)
      const welcomeParam = welcomeSec != null ? `&welcome=${welcomeSec}` : ''
      const res = await fetch(`/api/board-meetings/${productionId}/generate-chapters?nudge=${nudgeSeconds}${welcomeParam}`)
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Generation failed', 'error')
        return
      }
      setText(body.chapters_text || '')
      setWarnings(body.warnings || [])
      setStreamAnchored(body.stream_anchored ?? true)
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  const applyNudge = (delta: number) => {
    const next = nudge + delta
    setNudge(next)
    void generate(next)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied to clipboard', 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => generate()}
        disabled={loading}
        style={{
          fontSize: '14px',
          padding: '10px 16px',
          minHeight: '44px',
          borderRadius: '10px',
          border: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {loading ? 'Generating…' : 'Generate YouTube chapters'}
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: 'var(--surface-1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px' }}>YouTube chapters</h3>
            <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-2)', border: '0.5px solid var(--border-subtle)' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                When does “Welcome” appear in the video?
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={welcome}
                  onChange={e => setWelcome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void generate(nudge, welcome) }}
                  placeholder="m:ss  (e.g. 2:15)"
                  style={{ width: '120px', padding: '8px 10px', borderRadius: '7px', border: '0.5px solid var(--border-subtle)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'ui-monospace, monospace' }}
                />
                <button type="button" onClick={() => void generate(nudge, welcome)} disabled={loading} style={{ ...nudgeBtn, fontWeight: 600 }}>Apply</button>
                {welcome && <button type="button" onClick={() => { setWelcome(''); void generate(nudge, '') }} disabled={loading} style={nudgeBtn}>Clear</button>}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Watch the recording, find the moment the board welcomes everyone, and enter that timestamp. Every chapter lines up from there — no need to match the go-live exactly.
              </p>
            </div>
            {warnings.map((w, i) => (
              <p key={i} style={{ margin: '0 0 8px', fontSize: '13px', color: '#e8a020' }}>{w}</p>
            ))}
            {text ? (
              <>
                {!streamAnchored && !welcome && (
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Not anchored to a recorded stream start — enter the “Welcome” time above to line everything up, or nudge below.
                  </p>
                )}
                {!welcome && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nudge all chapters:</span>
                    <button type="button" onClick={() => applyNudge(-30)} disabled={loading} style={nudgeBtn}>−30s</button>
                    <button type="button" onClick={() => applyNudge(-5)} disabled={loading} style={nudgeBtn}>−5s</button>
                    <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '52px', textAlign: 'center' }}>{nudge >= 0 ? `+${nudge}` : nudge}s</span>
                    <button type="button" onClick={() => applyNudge(5)} disabled={loading} style={nudgeBtn}>+5s</button>
                    <button type="button" onClick={() => applyNudge(30)} disabled={loading} style={nudgeBtn}>+30s</button>
                  </div>
                )}
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={Math.min(14, Math.max(4, text.split('\n').length))}
                  style={{ width: '100%', boxSizing: 'border-box', whiteSpace: 'pre', fontSize: '13px', background: 'var(--surface-2)', padding: '12px', borderRadius: '8px', fontFamily: 'ui-monospace, monospace', color: 'var(--text-primary)', border: '0.5px solid var(--border-subtle)', resize: 'vertical' }}
                />
                <button
                  type="button"
                  onClick={copy}
                  style={{ marginTop: '12px', padding: '10px 20px', background: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Copy to clipboard
                </button>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No chapter text generated. See warnings above.</p>
            )}
            <button type="button" onClick={() => setOpen(false)} style={{ marginTop: '12px', marginLeft: '8px', padding: '10px 16px', border: '0.5px solid var(--border-subtle)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
