// Staff glossary (HH-LANG-02; TSK-0102): one Spanish rendering for each recurring staff term, so a worker reads the
// same word on every screen. test/repository.test.ts checks it over the real catalogs with `glossaryProblems`: every
// staff.en message that uses a term must use its Spanish rendering in staff.es. PROPOSED (OQ-SPANISH-CATALOG-DETAILS):
// the renderings follow the owner's own Spanish where it exists ("propietario" in OWN-DEC-172 item 6) and otherwise
// the word most staff.es messages already used.
//
// English is matched outside quotations (“…”, "…"): a Spanish message may quote English customer wording as it is.

export interface GlossaryTerm {
  /** The term as staff read it in English. */
  readonly term: string
  /** Where the English term is used in this sense. Case matters where the sense depends on it (Owner, Hold). */
  readonly en: RegExp
  /** The Spanish rendering every matching staff.es message must contain. */
  readonly es: RegExp
  /** The rendering, for people. */
  readonly spanish: string
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  { term: 'Owner (the role)', en: /\bOwner(?:'s)?\b/, es: /propietari/i, spanish: 'propietario' },
  {
    term: 'hold (a job, review or safety hold)',
    en: /\b(?:Holds?|(?:safety|critical|job-level|job|review|intake|response|open) holds?|on Hold)\b/,
    es: /retenci[oó]n|retenciones/i,
    spanish: 'retención',
  },
  { term: 'Stop Work', en: /\bStop Work\b/, es: /detener el trabajo|detenci[oó]n/i, spanish: 'Detener el trabajo' },
  { term: 'Start Work', en: /\bStart Work\b/, es: /Iniciar trabajo/i, spanish: 'Iniciar trabajo' },
  { term: 'punch item', en: /\bpunch\b/i, es: /pendiente/i, spanish: 'pendiente' },
  { term: 'walkthrough', en: /\bwalk-?through/i, es: /recorrido/i, spanish: 'recorrido' },
  { term: 'deposit', en: /\bdeposits?\b/i, es: /dep[oó]sito/i, spanish: 'depósito' },
  { term: 'estimate (the document)', en: /(?<!cost )\bestimates?\b/i, es: /presupuesto/i, spanish: 'presupuesto' },
  { term: 'PPE', en: /\bPPE\b/, es: /\bEPP\b/, spanish: 'EPP' },
  { term: 'job packet', en: /\bpackets?\b/i, es: /paquete/i, spanish: 'paquete de trabajo' },
  { term: 'change order', en: /\bchange orders?\b/i, es: /[oó]rden(?:es)? de cambio/i, spanish: 'orden de cambio' },
  { term: 'invoice', en: /\binvoices?\b/i, es: /factura/i, spanish: 'factura' },
  { term: 'AI-reviewed', en: /\bAI-reviewed\b/i, es: /revisad[oa]s? por IA/i, spanish: 'revisado por IA' },
  {
    term: 'Spanish safety review pending',
    en: /\bSpanish safety review pending\b/i,
    es: /Revisi[oó]n de seguridad en español pendiente/i,
    spanish: 'Revisión de seguridad en español pendiente',
  },
]

/** A message without ICU arguments and quotations: what a reader sees as the message's own words. */
function ownWords(message: string): string {
  return message.replace(/\{\s*[\w]+\s*(?:,\s*(?:number|date|time)[^{}]*)?\}/g, ' ').replace(/“[^”]*”|"[^"]*"/g, ' ')
}

export interface GlossaryProblem {
  readonly key: string
  readonly term: string
  readonly detail: string
}

/** Every staff.es message that does not use the glossary rendering of a term its English uses. */
export function glossaryProblems(
  en: Readonly<Record<string, string>>,
  es: Readonly<Record<string, string>>,
  glossary: readonly GlossaryTerm[] = GLOSSARY,
): GlossaryProblem[] {
  const problems: GlossaryProblem[] = []
  for (const [key, english] of Object.entries(en)) {
    const spanish = es[key]
    if (spanish === undefined) continue
    for (const g of glossary) {
      if (g.en.test(ownWords(english)) && !g.es.test(spanish))
        problems.push({ key, term: g.term, detail: `the Spanish does not use "${g.spanish}"` })
    }
  }
  return problems
}
