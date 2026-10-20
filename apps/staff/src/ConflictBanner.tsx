// The shared conflict banner (TSK-0040; HH-OPS-03, HH-API-04). A write based on an outdated version answers
// STALE_VERSION with the current version and values; nothing was saved. The banner shows the current values next to
// the person's own, and offers to take the current values or to review and redo the change on the current version.
// It never retries on its own and never overwrites newer state.
import type { StaffKey } from '@handyhub/i18n'
import { Button, StateView } from '@handyhub/ui'
import type { ApiErrorBody } from './api'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type Conflict = { version: number; values: Record<string, unknown> }

/** The conflict a failed write reports, or null when the failure is anything else. */
export function conflictOf(error: ApiErrorBody | null | undefined): Conflict | null {
  if (error?.code !== 'STALE_VERSION' || !error.current) return null
  return { version: error.current.version, values: error.current.values ?? {} }
}

export type ConflictField = { name: string; label: string; yours: unknown }

export interface ConflictBannerProps {
  t: T
  conflict: Conflict
  /** The edited fields, labelled from the caller's catalog, with the person's own values. */
  fields: readonly ConflictField[]
  /** Replace the edits with the current values. */
  onUseCurrent: (conflict: Conflict) => void
  /** Keep the edits and continue editing on the current version; the person submits again themselves. */
  onRedo: (conflict: Conflict) => void
}

function shown(t: T, value: unknown): string {
  if (value === null || value === undefined || value === '') return t('conflict.empty')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ConflictBanner({ t, conflict, fields, onUseCurrent, onRedo }: ConflictBannerProps) {
  return (
    <div className="staff-conflict" data-testid="conflict-banner">
      <StateView
        kind="stale"
        title={t('conflict.title')}
        action={
          <div className="hh-button-row">
            <Button variant="secondary" onClick={() => onUseCurrent(conflict)}>
              {t('conflict.useCurrent')}
            </Button>
            <Button onClick={() => onRedo(conflict)}>{t('conflict.redo')}</Button>
          </div>
        }
      >
        <p>{t('conflict.body')}</p>
        <table className="staff-conflict__table">
          <thead>
            <tr>
              <th scope="col">{t('conflict.field')}</th>
              <th scope="col">{t('conflict.current')}</th>
              <th scope="col">{t('conflict.yours')}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const current = conflict.values[f.name]
              const differs = shown(t, current) !== shown(t, f.yours)
              return (
                <tr key={f.name} data-differs={differs || undefined}>
                  <th scope="row">{f.label}</th>
                  <td>{shown(t, current)}</td>
                  <td>{shown(t, f.yours)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </StateView>
    </div>
  )
}
