'use client'

// Global confirmation modal host. Mount once in AppLayout.
// Listens for 'csdtv-confirm' events from lib/confirm.ts, renders a styled
// modal, and dispatches the user's choice back. Replaces window.confirm().

import { useEffect, useRef, useState } from 'react'
import {
  CONFIRM_EVENT,
  CONFIRM_RESPONSE_EVENT,
  type ConfirmOptions,
  type ConfirmRequestDetail,
  type ConfirmResponseDetail,
} from '@/lib/confirm'

export default function ConfirmHost() {
  const [request, setRequest] = useState<{ id: number; options: ConfirmOptions } | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmRequestDetail>).detail
      if (!detail) return
      setRequest({ id: detail.id, options: detail.options })
    }
    window.addEventListener(CONFIRM_EVENT, onRequest)
    return () => window.removeEventListener(CONFIRM_EVENT, onRequest)
  }, [])

  // Respond to the waiting promise and close.
  function respond(result: boolean) {
    if (!request) return
    window.dispatchEvent(
      new CustomEvent<ConfirmResponseDetail>(CONFIRM_RESPONSE_EVENT, {
        detail: { id: request.id, result },
      })
    )
    setRequest(null)
  }

  // Keyboard: Enter confirms, Escape cancels. Autofocus the confirm button.
  useEffect(() => {
    if (!request) return
    confirmBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        respond(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        respond(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (!request) return null

  const { options } = request
  const danger = options.tone === 'danger'
  const confirmLabel = options.confirmLabel ?? (danger ? 'Delete' : 'Confirm')
  const cancelLabel = options.cancelLabel ?? 'Cancel'

  return (
    <div
      onClick={() => respond(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 7, 18, 0.55)',
        backdropFilter: 'blur(2px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'csdtv-confirm-fade 0.15s ease-out',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={options.title || options.message}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-raised)',
          padding: '22px 22px 18px',
          fontFamily: 'inherit',
          animation: 'csdtv-confirm-pop 0.18s var(--ease-standard)',
        }}
      >
        {options.title && (
          <div
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            {options.title}
          </div>
        )}
        <div
          style={{
            fontSize: '15px',
            lineHeight: 1.5,
            color: options.title ? 'var(--text-secondary)' : 'var(--text-primary)',
            marginBottom: '20px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {options.message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={() => respond(false)}
            style={{
              minHeight: '40px',
              padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-strong)',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => respond(true)}
            style={{
              minHeight: '40px',
              padding: '0 18px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid transparent',
              background: danger ? 'var(--status-danger)' : 'var(--brand-primary)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes csdtv-confirm-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes csdtv-confirm-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
