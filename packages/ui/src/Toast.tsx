export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: string
  tone: ToastTone
  message: string
}

export interface ToastRegionProps {
  toasts: readonly ToastItem[]
  onDismiss: (id: string) => void
  /** Label of each dismiss button, from the caller's catalog. */
  dismissLabel: string
  /** `fixed` (default) pins the region to the bottom corner; `inline` keeps it in the flow (gallery, tests). */
  placement?: 'fixed' | 'inline'
}

/**
 * Toasts. Information and confirmations are announced politely (role="status"); errors as an alert. A toast stays
 * until it is dismissed: nothing disappears on a timer (WCAG 2.2.1).
 */
export function ToastRegion({ toasts, onDismiss, dismissLabel, placement = 'fixed' }: ToastRegionProps) {
  return (
    <ul className={placement === 'inline' ? 'hh-toast-region hh-toast-region--inline' : 'hh-toast-region'}>
      {toasts.map((toast) => (
        <li key={toast.id} className={`hh-toast hh-toast--${toast.tone}`}>
          <p className="hh-toast__message" role={toast.tone === 'error' ? 'alert' : 'status'}>
            {toast.message}
          </p>
          <button type="button" className="hh-toast__dismiss" onClick={() => onDismiss(toast.id)}>
            {dismissLabel}
          </button>
        </li>
      ))}
    </ul>
  )
}
