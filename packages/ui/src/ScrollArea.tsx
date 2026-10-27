import type { ReactNode } from 'react'
import { cx } from './cx.js'

export interface ScrollAreaProps {
  /** The region's name, from the caller's catalog (usually the table's caption or the section's heading). */
  label: string
  className?: string
  children?: ReactNode
}

/**
 * A box that scrolls sideways, for a wide table on a 320 px screen (two-dimensional content, WCAG 1.4.10). It is a
 * named region in the tab order, so a keyboard user can reach it and scroll it with the arrow keys (WCAG 2.1.1; axe
 * scrollable-region-focusable) (TSK-0104).
 */
export function ScrollArea({ label, className, children }: ScrollAreaProps) {
  return (
    <div className={cx('hh-scroll', className)} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
