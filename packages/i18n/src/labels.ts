// Label families: canonical codes that records store, and the catalog keys that label them at render time
// (HH-LANG-03). A record keeps the code; only the label changes with the staff locale. Every family is declared here
// so the catalog checker knows its keys are used and can report a code that has no label.

export const LABEL_FAMILIES = {
  /** Job operational states (ENT-Job). The state machine itself is built with the domain package. */
  jobState: [
    'pending_preparation',
    'ready',
    'in_progress',
    'paused',
    'ready_for_qa',
    'operationally_complete',
    'closed',
    'reopened',
  ],
} as const satisfies Record<string, readonly string[]>

export type LabelFamily = keyof typeof LABEL_FAMILIES
export type LabelCode<F extends LabelFamily> = (typeof LABEL_FAMILIES)[F][number]

/** The catalog key that labels `code` in `family`. */
export function labelKey(family: LabelFamily, code: string): string {
  return `enum.${family}.${code}`
}

/** Every catalog key that the declared label families need. */
export function labelFamilyKeys(): string[] {
  return Object.entries(LABEL_FAMILIES).flatMap(([family, codes]) =>
    codes.map((code) => labelKey(family as LabelFamily, code)),
  )
}
