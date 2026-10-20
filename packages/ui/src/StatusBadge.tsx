import type { ReactNode } from 'react'

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

/** A status word. The word is always written out; the tone (colour and marker shape) only repeats it. */
export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span className={tone === 'neutral' ? 'hh-badge' : `hh-badge hh-badge--${tone}`} data-tone={tone}>
      {children}
    </span>
  )
}
