#!/usr/bin/env node
// The separate comparison of the Spanish staff-catalog safety messages against their English source, and their release
// record (TSK-0102; HH-LANG-02, HH-LANG-04, T70, OWN-DEC-79, OWN-DEC-162, OWN-DEC-172, OWN-DEC-74, RULE-LANGUAGES,
// RULE-SAFETY-GATES, RULE-NO-INVENTED-FACTS). Generated output, never hand-edited:
// packages/i18n/src/staff-es-safety.json.
//
// tools/compare-safety-es.mjs (TSK-0103) compares the Spanish SOP texts; this tool applies the same separate check to
// the safety messages of the staff screens: the Stop Work / Report Hazard and issue forms, the hazard kinds and their
// guidance, the escalation procedure (Call Owner, Call 911, Owner unreachable), the emergency note of the Start Work
// briefing and every other staff message that tells the reader to call 911.
//
// - Input: packages/i18n/src/catalogs/staff.en.json (the approved English) and staff.es.json (the Spanish, translated
//   by AI during development, OWN-DEC-79; the product has no runtime AI, OWN-DEC-74). This tool is NOT the pass that
//   produced the translation: it is a deterministic check of the stored Spanish against the English, per category,
//   with the term lists and units of compare-safety-es.mjs:
//     warnings            every warning word has at least as many Spanish counterparts;
//     ppe                 every PPE term has a counterpart;
//     prohibited_actions  every prohibition (never, do not...) has a counterpart (nunca, no...);
//     measurements_units  every number kept exactly, with the same unit (911 and phone numbers included);
//     step_order          the same number of instructions (sentences), in the same order of numbers, and no message
//                         left in English;
//     stop_work           every stop-work word (stop, pause, escalate, evacuate, 911) has a counterpart.
// - The owner's own Spanish (OWN-DEC-172 item 6) is not a translation: the messages that carry it are checked to hold
//   the owner's sentences word for word, in order, and are recorded as "owner_wording", never compared or altered.
// - Release: a message whose six categories pass is released with the status "ai_reviewed" (shown as "AI-reviewed"),
//   recording the hash of the English it was compared with, the hash of the Spanish and the check date. Anything else
//   is "pending": the Spanish staff translator shows the approved English message instead (packages/i18n), and the
//   repository test lists it. Nothing here is ever labelled human-reviewed or safety-certified.
// - A changed English or Spanish message makes its record stale: `--check` (run by the tests) fails until this tool
//   runs again, so an unreviewed safety message can never be merged.
// - The check date is kept while the inputs of a message are unchanged, so the file changes only with the catalogs.
//
// Usage: node tools/compare-staff-safety-es.mjs [--check] [--dry-run] [--verbose]
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES, measurements, TERMS } from './compare-safety-es.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOGS = join(ROOT, 'packages', 'i18n', 'src', 'catalogs')
const OUT = join(ROOT, 'packages', 'i18n', 'src', 'staff-es-safety.json')

/** Changes whenever the comparison rules or the safety key set change, so every message is compared again. */
export const TOOL_VERSION = 'compare-staff-safety-es@1'

/** Key families whose every message is safety content for a worker. */
export const SAFETY_PREFIXES = [
  'stop.',
  'escalation.',
  'start.emergency.',
  'enum.escalationAction.',
  'enum.hazardKind.',
  'enum.hazardGuidance.',
  'enum.hazardCategory.',
  'enum.hazardReviewer.',
]
/** Single safety messages outside those families: hazard and stop-work instructions on other screens. */
export const SAFETY_KEYS = [
  'packet.hazardChecksInSop',
  'packet.escalationNotConfigured',
  'start.siteCheck.hint',
  'enum.startGateItem.safety_holds',
  'enum.startGateItem.critical_resources',
  'cases.report.safety',
  'offline.notSynced',
  'sop.pendingReview.body',
  'sop.humanReview.title',
  'sop.humanReview.body',
  'questions.hazardWarning',
  'quality.safetyHoldNeeded',
]
/** A message that tells the reader to call 911 is safety content wherever it is. */
const EMERGENCY = /\b911\b/

export function isSafetyKey(key, english = '') {
  return SAFETY_PREFIXES.some((p) => key.startsWith(p)) || SAFETY_KEYS.includes(key) || EMERGENCY.test(english)
}

/** The owner's Spanish instruction, word for word (OWN-DEC-172 item 6). */
export const OWNER_SPANISH = [
  'Si ocurre un problema, detén el trabajo afectado y llama primero al propietario para recibir instrucciones.',
  'Si hay una emergencia médica grave, un incendio, una fuga peligrosa de gas o cualquier peligro inmediato para la vida, llama al 911 sin esperar autorización.',
  'Avisa al propietario cuando sea seguro hacerlo.',
]
/** The messages that carry the owner's own Spanish (OQ-ESCALATION-DETAILS): the procedure and the two notes. */
export const OWNER_WORDING = {
  'escalation.procedure': [0, 1, 2],
  'escalation.owner.note': [0],
  'start.emergency.note': [1, 2],
}

const count = (re, text) => (text.match(re) ?? []).length
const sorted = (xs) => [...xs].sort()
const sameBag = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/** A message's own words: ICU arguments ({name}, {n, number}) taken out; select and plural texts kept. */
export function ownWords(message) {
  return message.replace(/\{\s*\w+\s*(?:,\s*(?:number|date|time)[^{}]*)?\}/g, ' ')
}
/** Instructions: sentences ended by a full stop, colon, semicolon, question or exclamation mark ("EE. UU." is one word). */
export function instructions(text) {
  return text
    .replace(/\bEE\. ?UU\./g, 'EEUU')
    .split(/(?<=[.:;?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s))
}
/** Whether a message still reads as English: unchanged and holding at least three lowercase words. */
const untranslated = (en, es) => en === es && count(/\b[a-z]{3,}\b/g, ownWords(en)) >= 3

/** Compares one Spanish message with its English source. Returns the result per category and the problems. */
export function compareMessage(english, spanish) {
  const problems = []
  const fail = (category, detail) => problems.push({ category, detail })
  const en = ownWords(english)
  const es = ownWords(spanish)
  // Spanish terms are counted without accents too, so "Evacúa" counts like "evacuar".
  const folded = es.normalize('NFD').replace(/\p{M}/gu, '')
  for (const category of ['warnings', 'ppe', 'prohibited_actions', 'stop_work']) {
    const n = count(TERMS[category].en, en)
    const m = Math.max(count(TERMS[category].es, es), count(TERMS[category].es, folded))
    if (m < n) fail(category, `${n} English terms, ${m} Spanish counterparts`)
  }
  const mEn = measurements('en', en)
  const mEs = measurements('es', es)
  if (!sameBag(mEn, mEs)) fail('measurements_units', `English [${mEn.join(', ')}], Spanish [${mEs.join(', ')}]`)
  else if (mEn.map((m) => m.split('|')[0]).join() !== mEs.map((m) => m.split('|')[0]).join())
    fail('step_order', 'the numbers come in another order')
  const iEn = instructions(en).length
  const iEs = instructions(es).length
  if (iEn !== iEs) fail('step_order', `${iEn} English instructions, ${iEs} Spanish instructions`)
  if (untranslated(english, spanish)) fail('step_order', 'left in English')
  const results = Object.fromEntries(
    CATEGORIES.map((c) => [c, problems.some((p) => p.category === c) ? 'fail' : 'pass']),
  )
  return { results, problems }
}

/** Whether a message holds exactly the owner's sentences it is meant to carry, in order. */
export function isOwnerWording(key, spanish) {
  const sentences = OWNER_WORDING[key]
  return Boolean(sentences) && spanish === sentences.map((i) => OWNER_SPANISH[i]).join(' ')
}

/**
 * The release record of every safety message, in catalog order. `previous` keeps the check date of each message whose
 * English, Spanish and tool are unchanged.
 */
export function buildReview({ en, es, previous = {}, today }) {
  const keys = {}
  for (const [key, english] of Object.entries(en)) {
    if (!isSafetyKey(key, english)) continue
    const spanish = es[key]
    if (typeof spanish !== 'string') throw new Error(`${key}: missing from staff.es`)
    const hashes = { en: sha(english), es: sha(spanish) }
    const before = previous[key]
    const checkedOn =
      before && before.en === hashes.en && before.es === hashes.es && before.tool === TOOL_VERSION
        ? before.checkedOn
        : today
    if (Object.hasOwn(OWNER_WORDING, key)) {
      const ok = isOwnerWording(key, spanish)
      keys[key] = {
        status: ok ? 'owner_wording' : 'pending',
        ...hashes,
        tool: TOOL_VERSION,
        checkedOn,
        source: 'OWN-DEC-172 item 6',
        problems: ok ? [] : [{ category: 'step_order', detail: "not the owner's Spanish word for word" }],
      }
      continue
    }
    const { results, problems } = compareMessage(english, spanish)
    keys[key] = {
      status: CATEGORIES.every((c) => results[c] === 'pass') ? 'ai_reviewed' : 'pending',
      ...hashes,
      tool: TOOL_VERSION,
      checkedOn,
      results,
      problems,
    }
  }
  return { keys }
}

/** Pretty JSON with each record on one line, so a changed message is a one-line diff. */
export function render(out) {
  const lines = Object.entries(out.keys).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
  return `{\n  "$comment": ${JSON.stringify(
    'Generated by tools/compare-staff-safety-es.mjs (TSK-0102): each Spanish safety message of the staff catalog ' +
      'compared with its English source. Do not edit: change staff.es.json, then rerun the tool.',
  )},\n  "keys": {\n${lines.join(',\n')}\n  }\n}\n`
}

export function loadInputs() {
  const en = JSON.parse(readFileSync(join(CATALOGS, 'staff.en.json'), 'utf8'))
  const es = JSON.parse(readFileSync(join(CATALOGS, 'staff.es.json'), 'utf8'))
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).keys : {}
  return { en, es, previous }
}

export const OUTPUT = OUT

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildReview({ ...loadInputs(), today: new Date().toISOString().slice(0, 10) })
  const text = render(out)
  const all = Object.entries(out.keys)
  const pending = all.filter(([, v]) => v.status === 'pending')
  console.log(
    `${all.length} safety messages: ${all.filter(([, v]) => v.status === 'ai_reviewed').length} AI-reviewed, ` +
      `${all.filter(([, v]) => v.status === 'owner_wording').length} owner wording, ${pending.length} pending`,
  )
  for (const [key, v] of pending) {
    console.log(`  pending ${key}`)
    if (process.argv.includes('--verbose')) for (const p of v.problems) console.log(`    ${p.category}: ${p.detail}`)
  }
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== text) {
      console.error('packages/i18n/src/staff-es-safety.json is out of date: run node tools/compare-staff-safety-es.mjs')
      process.exit(1)
    }
    console.log('staff-es-safety.json is up to date')
  } else if (!process.argv.includes('--dry-run')) {
    writeFileSync(OUT, text)
    console.log(`wrote ${OUT}`)
  }
}
