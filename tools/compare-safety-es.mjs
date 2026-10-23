#!/usr/bin/env node
// The separate comparison of each Spanish SOP translation against its English source version, and the Spanish release
// record (TSK-0103; HH-LANG-04, HH-PKT-04, T45, T70, OWN-DEC-79, OWN-DEC-74, RULE-LANGUAGES, RULE-SAFETY-GATES,
// RULE-NO-INVENTED-FACTS). Generated output, never hand-edited: packages/db/seed/sops-es.json.
//
// - Input: packages/db/seed/sops.json (the English versions, from tools/import-sops.mjs) and one translation file per
//   SOP in packages/db/translations/sops-es/<SOP-ID>.json. The translation was made during development by AI
//   (OWN-DEC-79); the product has no runtime AI (OWN-DEC-74). This tool is NOT the pass that produced the translation:
//   it is a deterministic check of the stored Spanish against the English, per category:
//     step_order          every stage heading and every item of the six stages, in the same order, with the same
//                         number of lines and the same list, quote and table structure; the evidence lines and every
//                         reference (control codes such as C-DW01-01, [[node]] links) kept verbatim; no line left in
//                         English.
//     warnings            every HOLD, GATE and FLAG control token kept verbatim and in the same number; every warning
//                         word (warning, caution, danger, hazard, unsafe, toxic, flammable, risk...) has at least as
//                         many Spanish counterparts in the same item.
//     ppe                 every PPE term (gloves, goggles, eye protection, respirator, mask...) has a counterpart.
//     prohibited_actions  every prohibition (never, do not, must not, cannot...) has a counterpart (nunca, no...).
//     measurements_units  every number in the item kept exactly, and every number with a unit kept with the same unit
//                         (inches -> pulgadas, minutes -> minutos...).
//     stop_work           every item of the stop-work section mapped with the same structure, and every stop-work word
//                         (stop, halt, pause, escalate, evacuate, 911) has a counterpart (detener, suspender...).
//   Counterparts are counted per item, so a dropped warning, PPE item, prohibition, number or stop condition fails the
//   comparison even when the rest of the item is there.
// - A translation may flag an ambiguous source instruction (`ambiguous`): it is never resolved by inventing guidance,
//   and it keeps that procedure pending.
// - Release: a version whose six categories pass and that has no ambiguous flag is released with the status
//   "ai_reviewed" (shown as "AI-reviewed"); anything else stays "pending" and Spanish-reading workers stay blocked at
//   the Start Work gate (SPANISH_SAFETY_REVIEW_PENDING). Nothing here is ever labelled human-reviewed or
//   safety-certified.
// - A translation made for an older English version is not compared (the English it was made from is no longer the
//   source): it is listed as stale and the new English version stays pending until it is translated and checked again.
// - The check date (`checkedOn`) is the day the comparison of these exact inputs first ran; rerunning on unchanged
//   inputs keeps it, so the generated file only changes when a translation, the English or this tool changes.
// - The open questions of the source SOP are review notes, not operational text: they stay in English.
//
// Usage: node tools/compare-safety-es.mjs [--check] [--dry-run] [--verbose] [--only=SOP-HI-05,...]
//   --check exits 1 when the committed file is out of date; --dry-run writes nothing; --verbose lists every problem.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOPS = join(ROOT, 'packages', 'db', 'seed', 'sops.json')
const TRANSLATIONS = join(ROOT, 'packages', 'db', 'translations', 'sops-es')
const OUT = join(ROOT, 'packages', 'db', 'seed', 'sops-es.json')

/** Changes whenever the comparison rules change, so every version is compared again. */
export const TOOL_VERSION = 'compare-safety-es@1'
export const CATEGORIES = ['warnings', 'ppe', 'prohibited_actions', 'measurements_units', 'step_order', 'stop_work']

// Term lists: English source terms and their accepted Spanish counterparts, matched case-insensitively. A Spanish item
// must hold at least as many counterparts as the English item holds terms.
const L = '(?<![\\p{L}\\p{N}])'
const R = '(?![\\p{L}\\p{N}])'
const words = (body) => new RegExp(`${L}(?:${body})${R}`, 'giu')
export const TERMS = {
  warnings: {
    en: words(
      'warn(?:ing|ings|s)?|caution\\w*|danger\\w*|hazard\\w*|unsafe|toxic\\w*|flammable|combustible|corrosive|poison\\w*|risk\\w*|fumes?|explosi\\w*',
    ),
    es: words(
      'advert\\p{L}*|precauci\\p{L}*|cuidado|peligr\\p{L}*|insegur\\p{L}*|t[oó]xic\\p{L}*|inflamable\\p{L}*|combustible\\p{L}*|corrosiv\\p{L}*|venen\\p{L}*|riesg\\p{L}*|arriesg\\p{L}*|vapor\\p{L}*|humos?|gases|explosi\\p{L}*|explot\\p{L}*',
    ),
  },
  ppe: {
    en: words(
      'ppe|gloves?|goggles|safety glasses|glasses|eye protection|face ?shields?|respirators?|dust masks?|masks?|n95|p100|hearing protection|ear ?plugs|ear ?muffs|hard ?hats?|helmets?|boots|knee ?pads|harness(?:es)?|coveralls?|aprons?|protective clothing|long sleeves',
    ),
    es: words(
      'epp|guantes?|gafas|lentes|anteojos|protecci[oó]n (?:ocular|de (?:los )?ojos|auditiva|de (?:los )?o[ií]dos|facial|respiratoria)|caretas?|protector(?:es)? (?:facial|facial(?:es)?|auditivos?)|respirador(?:es)?|mascarillas?|cubrebocas|n95|p100|tapones|orejeras|cascos?|botas|rodilleras?|arn[eé]s(?:es)?|overoles?|monos? de trabajo|delantal(?:es)?|ropa (?:de )?protec\\p{L}*|mangas largas',
    ),
  },
  prohibited_actions: {
    en: words(
      "never|do not|don't|does not|must not|mustn't|may not|should not|cannot|can't|not allowed|not permitted|prohibited|forbidden|no one|nobody|nothing",
    ),
    es: words('nunca|jam[aá]s|no|prohib\\p{L}*|nadie|nada|ning[uú]n\\p{L}*'),
  },
  stop_work: {
    en: words('stop(?!pers?\\b)\\w*|halt\\w*|paus\\w*|escalat\\w*|evacuat\\w*|911'),
    es: words(
      'deten\\p{L}*|det[eé]n\\p{L}*|detien\\p{L}*|pare|paren|parar|suspend\\p{L}*|suspensi[oó]n|paus\\p{L}*|interrump\\p{L}*|escal(?:ar|a|as|e|en|an|ado|ada|ados|adas|aci[oó]n|amiento|amientos)|evacu\\p{L}*|911|stop|alto',
    ),
  },
}

/** Units: English forms and Spanish forms, each mapped to one canonical unit. */
const UNITS = [
  ['in', 'inch(?:es)?|in\\.', 'pulgadas?|pulg\\.?'],
  ['ft', 'ft|foot|feet', 'pies?|ft'],
  ['sqft', 'sq\\.? ?ft|square (?:feet|foot)', 'pies? cuadrados?|sq\\.? ?ft'],
  ['min', 'minutes?|mins?', 'minutos?|min'],
  ['h', 'hours?|hrs?', 'horas?|h|hrs?'],
  ['d', 'days?', 'd[ií]as?'],
  ['wk', 'weeks?', 'semanas?'],
  ['mo', 'months?', 'meses|mes'],
  ['yr', 'years?', 'a[nñ]os?'],
  ['pct', '%|percent', '%|por ciento'],
  ['lb', 'lbs?|pounds?', 'lbs?|libras?'],
  ['psi', 'psi', 'psi'],
  ['gal', 'gal(?:lons?)?', 'gal(?:[oó]n|ones)?'],
  ['tbsp', 'tablespoons?|tbsp', 'cucharadas?|cdas?\\.?'],
  ['tsp', 'teaspoons?|tsp', 'cucharaditas?|cdtas?\\.?'],
  ['oz', 'oz|ounces?', 'oz|onzas?'],
  ['degF', '°\\s?F|degrees? F', '°\\s?F|grados? F'],
  ['degC', '°\\s?C|degrees? C', '°\\s?C|grados? C'],
  ['V', 'volts?', 'voltios?'],
  ['A', 'amps?|amperes?', 'amperios?'],
  ['mm', 'mm', 'mm'],
  ['cm', 'cm', 'cm'],
]
const NUMBER = '\\d+(?:[.,/]\\d+)*'
const unitPattern = (lang) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}.,/])(${NUMBER})(?:(")|\\s?(?:-\\s?)?(${UNITS.map((u) => `(?:${lang === 'en' ? u[1] : u[2]})`).join('|')}))?(?![\\p{L}\\p{N}])`,
    'giu',
  )
const UNIT_RE = { en: unitPattern('en'), es: unitPattern('es') }
function canonicalUnit(lang, text) {
  if (!text) return null
  for (const [canon, en, es] of UNITS)
    if (new RegExp(`^(?:${lang === 'en' ? en : es})$`, 'iu').test(text.replace(/\s+/g, ' '))) return canon
  return null
}
/** The numbers of a text, each with its canonical unit when one follows it ("12|in", "3|"). */
export function measurements(lang, text) {
  // An inch mark counts only right after the number (12"); a quotation mark after a space is not a unit.
  return [...text.matchAll(UNIT_RE[lang])].map((m) => `${m[1]}|${m[2] ? 'in' : (canonicalUnit(lang, m[3]) ?? '')}`)
}

/** References kept verbatim: [[node]] links and codes such as C-DW01-01, OWN-DEC-79, CL-01.SAF. */
export function references(text) {
  return [
    ...(text.match(/\[\[[^\]]+\]\]/g) ?? []),
    ...(text.replace(/\[\[[^\]]+\]\]/g, ' ').match(/(?<![\w-])[A-Z][A-Z0-9]*(?:[-.][A-Z0-9]+)+(?![\w-])/g) ?? []),
  ]
}
const withoutReferences = (text) =>
  text.replace(/\[\[[^\]]+\]\]/g, ' ').replace(/(?<![\w-])[A-Z][A-Z0-9]*(?:[-.][A-Z0-9]+)+(?![\w-])/g, ' ')
const CONTROL_TOKENS = /\b(HOLD|GATE|FLAG)\b/g
const count = (re, text) => (text.match(re) ?? []).length
const sorted = (xs) => [...xs].sort()
const sameBag = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const diff = (a, b) => {
  const rest = [...b]
  const missing = []
  for (const x of a) {
    const i = rest.indexOf(x)
    if (i < 0) missing.push(x)
    else rest.splice(i, 1)
  }
  return { missing, extra: rest }
}

/** The structure of a line: its indentation, list, quote or table marker, and the cell count of a table row. */
export function structure(line) {
  const m = /^(\s*)(- \[ \] |[-*] |> ?|\|)?/.exec(line)
  const marker = (m[2] ?? '').replace(/^> ?$/, '>').replace(/^\* /, '- ')
  const cells = marker === '|' ? count(/\|/g, line) : 0
  const separator = marker === '|' && /^\|[\s:|-]+\|$/.test(line)
  return `${m[1]}${marker}${cells ? `#${cells}` : ''}${separator ? 'sep' : ''}`
}
const EVIDENCE_LINE = /^ {2}- Evidence: /
/** Whether a line still reads as English: unchanged and holding at least three lowercase words. */
const untranslated = (en, es) => en === es && count(/\b[a-z]{3,}\b/g, en) >= 3

/**
 * Compares one translation with its English version. Returns the result per category, the problems found (category,
 * item and what is wrong), the ambiguous flags, and the Spanish content (the English structure with the Spanish lines).
 */
export function compareSop(english, translation) {
  const problems = []
  const fail = (category, item, detail) => problems.push({ category, item, detail })
  const items = translation.items ?? {}
  const headings = translation.headings ?? []
  const used = new Set()
  const section = (list, structural) =>
    list.map((item) => {
      const es = items[item.id]
      used.add(item.id)
      if (!Array.isArray(es)) {
        fail(structural, item.id, 'no Spanish counterpart')
        return { ...item }
      }
      if (es.length !== item.lines.length)
        fail(structural, item.id, `${item.lines.length} English lines, ${es.length} Spanish lines`)
      item.lines.forEach((en, i) => {
        const line = es[i]
        if (typeof line !== 'string') return
        if (structure(en) !== structure(line))
          fail(structural, item.id, `line ${i + 1}: list or table structure differs`)
        if (EVIDENCE_LINE.test(en) && line !== en) fail(structural, item.id, `line ${i + 1}: evidence line changed`)
        if (line.replace(/^(\s*)(- \[ \] |[-*] |> ?|\|)?/, '').trim() === '')
          fail(structural, item.id, `line ${i + 1}: empty`)
        if (untranslated(en, line)) fail('step_order', item.id, `line ${i + 1}: left in English`)
      })
      const enText = item.lines.join('\n')
      const esText = es.join('\n')
      if (!sameBag(references(enText), references(esText))) {
        const d = diff(references(enText), references(esText))
        fail(
          'step_order',
          item.id,
          `references changed: missing ${d.missing.join(', ') || '-'}; extra ${d.extra.join(', ') || '-'}`,
        )
      }
      if (count(CONTROL_TOKENS, enText) !== count(CONTROL_TOKENS, esText))
        fail('warnings', item.id, 'HOLD, GATE or FLAG token not kept verbatim')
      // Terms are counted outside references, so [[FACT-SVC-ESCALATION-PATH]] is not a stop-work word.
      const enWords = withoutReferences(enText)
      const esWords = withoutReferences(esText)
      for (const category of ['warnings', 'ppe', 'prohibited_actions', 'stop_work']) {
        const n = count(TERMS[category].en, enWords)
        const m = count(TERMS[category].es, esWords)
        if (m < n) fail(category, item.id, `${n} English terms, ${m} Spanish counterparts`)
      }
      const mEn = measurements('en', enText)
      const mEs = measurements('es', esText)
      if (!sameBag(mEn, mEs)) {
        const d = diff(mEn, mEs)
        fail(
          'measurements_units',
          item.id,
          `missing ${d.missing.join(', ') || '-'}; extra ${d.extra.join(', ') || '-'}`,
        )
      }
      return { ...item, lines: es.map(String) }
    })
  const stages = english.content.stages.map((s, i) => {
    const heading = headings[i]
    if (typeof heading !== 'string' || heading.trim() === '')
      fail('step_order', `stage ${s.stage}`, 'no Spanish heading')
    else if (!heading.startsWith(`${s.stage}. `)) fail('step_order', `stage ${s.stage}`, 'heading number differs')
    return { ...s, heading: typeof heading === 'string' ? heading : s.heading, items: section(s.items, 'step_order') }
  })
  const stopWork = section(english.content.stopWork, 'stop_work')
  for (const id of Object.keys(items)) if (!used.has(id)) fail('step_order', id, 'no such English item')
  if (headings.length !== english.content.stages.length) fail('step_order', 'stages', 'stage headings do not match')
  if (typeof translation.title !== 'string' || translation.title.trim() === '')
    fail('step_order', 'title', 'no Spanish title')
  const ambiguous = (translation.ambiguous ?? []).map((a) => ({ item: String(a.item), note: String(a.note) }))
  const results = Object.fromEntries(
    CATEGORIES.map((c) => [c, problems.some((p) => p.category === c) ? 'fail' : 'pass']),
  )
  return { results, problems, ambiguous, content: { stages, stopWork } }
}

/** Stable JSON: keys sorted at every level, so a hash depends on content only. */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/**
 * The Spanish release records: one per translation made for the current English version, in SOP order; translations of
 * an older English version are listed as stale. `previous` keeps each unchanged comparison's check date.
 */
export function buildSpanish({ sops, translations, previous = [], today }) {
  const versions = []
  const stale = []
  for (const english of sops) {
    const translation = translations.find((t) => t.sopId === english.id)
    if (!translation) continue
    if (translation.englishContentSha256 !== english.contentSha256) {
      stale.push(english.id)
      continue
    }
    const translationSha256 = sha256(stable(translation))
    const { results, problems, ambiguous, content } = compareSop(english, translation)
    const released = CATEGORIES.every((c) => results[c] === 'pass') && ambiguous.length === 0
    const before = previous.find(
      (p) =>
        p.sopId === english.id &&
        p.englishContentSha256 === english.contentSha256 &&
        p.translationSha256 === translationSha256 &&
        p.check?.tool === TOOL_VERSION,
    )
    versions.push({
      sopId: english.id,
      englishContentSha256: english.contentSha256,
      title: translation.title,
      translationSha256,
      content,
      contentSha256: sha256(stable(content)),
      check: { tool: TOOL_VERSION, checkedOn: before?.check.checkedOn ?? today, results, problems, ambiguous },
      releaseStatus: released ? 'ai_reviewed' : 'pending',
    })
  }
  for (const t of translations)
    if (!sops.some((s) => s.id === t.sopId)) throw new Error(`${t.sopId}: no English SOP with this id`)
  return { versions, stale }
}

/** Pretty JSON with each item on one line, so a changed item is a one-line diff. */
function pretty(value, indent = '') {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value && 'lines' in value)
    return JSON.stringify(value)
  if (value && typeof value === 'object' && !Array.isArray(value) && 'category' in value && 'detail' in value)
    return JSON.stringify(value)
  const next = `${indent}  `
  if (Array.isArray(value))
    return value.length ? `[\n${value.map((v) => next + pretty(v, next)).join(',\n')}\n${indent}]` : '[]'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    return keys.length
      ? `{\n${keys.map((k) => `${next}${JSON.stringify(k)}: ${pretty(value[k], next)}`).join(',\n')}\n${indent}}`
      : '{}'
  }
  return JSON.stringify(value)
}

export function render(out) {
  return `${pretty({
    $comment:
      'Generated by tools/compare-safety-es.mjs (TSK-0103): each Spanish SOP translation compared with its English ' +
      'version. Do not edit: change a translation in packages/db/translations/sops-es/, then rerun the tool.',
    ...out,
  })}\n`
}

export function loadInputs() {
  const sops = JSON.parse(readFileSync(SOPS, 'utf8')).sops
  const translations = existsSync(TRANSLATIONS)
    ? readdirSync(TRANSLATIONS)
        .filter((f) => /^SOP-[A-Z]{2}-\d{2}\.json$/.test(f))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(TRANSLATIONS, f), 'utf8')))
    : []
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).versions : []
  return { sops, translations, previous }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildSpanish({ ...loadInputs(), today: new Date().toISOString().slice(0, 10) })
  const text = render(out)
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  for (const v of out.versions) {
    if (only && !only.split(',').includes(v.sopId)) continue
    const failed = v.check.problems.length
    console.log(
      `${v.sopId}: ${v.releaseStatus}${failed ? ` (${failed} problems)` : ''}${v.check.ambiguous.length ? ` (${v.check.ambiguous.length} ambiguous)` : ''}`,
    )
    if (process.argv.includes('--verbose'))
      for (const p of v.check.problems) console.log(`  ${p.category} ${p.item}: ${p.detail}`)
  }
  for (const id of out.stale) console.log(`${id}: stale translation (the English changed): translate it again`)
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== text) {
      console.error('packages/db/seed/sops-es.json is out of date: run node tools/compare-safety-es.mjs')
      process.exit(1)
    }
    console.log('sops-es.json is up to date')
  } else if (!process.argv.includes('--dry-run')) {
    writeFileSync(OUT, text)
    console.log(`wrote ${OUT}`)
  }
}
