// AI suggestions on the staff screens, off (TSK-0117; HH-AUTO-03, RULE-AI-WAVE2, RULE-LANGUAGES): each note says the
// suggestions are off and names the manual path, in English and Spanish, offers nothing to press and calls nothing.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_MANUAL_PATH, AiAssistOff, type AiUseId } from '../src/AiAssist'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AI suggestions off (TSK-0117)', () => {
  it('[RULE-AI-WAVE2][RULE-LANGUAGES] shows the off state and the manual path only, in both languages', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (const locale of ['en', 'es'] as const) {
      const { t } = staffTranslator(locale)
      for (const use of Object.keys(AI_MANUAL_PATH) as AiUseId[]) {
        const { container, unmount } = render(<AiAssistOff t={t} use={use} />)
        const note = screen.getByTestId('ai-off')
        expect(note.getAttribute('data-ai-use')).toBe(use)
        expect(note.textContent).toContain(t('ai.off'))
        expect(note.textContent).toContain(t(AI_MANUAL_PATH[use]))
        expect(container.querySelector('button, a, input, textarea, form')).toBeNull()
        unmount()
      }
    }
    expect(staffTranslator('es').t('ai.off')).not.toBe(staffTranslator('en').t('ai.off'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
