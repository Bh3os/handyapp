import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx.js'

interface FieldBase {
  label: string
  /** Help text under the control. */
  hint?: string
  /** The error, written out; it sets aria-invalid and is linked to the control with aria-describedby. */
  error?: string
  /** Text after the label for a required field, from the caller's catalog (for example "required"). */
  requiredText?: string
}

export type FieldProps =
  | (FieldBase & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>)
  | (FieldBase & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>)

/** A labelled input or text area with its hint and accessible error (design specification 3, Fields). */
export function Field(props: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const { label, hint, error, requiredText, className, ...control } = props
  const describedBy =
    cx(control['aria-describedby'], hint !== undefined && hintId, error !== undefined && errorId) || undefined
  const shared = {
    id,
    className: cx('hh-field__control', className),
    'aria-invalid': error !== undefined ? true : undefined,
    'aria-describedby': describedBy,
  }
  let input
  if (control.multiline) {
    const { multiline, ...rest } = control
    void multiline
    input = <textarea {...rest} {...shared} />
  } else {
    const { multiline, ...rest } = control
    void multiline
    input = <input {...rest} {...shared} />
  }
  return (
    <div className="hh-field">
      <label className="hh-field__label" htmlFor={id}>
        {label}
        {control.required && requiredText ? <span className="hh-field__required"> ({requiredText})</span> : null}
      </label>
      {input}
      {hint !== undefined ? (
        <p id={hintId} className="hh-field__hint">
          {hint}
        </p>
      ) : null}
      {error !== undefined ? (
        <p id={errorId} className="hh-field__error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
