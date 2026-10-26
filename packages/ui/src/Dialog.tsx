import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  title: string
  /** Called on Escape and on the dialog's own close actions; the caller sets `open` to false. */
  onClose: () => void
  children?: ReactNode
  /** The action buttons; the caller writes their labels from its catalog. */
  actions?: ReactNode
}

/**
 * A modal dialog on the native <dialog> element: the browser traps focus, makes the page behind it inert and closes on
 * Escape. Focus goes back to the element that opened it when it closes, also when the caller removes the dialog
 * instead of setting `open` to false (TSK-0104, HH-A11Y-02: the browser restores focus only on close()).
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      restoreFocus(opener)
    }
  }, [open])

  // Removed while open: the browser has no dialog to close, so focus is put back here.
  useEffect(() => () => restoreFocus(opener), [])

  return (
    <dialog
      ref={ref}
      className="hh-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id={titleId} className="hh-dialog__title hh-h3">
        {title}
      </h2>
      <div className="hh-dialog__body">{children}</div>
      {actions ? <div className="hh-dialog__actions">{actions}</div> : null}
    </dialog>
  )
}

function restoreFocus(opener: { current: HTMLElement | null }): void {
  const el = opener.current
  opener.current = null
  if (el?.isConnected) el.focus()
}
