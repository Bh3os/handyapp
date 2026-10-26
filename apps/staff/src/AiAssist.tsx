// AI suggestions on the staff screens, in their only state: off (TSK-0117; HH-AUTO-03, HH-AUTO-04, RULE-AI-WAVE2,
// OWN-DEC-74, OWN-DEC-211). Each screen where a registered AI use would help (apps/server/src/platform/ai/registry.ts)
// says that AI suggestions are off and names the manual path, which is the screen itself. Nothing here calls the
// server: ai.module can only be off (its parser and a database CHECK refuse anything else), and turning AI on is a
// change made with plan 33. The job packet has no note: its use has no review action, so it stays refused.
import type { StaffKey } from '@handyhub/i18n'
import { StatusBadge } from '@handyhub/ui'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

/** The registered uses with a staff screen, and the manual path each screen offers. */
export const AI_MANUAL_PATH = {
  'request.classify': 'ai.manual.requestClassify',
  'reply.draft': 'ai.manual.replyDraft',
  'staff_note.translate': 'ai.manual.staffNoteTranslate',
  'estimate.draft': 'ai.manual.estimateDraft',
  'schedule.suggest': 'ai.manual.scheduleSuggest',
  'evidence.point_out': 'ai.manual.evidencePointOut',
  'performance.summarize': 'ai.manual.performanceSummarize',
} as const satisfies Record<string, StaffKey>

export type AiUseId = keyof typeof AI_MANUAL_PATH

/** "AI suggestions off", then what the person does instead, on the screen they are on. */
export function AiAssistOff({ t, use }: { t: T; use: AiUseId }) {
  return (
    <p className="staff-request__hint" data-testid="ai-off" data-ai-use={use}>
      <StatusBadge>{t('ai.off')}</StatusBadge> {t(AI_MANUAL_PATH[use])}
    </p>
  )
}
