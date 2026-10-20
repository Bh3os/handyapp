import { useId, type ButtonHTMLAttributes, type MouseEvent } from 'react'
import { cx } from './cx.js'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  /** Primary is the one main action of a view (design specification 3, Buttons). */
  variant?: ButtonVariant
  /** Pending: the label stays, a spinner follows it and a second press does nothing. */
  pending?: boolean
  /**
   * A button is inactive only with the reason written beside it; there is no bare `disabled`. The reason is linked
   * with aria-describedby so a screen reader hears it too.
   */
  disabledReason?: string
}

export function Button({
  variant = 'primary',
  pending = false,
  disabledReason,
  className,
  onClick,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const reasonId = useId()
  const disabled = disabledReason !== undefined
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }
  const button = (
    <button
      {...rest}
      type={type}
      className={cx('hh-button', variant !== 'primary' && `hh-button--${variant}`, className)}
      disabled={disabled}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      aria-describedby={cx(rest['aria-describedby'], disabled && reasonId) || undefined}
      onClick={handleClick}
    >
      {children}
    </button>
  )
  if (!disabled) return button
  return (
    <span className="hh-button-row">
      {button}
      <span id={reasonId} className="hh-button-reason">
        {disabledReason}
      </span>
    </span>
  )
}
