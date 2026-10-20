import type { ReactNode } from 'react'

/** The functional states every screen needs (HH-BASE-01). */
export const STATE_KINDS = ['empty', 'loading', 'error', 'stale', 'offline', 'blocked', 'success'] as const
export type StateKind = (typeof STATE_KINDS)[number]

export interface StateViewProps {
  kind: StateKind
  /** What the state is, written out (from the caller's catalog). */
  title: string
  /** What it means and what to do next. */
  children?: ReactNode
  /** Blocked: the exact missing items, each written out (for example the Start Work gate's list). */
  reasons?: readonly string[]
  /** One action, such as Retry or Refresh. */
  action?: ReactNode
}

/**
 * A state view. Errors are announced as an alert; every other state politely. Loading also sets aria-busy. The kind
 * is never carried by colour alone: the title says it, and the marker shape and border repeat it.
 */
export function StateView({ kind, title, children, reasons, action }: StateViewProps) {
  return (
    <div
      className={`hh-state hh-state--${kind}`}
      data-state={kind}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-busy={kind === 'loading' || undefined}
    >
      <span className="hh-state__marker" aria-hidden="true" />
      <p className="hh-state__title">{title}</p>
      {children !== undefined ? <div className="hh-state__body">{children}</div> : null}
      {reasons && reasons.length > 0 ? (
        <ul className="hh-state__reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {action ? <div className="hh-state__action">{action}</div> : null}
    </div>
  )
}
