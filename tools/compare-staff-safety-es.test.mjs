// tools/compare-staff-safety-es.mjs (TSK-0102; HH-LANG-04, HH-LANG-02, T70, OWN-DEC-79, OWN-DEC-172, RULE-LANGUAGES):
// the separate, deterministic comparison of the Spanish safety messages of the staff catalog with their English
// source, and the committed release record. The messages in the first tests are synthetic (RULE-SYNTHETIC-DATA); the
// last tests read the committed catalogs and record.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildReview,
  compareMessage,
  isSafetyKey,
  loadInputs,
  OUTPUT,
  OWNER_SPANISH,
  render,
  TOOL_VERSION,
} from './compare-staff-safety-es.mjs'

const EN = 'Never touch the synthetic wiring. Stop the affected work, wear gloves and call 911 within 15 minutes.'
const ES = 'Nunca toques el cableado sintético. Detén el trabajo afectado, usa guantes y llama al 911 en 15 minutos.'

test('[HH-LANG-04] a faithful Spanish safety message passes every category', () => {
  const { results, problems } = compareMessage(EN, ES)
  assert.deepEqual(problems, [])
  assert.deepEqual(Object.values(results), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass'])
})

test('[HH-LANG-04][T70] a dropped prohibition, PPE item, stop-work word, number or unit fails its category', () => {
  const failed = (es) => compareMessage(EN, es).problems.map((p) => p.category)
  assert.deepEqual(
    failed('Toca el cableado sintético. Detén el trabajo afectado, usa guantes y llama al 911 en 15 minutos.'),
    ['prohibited_actions'],
  )
  assert.deepEqual(
    failed('Nunca toques el cableado sintético. Detén el trabajo afectado y llama al 911 en 15 minutos.'),
    ['ppe'],
  )
  assert.deepEqual(
    failed('Nunca toques el cableado sintético. Sigue con el trabajo, usa guantes y llama en 15 minutos.'),
    ['stop_work', 'measurements_units'],
  )
  assert.deepEqual(
    failed('Nunca toques el cableado sintético. Detén el trabajo afectado, usa guantes y llama al 911 en 15 horas.'),
    ['measurements_units'],
  )
  assert.deepEqual(compareMessage('Danger: keep away.', 'Mantente lejos.').problems[0].category, 'warnings')
})

test('[HH-LANG-04] a dropped instruction or a message left in English fails the step order', () => {
  assert.deepEqual(
    compareMessage(
      EN,
      'Nunca toques el cableado sintético, detén el trabajo afectado, usa guantes y llama al 911 en 15 minutos.',
    ).problems.map((p) => p.category),
    ['step_order'],
  )
  assert.deepEqual(
    compareMessage('Keep the area clear.', 'Keep the area clear.').problems.map((p) => p.detail),
    ['left in English'],
  )
})

test("[HH-LANG-04] the owner's Spanish is recorded as owner wording only when it is word for word", () => {
  const en = { 'escalation.procedure': 'Synthetic English procedure. Call 911.', 'escalation.owner.note': 'Call.' }
  const es = { 'escalation.procedure': OWNER_SPANISH.join(' '), 'escalation.owner.note': 'Llama primero.' }
  const { keys } = buildReview({ en, es, today: '2026-10-26' })
  assert.equal(keys['escalation.procedure'].status, 'owner_wording')
  assert.equal(keys['escalation.procedure'].source, 'OWN-DEC-172 item 6')
  assert.equal(keys['escalation.owner.note'].status, 'pending')
})

test('[HH-LANG-04] a changed message is checked again with a new date; an unchanged one keeps its date', () => {
  const en = { 'stop.synthetic': EN, 'stop.other': 'Stop work now.' }
  const es = { 'stop.synthetic': ES, 'stop.other': 'Detén el trabajo ahora.' }
  const first = buildReview({ en, es, today: '2026-10-20' })
  const again = buildReview({
    en: { ...en, 'stop.other': 'Stop all work now.' },
    es,
    previous: first.keys,
    today: '2026-10-26',
  })
  assert.equal(again.keys['stop.synthetic'].checkedOn, '2026-10-20')
  assert.equal(again.keys['stop.other'].checkedOn, '2026-10-26')
  assert.notEqual(again.keys['stop.other'].en, first.keys['stop.other'].en)
  assert.equal(again.keys['stop.synthetic'].tool, TOOL_VERSION)
})

test('[HH-LANG-04] safety keys: the safety families, the listed messages and every message that says to call 911', () => {
  assert.equal(isSafetyKey('stop.title'), true)
  assert.equal(isSafetyKey('enum.hazardGuidance.never_gas_repair'), true)
  assert.equal(isSafetyKey('cases.report.safety'), true)
  assert.equal(isSafetyKey('nav.queue', 'Action queue'), false)
  assert.equal(isSafetyKey('offline.synthetic', 'In an emergency call 911.'), true)
})

test('[HH-LANG-04][T70] the committed record is current: no safety message is unreviewed', () => {
  const inputs = loadInputs()
  const committed = readFileSync(OUTPUT, 'utf8')
  const out = buildReview({ ...inputs, today: 'not-a-date' })
  // Every check date comes from the committed record: nothing changed since the comparison ran.
  assert.equal(
    render(out),
    committed,
    'staff-es-safety.json is out of date: run node tools/compare-staff-safety-es.mjs',
  )
  const statuses = Object.values(out.keys).map((k) => k.status)
  assert.ok(statuses.length > 100)
  for (const s of statuses) assert.ok(['ai_reviewed', 'owner_wording', 'pending'].includes(s))
})

test("[HH-LANG-04] the owner's Spanish instruction is carried word for word by the procedure and the two notes", () => {
  const { es } = loadInputs()
  assert.equal(es['escalation.procedure'], OWNER_SPANISH.join(' '))
  assert.equal(es['escalation.owner.note'], OWNER_SPANISH[0])
  assert.equal(es['start.emergency.note'], `${OWNER_SPANISH[1]} ${OWNER_SPANISH[2]}`)
})
