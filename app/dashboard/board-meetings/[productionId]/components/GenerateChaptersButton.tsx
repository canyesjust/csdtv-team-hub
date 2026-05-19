'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'

export default function GenerateChaptersButton({ productionId }: { productionId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/generate-chapters`)
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Generation failed', 'error')
        return
      }
      setText(body.chapters_text || '')
      setWarnings(body.warnings || [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
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
        onClick={generate}
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
            {warnings.map((w, i) => (
              <p key={i} style={{ margin: '0 0 8px', fontSize: '13px', color: '#e8a020' }}>{w}</p>
            ))}
            {text ? (
              <>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', background: 'var(--surface-2)', padding: '12px', borderRadius: '8px', fontFamily: 'ui-monospace, monospace' }}>
                  {text}
                </pre>
                <button
                  type="button"
                  onClick={copy}
                  style={{ marginTop: '12px', padding: '10px 20px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
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
