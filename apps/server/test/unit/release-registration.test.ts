// The one `notify.release` registration of the server's automations (TSK-0050, TSK-0051, TSK-0060; HH-COM-05,
// HH-EST-14, HH-LEAD-06, HH-COM-09, T65). Staff replies, question reminders and estimate reminders are all released
// drafts sent by the same automation; each feature's send-time record check is listed in that one registration.
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { buildAutomations, RELEASE_RECORD_CHECKS, releaseFailureItem } from '../../src/automations.js'
import { estimateReminderRecordCheck } from '../../src/modules/estimates/index.js'
import { replyRecordCheck } from '../../src/modules/inbox/index.js'
import { questionRecordCheck } from '../../src/modules/questions/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'

describe('the notify.release registration (TSK-0050, TSK-0051, TSK-0060)', () => {
  it('[HH-COM-05][HH-EST-14][HH-LEAD-06][T65] one registration; its record checks cover every released draft', () => {
    const sink = new Writable({ write: (_c, _e, done) => done() })
    const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), {
      logger: createLogger({ level: 'fatal' }, sink),
    })
    const automations = buildAutomations({ providers, staffAppUrl: 'http://staff.example.test' })
    expect(automations.filter((a) => a.name === 'notify.release')).toHaveLength(1)
    // The worker's registry refuses an automation declared twice; the whole list registers.
    expect(createAutomationRegistry(automations).get('notify.release')).toBeDefined()
    // Estimate reminders (their version), staff replies (their project and contact), question reminders (their
    // question): each record type has exactly its own feature's check.
    expect(Object.keys(RELEASE_RECORD_CHECKS).sort()).toEqual(['estimate_version', 'project', 'question'])
    expect(RELEASE_RECORD_CHECKS['estimate_version']).toBe(estimateReminderRecordCheck)
    expect(RELEASE_RECORD_CHECKS['project']).toBe(replyRecordCheck)
    expect(RELEASE_RECORD_CHECKS['question']).toBe(questionRecordCheck)
    expect(typeof releaseFailureItem).toBe('function')
  })
})
