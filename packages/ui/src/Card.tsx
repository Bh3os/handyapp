import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx.js'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  /** Heading level of the title; the page decides its outline. */
  headingLevel?: 2 | 3 | 4
  /** The plate: the identity's signature panel with a gold hairline on its top edge. Never nested. */
  plate?: boolean
  children?: ReactNode
}

export function Card({ title, headingLevel = 2, plate = false, className, children, ...rest }: CardProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <section {...rest} className={cx('hh-card', plate && 'hh-card--plate', className)}>
      {title !== undefined ? <Heading className="hh-card__title hh-h3">{title}</Heading> : null}
      {children}
    </section>
  )
}
