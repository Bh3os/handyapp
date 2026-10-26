// Customer preparation instructions of a window offer (TSK-0146; OWN-DEC-194 B7, HH-SCH-11, HH-CUS-02, OWN-DEC-84,
// OWN-DEC-98, FACT-SVC-SUSPECTED-HAZMAT, RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
// - The default of a service is text the Owner approved for it (apps/server/src/modules/visits/preparation.ts): the
//   reviewed "Getting ready" steps of its service page (TSK-0132, OWN-DEC-180), as they are or as the Owner edited
//   them. servicePagePreparation() turns those steps into the text the Owner reviews; nothing here writes a step.
// - visitPreparationText() combines the defaults of a visit's services into the text the offer form starts from.
// - preparationProblems() is the unsafe-instruction check every offer's instructions and every default pass: a
//   customer is never asked to do hazardous preparation (OWN-DEC-84, HH-CUS-02) or to inspect a hazardous area
//   (OWN-DEC-98). PROPOSED (OQ-PREPARATION-DEFAULT-DETAILS): the rule families and their words, drawn from the
//   human-review areas (RULE-HUMAN-REVIEW: licensed electrical, plumbing, HVAC and gas work, structural work,
//   asbestos, lead and mold) and the falls the SOPs name. A rule matches an action on its subject (for example
//   "remove the mold", "disconnect the gas line", "climb onto the roof"), never a mention alone ("tell us about any
//   past mold"), and a sentence that tells the customer not to do it ("do not climb on the roof") passes.
// This module has no imports: the staff app runs the same check while staff type.

/** The longest instructions an offer keeps (OWN-DEC-194 B7 as built: up to 1,000 characters). */
export const PREPARATION_MAX_LENGTH = 1000

/** The unsafe-instruction rule families (PROPOSED). */
export const PREPARATION_RULES = [
  'hazardous_materials',
  'licensed_trade',
  'structural',
  'heights_and_confined_spaces',
  'hazard_inspection',
] as const
export type PreparationRule = (typeof PREPARATION_RULES)[number]

export type PreparationProblem = {
  readonly rule: PreparationRule
  /** The words that matched, as written. */
  readonly match: string
}

/** The refusal code of a rule (apps/server visits: field body.preparationInstructions). */
export const unsafeCode = (rule: PreparationRule) => `UNSAFE_${rule.toUpperCase()}`

/** Each verb with its endings (a doubled last consonant too: stepping, capped). */
const inflected = (verbs: readonly string[]) =>
  verbs
    .map((v) =>
      v.includes(' ') ? v.replace(/ /g, '\\s+') : `${v}(?:s|es|ed|d|ing|${v.slice(-1)}ing|${v.slice(-1)}ed)?`,
    )
    .join('|')
/** Words that may stand between an action and its subject: articles, pronouns, particles and plain descriptions. */
const FILLER =
  '(?:the|a|an|any|all|some|your|our|its|their|this|that|these|those|it|them|old|existing|visible|exposed|loose|' +
  'live|broken|damaged|peeling|suspected|possible|off|up|out|away|down|on|onto|into|in|inside|under|behind|around|' +
  'for|of|to|from|over)'
/** An action, up to four filler words, then its subject. */
const rule = (verbs: readonly string[], subjects: string) =>
  new RegExp(`\\b(?:${inflected(verbs)})(?:\\s+${FILLER}){0,4}\\s+(?:${subjects})\\b`, 'gi')

const HAZMAT =
  'asbestos|vermiculite|lead[- ]based(?:\\s+paint)?|lead\\s+paint|lead\\s+pipes?|mou?lds?|mou?ldy|black\\s+mou?ld|' +
  'popcorn\\s+(?:ceilings?|texture)|acoustic\\s+ceilings?'
const TRADE =
  'gas\\s+(?:lines?|pipes?|piping|valves?|meters?|connections?|supply|appliances?)|propane\\s+(?:lines?|hoses?|' +
  'regulators?|tanks?)|wiring|wires|circuits?|electrical\\s+(?:panels?|boxes|box|wiring|outlets?|work)|' +
  '(?:breaker|fuse|service)\\s+(?:panels?|boxes|box)|breakers?|junction\\s+box(?:es)?|outlets?|receptacles?|' +
  'light\\s+fixtures?|light\\s+switch(?:es)?|plumbing|water\\s+(?:lines?|pipes?|heaters?|supply\\s+lines?)|' +
  'supply\\s+lines?|drain\\s+(?:lines?|pipes?)|pipes|furnaces?|hvac|air\\s+handlers?|ductwork|condensers?|' +
  'refrigerant'
const STRUCTURE =
  'load[- ]bearing\\s+walls?|bearing\\s+walls?|beams?|joists?|rafters?|trusses|truss|headers?|' +
  'support\\s+(?:posts?|columns?|beams?)|columns?|foundations?'
const HEIGHTS = 'roofs?|rooftops?|ladders?|step\\s+ladders?|scaffold(?:s|ing)?'
const CONFINED = 'attics?|crawl\\s*spaces?'
const INSPECTED =
  `gas\\s+leaks?|gas\\s+smells?|wasps?|hornets?|bees|nests?|pests?|rodents?|attics?|crawl\\s*spaces?|roofs?|` +
  `chimneys?|(?:electrical|breaker)\\s+panels?|wiring|${HAZMAT}`

const RULES: readonly (readonly [PreparationRule, RegExp])[] = [
  [
    'hazardous_materials',
    rule(
      [
        'remove',
        'scrape',
        'sand',
        'strip',
        'disturb',
        'demolish',
        'tear',
        'cut',
        'drill',
        'break',
        'clean',
        'wipe',
        'scrub',
        'spray',
        'bleach',
        'treat',
        'kill',
        'dispose',
        'bag',
        'wash',
      ],
      HAZMAT,
    ),
  ],
  [
    'licensed_trade',
    rule(
      [
        'disconnect',
        'reconnect',
        'connect',
        'rewire',
        'wire',
        'splice',
        'cap',
        'uncap',
        'repair',
        'fix',
        'replace',
        'install',
        'relocate',
        'reroute',
        'open',
        'unscrew',
        'remove',
        'move',
        'cut',
        'drain',
        'recharge',
      ],
      TRADE,
    ),
  ],
  [
    'structural',
    rule(
      ['remove', 'cut', 'notch', 'drill', 'demolish', 'knock', 'tear', 'take', 'move', 'alter', 'jack', 'brace'],
      STRUCTURE,
    ),
  ],
  [
    'heights_and_confined_spaces',
    rule(['climb', 'get', 'go', 'step', 'stand', 'walk', 'work', 'use', 'set up', 'lean', 'crawl', 'enter'], HEIGHTS),
  ],
  ['heights_and_confined_spaces', rule(['climb', 'go', 'get', 'crawl', 'enter', 'walk', 'work', 'step'], CONFINED)],
  [
    'hazard_inspection',
    rule(['inspect', 'check', 'examine', 'look', 'search', 'test', 'sample', 'sniff', 'smell', 'probe'], INSPECTED),
  ],
]

/** Words before an action in its sentence that tell the customer not to do it. */
const NEGATION = /\b(?:do\s+not|don['’]t|dont|never|avoid|no\s+need\s+to|not\s+to|please\s+don['’]t|without)\b/i

/** The start of the sentence holding a position (a period, question or exclamation mark, a semicolon or a newline). */
function sentenceStart(text: string, at: number): number {
  for (let i = at - 1; i >= 0; i--) if ('.!?;\n'.includes(text[i] as string)) return i + 1
  return 0
}

/**
 * The unsafe preparation the text asks a customer to do, one entry per rule and match, in text order. Empty when the
 * text is safe under the rules (PROPOSED) or empty.
 */
export function preparationProblems(text: string | null | undefined): PreparationProblem[] {
  if (!text) return []
  const found: (PreparationProblem & { at: number })[] = []
  for (const [name, pattern] of RULES)
    for (const m of text.matchAll(pattern)) {
      const at = m.index ?? 0
      if (NEGATION.test(text.slice(sentenceStart(text, at), at))) continue
      if (!found.some((f) => f.rule === name && f.at === at)) found.push({ rule: name, match: m[0], at })
    }
  return found.sort((a, b) => a.at - b.at).map(({ rule: r, match }) => ({ rule: r, match }))
}

/** The reviewed "Getting ready" steps of a service page as one text for the Owner's review: one step per line. */
export function servicePagePreparation(steps: readonly string[] | null | undefined): string | null {
  const lines = (steps ?? []).map((s) => s.trim()).filter(Boolean)
  return lines.length ? lines.join('\n') : null
}

/**
 * The text an offer starts from: the approved default of each of the visit's services, in the visit's order. One
 * service with a default gives its text; several give each under its service name, separated by a blank line
 * (PROPOSED). Null when no service of the visit has an approved default.
 */
export function visitPreparationText(defaults: readonly { name: string; text: string | null }[]): string | null {
  const set = defaults.filter((d): d is { name: string; text: string } => !!d.text?.trim())
  if (set.length === 0) return null
  if (set.length === 1) return (set[0] as { text: string }).text.trim()
  return set.map((d) => `${d.name}:\n${d.text.trim()}`).join('\n\n')
}

/** How an offer's instructions stand against the default it started from (kept with the offer). */
export const PREPARATION_BASES = ['default', 'edited', 'staff', 'none'] as const
export type PreparationBasis = (typeof PREPARATION_BASES)[number]

/** Spaces at each line's ends and blank runs do not count as an edit. */
const normal = (s: string | null | undefined) =>
  (s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/**
 * default: the text is the default as it was given; edited: a default was in force and staff changed or removed it;
 * staff: no default was in force and staff wrote the text; none: neither.
 */
export function preparationBasis(text: string | null | undefined, defaultText: string | null): PreparationBasis {
  const kept = normal(text)
  if (defaultText !== null) return kept === normal(defaultText) ? 'default' : 'edited'
  return kept ? 'staff' : 'none'
}
