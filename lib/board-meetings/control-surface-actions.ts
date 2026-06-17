/**
 * Client-side control surface action routing (browser fetch only).
 * Import from 'use client' components — not from server modules.
 */

export async function dispatchControlSurfaceAction(
  productionId: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  switch (action) {
    case 'hold-result':
      return fetch(`/api/board-meetings/${productionId}/motion/result/hold`, { method: 'POST' })

    case 'dismiss-result':
      return fetch(`/api/board-meetings/${productionId}/motion/result/dismiss`, { method: 'POST' })

    case 'reshow-result':
      return fetch(`/api/board-meetings/${productionId}/motion/result/reshow`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })

    default:
      if (action.startsWith('motion/')) {
        const path = action.slice('motion/'.length)
        return fetch(`/api/board-meetings/${productionId}/motion/${path}`, {
          method: 'POST',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
      }
      return fetch(`/api/board-meetings/${productionId}/control/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
  }
}
