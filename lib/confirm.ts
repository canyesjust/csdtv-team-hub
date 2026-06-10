// Promise-based confirmation dialog.
//
// Drop-in replacement for window.confirm() that shows a styled in-app modal
// instead of the native browser dialog. Mirrors the existing toast pattern:
// confirmDialog() dispatches a 'csdtv-confirm' event, <ConfirmHost /> (mounted
// in AppLayout) renders the modal and dispatches 'csdtv-confirm-response' back.
//
// Usage:
//   if (!(await confirmDialog('Delete this contact?'))) return
//   if (await confirmDialog({ message: 'Remove member?', tone: 'danger', confirmLabel: 'Remove' })) { ... }
//
// The calling function must be async. Most of our handlers already are.

export type ConfirmTone = 'default' | 'danger'

export type ConfirmOptions = {
  /** Main body text. Required. */
  message: string
  /** Optional bold heading above the message. */
  title?: string
  /** Confirm button label. Defaults to 'Confirm' (or 'Delete' for danger tone). */
  confirmLabel?: string
  /** Cancel button label. Defaults to 'Cancel'. */
  cancelLabel?: string
  /** 'danger' renders a red confirm button for destructive actions. */
  tone?: ConfirmTone
}

export const CONFIRM_EVENT = 'csdtv-confirm'
export const CONFIRM_RESPONSE_EVENT = 'csdtv-confirm-response'

export type ConfirmRequestDetail = { id: number; options: ConfirmOptions }
export type ConfirmResponseDetail = { id: number; result: boolean }

let counter = 0

/**
 * Show a confirmation modal. Resolves true if the user confirms, false otherwise.
 * Accepts a plain message string or a full options object.
 */
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  // SSR / no-window guard: behave like a declined confirm.
  if (typeof window === 'undefined') return Promise.resolve(false)

  const options: ConfirmOptions = typeof input === 'string' ? { message: input } : input
  const id = ++counter

  return new Promise<boolean>((resolve) => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmResponseDetail>).detail
      if (!detail || detail.id !== id) return
      window.removeEventListener(CONFIRM_RESPONSE_EVENT, handle)
      resolve(detail.result)
    }
    window.addEventListener(CONFIRM_RESPONSE_EVENT, handle)
    window.dispatchEvent(
      new CustomEvent<ConfirmRequestDetail>(CONFIRM_EVENT, { detail: { id, options } })
    )
  })
}
