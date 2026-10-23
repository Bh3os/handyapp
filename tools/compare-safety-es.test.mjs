// tools/compare-safety-es.mjs (TSK-0103; HH-LANG-04, HH-PKT-04, T45, T70, OWN-DEC-79, RULE-LANGUAGES): the separate,
// deterministic comparison of each Spanish SOP translation with its English version, and the committed release
// records. The SOP below is synthetic (RULE-SYNTHETIC-DATA); the last tests read the committed files.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildSpanish,
  CATEGORIES,
  compareSop,
  loadInputs,
  measurements,
  render,
  TOOL_VERSION,
} from './compare-safety-es.mjs'

const step = (id, line, extra = {}) => ({
  kind: 'step',
  checkbox: false,
  lines: [line],
  evidence: [],
  required: true,
  holdBefore: [],
  id,
  section: null,
  line: null,
  ...extra,
})
const HEADINGS_EN = [
  'Site preparation and property protection',
  'Setup and required measurements/checks',
  'Service-specific work steps',
  'Quality checks',
  'Cleanup and waste handling',
  'Final checks, completion photos and walkthrough',
]
const KEYS = ['site_preparation', 'setup_checks', 'work_steps', 'quality_checks', 'cleanup_waste', 'final_checks']
const ENGLISH = {
  id: 'SOP-ZZ-01',
  contentSha256: 'a'.repeat(64),
  content: {
    stages: KEYS.map((key, i) => ({
      stage: i + 1,
      key,
      heading: `${i + 1}. ${HEADINGS_EN[i]}`,
      items:
        i === 2
          ? [
              {
                kind: 'control',
                control: 'HOLD',
                ref: 'C-ZZ01-01',
                lines: ['> HOLD (C-ZZ01-01): confirm the synthetic leak is fixed. Do not start; STOP and escalate.'],
                id: '3.1',
                section: null,
                line: null,
              },
              step(
                '3.2',
                '- Wear gloves and eye protection; never mix the two synthetic cleaners (warning: toxic fumes).',
              ),
              step('3.3', '- Let the synthetic patch dry for 24 hours and keep it 6 inches from the wall.', {
                lines: [
                  '- Let the synthetic patch dry for 24 hours and keep it 6 inches from the wall.',
                  '  - Evidence: photo',
                ],
                evidence: ['photo'],
              }),
            ]
          : [step(`${i + 1}.1`, `- Synthetic step for stage ${i + 1} (source: spec ZZ-01.SAF).`)],
    })),
    stopWork: [step('stop.1', '- Stop work and call the Owner if a synthetic hazard appears.')],
    openQuestions: [],
  },
}
const GOOD = {
  sopId: 'SOP-ZZ-01',
  englishContentSha256: 'a'.repeat(64),
  title: 'SOP ZZ-01: Servicio sintético',
  headings: [
    '1. Preparación del sitio y protección de la propiedad',
    '2. Preparación y mediciones/comprobaciones requeridas',
    '3. Pasos de trabajo específicos del servicio',
    '4. Comprobaciones de calidad',
    '5. Limpieza y manejo de residuos',
    '6. Comprobaciones finales, fotos de finalización y recorrido',
  ],
  items: {
    1.1: ['- Paso sintético de la etapa 1 (fuente: spec ZZ-01.SAF).'],
    2.1: ['- Paso sintético de la etapa 2 (fuente: spec ZZ-01.SAF).'],
    3.1: ['> HOLD (C-ZZ01-01): confirme que la fuga sintética está reparada. No empiece; DETÉNGASE y escale.'],
    3.2: [
      '- Use guantes y protección ocular; nunca mezcle los dos limpiadores sintéticos (advertencia: humos tóxicos).',
    ],
    3.3: [
      '- Deje secar el parche sintético durante 24 horas y manténgalo a 6 pulgadas de la pared.',
      '  - Evidence: photo',
    ],
    4.1: ['- Paso sintético de la etapa 4 (fuente: spec ZZ-01.SAF).'],
    5.1: ['- Paso sintético de la etapa 5 (fuente: spec ZZ-01.SAF).'],
    6.1: ['- Paso sintético de la etapa 6 (fuente: spec ZZ-01.SAF).'],
    'stop.1': ['- Detenga el trabajo y llame al Owner si aparece un peligro sintético.'],
  },
  ambiguous: [],
}
const variant = (items, extra = {}) => ({ ...GOOD, ...extra, items: { ...GOOD.items, ...items } })
const failed = (r) => CATEGORIES.filter((c) => r.results[c] === 'fail')

test('[HH-LANG-04][HH-PKT-04] a complete translation passes every category and is released as AI-reviewed', () => {
  const r = compareSop(ENGLISH, GOOD)
  assert.deepEqual(r.problems, [])
  assert.deepEqual(failed(r), [])
  const out = buildSpanish({ sops: [ENGLISH], translations: [GOOD], today: '2026-10-23' })
  assert.equal(out.versions[0].releaseStatus, 'ai_reviewed')
  assert.equal(out.versions[0].check.checkedOn, '2026-10-23')
  assert.equal(out.versions[0].check.tool, TOOL_VERSION)
  // The Spanish content keeps the English ids, kinds and order; only the lines and headings are Spanish.
  assert.deepEqual(
    out.versions[0].content.stages.flatMap((s) => s.items.map((i) => `${i.id}:${i.kind}`)),
    ENGLISH.content.stages.flatMap((s) => s.items.map((i) => `${i.id}:${i.kind}`)),
  )
  assert.equal(out.versions[0].content.stages[2].items[1].lines[0], GOOD.items['3.2'][0])
})

test('[HH-LANG-04][T45] a dropped warning fails the comparison and keeps the procedure pending', () => {
  const r = compareSop(
    ENGLISH,
    variant({ 3.2: ['- Use guantes y protección ocular; nunca mezcle los dos limpiadores sintéticos.'] }),
  )
  assert.deepEqual(failed(r), ['warnings'])
  assert.equal(r.problems[0].item, '3.2')
  const out = buildSpanish({
    sops: [ENGLISH],
    translations: [variant({ 3.2: ['- Use guantes y protección ocular; nunca mezcle los dos limpiadores.'] })],
    today: '2026-10-23',
  })
  assert.equal(out.versions[0].releaseStatus, 'pending')
})

test('[HH-PKT-04] a dropped PPE item, prohibition, stop condition or control token fails its own category', () => {
  assert.deepEqual(
    failed(
      compareSop(
        ENGLISH,
        variant({
          3.2: ['- Use guantes; nunca mezcle los dos limpiadores sintéticos (advertencia: humos tóxicos).'],
        }),
      ),
    ),
    ['ppe'],
  )
  assert.deepEqual(
    failed(
      compareSop(
        ENGLISH,
        variant({
          3.2: [
            '- Use guantes y protección ocular; mezcle con cuidado los dos limpiadores (advertencia: humos tóxicos).',
          ],
        }),
      ),
    ),
    ['prohibited_actions'],
  )
  assert.deepEqual(
    failed(compareSop(ENGLISH, variant({ 'stop.1': ['- Llame al Owner si aparece un peligro sintético.'] }))),
    ['stop_work'],
  )
  assert.ok(
    failed(
      compareSop(
        ENGLISH,
        variant({
          3.1: ['> RETENCIÓN (C-ZZ01-01): confirme que la fuga está reparada. No empiece; DETÉNGASE y escale.'],
        }),
      ),
    ).includes('warnings'),
  )
})

test('[HH-PKT-04] a changed number or unit fails measurements and units', () => {
  const changed = (line) => failed(compareSop(ENGLISH, variant({ 3.3: [line, '  - Evidence: photo'] })))
  assert.deepEqual(
    changed('- Deje secar el parche sintético durante 12 horas y manténgalo a 6 pulgadas de la pared.'),
    ['measurements_units'],
  )
  assert.deepEqual(
    changed('- Deje secar el parche sintético durante 24 minutos y manténgalo a 6 pulgadas de la pared.'),
    ['measurements_units'],
  )
  assert.deepEqual(changed('- Deje secar el parche sintético durante 24 horas y manténgalo cerca de la pared.'), [
    'measurements_units',
  ])
  assert.deepEqual(measurements('en', 'dry 24 hours, 6 inches, 12" and section 12 "Name"'), [
    '24|h',
    '6|in',
    '12|in',
    '12|',
  ])
  assert.deepEqual(measurements('es', 'de 3 a 5 días, 6 pulgadas'), ['3|', '5|d', '6|in'])
})

test('[HH-PKT-04] step order and structure: a missing, extra, reordered or untranslated item fails', () => {
  const without = { ...GOOD.items }
  delete without['4.1']
  assert.deepEqual(failed(compareSop(ENGLISH, { ...GOOD, items: without })), ['step_order'])
  assert.deepEqual(failed(compareSop(ENGLISH, variant({ 9.9: ['- Paso inventado.'] }))), ['step_order'])
  // Two lines swapped between items: each item no longer matches its English counterpart.
  assert.ok(
    failed(compareSop(ENGLISH, variant({ 3.3: GOOD.items['3.2'], 3.2: GOOD.items['3.3'] }))).includes('step_order'),
  )
  assert.deepEqual(
    failed(compareSop(ENGLISH, variant({ 1.1: ['- Synthetic step for stage 1 (source: spec ZZ-01.SAF).'] }))),
    ['step_order'],
  )
  // The evidence line is kept verbatim; a dropped reference fails.
  assert.ok(
    failed(compareSop(ENGLISH, variant({ 3.3: [GOOD.items['3.3'][0], '  - Evidencia: foto'] }))).includes('step_order'),
  )
  assert.ok(failed(compareSop(ENGLISH, variant({ 2.1: ['- Paso sintético de la etapa 2.'] }))).includes('step_order'))
  // The stop-work section is its own category.
  const noStop = { ...GOOD.items }
  delete noStop['stop.1']
  assert.ok(failed(compareSop(ENGLISH, { ...GOOD, items: noStop })).includes('stop_work'))
})

test('[HH-LANG-04] an ambiguous source instruction keeps only that procedure pending; nothing is invented', () => {
  const other = { ...ENGLISH, id: 'SOP-ZZ-02', contentSha256: 'b'.repeat(64) }
  const out = buildSpanish({
    sops: [ENGLISH, other],
    translations: [
      { ...GOOD, ambiguous: [{ item: '3.3', note: 'Synthetic: the source does not say which wall.' }] },
      { ...GOOD, sopId: 'SOP-ZZ-02', englishContentSha256: 'b'.repeat(64) },
    ],
    today: '2026-10-23',
  })
  assert.deepEqual(
    out.versions.map((v) => [v.sopId, v.releaseStatus]),
    [
      ['SOP-ZZ-01', 'pending'],
      ['SOP-ZZ-02', 'ai_reviewed'],
    ],
  )
  assert.deepEqual(out.versions[0].check.results, Object.fromEntries(CATEGORIES.map((c) => [c, 'pass'])))
})

test('[HH-LANG-04] a new English version makes the translation stale; an unchanged comparison keeps its date', () => {
  const changed = { ...ENGLISH, contentSha256: 'c'.repeat(64) }
  const stale = buildSpanish({ sops: [changed], translations: [GOOD], today: '2026-10-23' })
  assert.deepEqual(stale.versions, [])
  assert.deepEqual(stale.stale, ['SOP-ZZ-01'])
  const first = buildSpanish({ sops: [ENGLISH], translations: [GOOD], today: '2026-10-23' })
  const again = buildSpanish({ sops: [ENGLISH], translations: [GOOD], previous: first.versions, today: '2026-11-01' })
  assert.equal(again.versions[0].check.checkedOn, '2026-10-23')
  const edited = buildSpanish({
    sops: [ENGLISH],
    translations: [{ ...GOOD, title: 'SOP ZZ-01: Servicio sintético (revisado)' }],
    previous: first.versions,
    today: '2026-11-01',
  })
  assert.equal(edited.versions[0].check.checkedOn, '2026-11-01')
})

test('[HH-LANG-04][HH-PKT-04] the committed sops-es.json is what the translations and English versions produce', () => {
  const inputs = loadInputs()
  const out = buildSpanish({ ...inputs, today: '1970-01-01' })
  // A comparison that is not committed would carry this date and differ from the committed file.
  const committed = readFileSync(new URL('../packages/db/seed/sops-es.json', import.meta.url), 'utf8')
  assert.equal(render(out), committed)
  // The release is labelled AI-reviewed or pending, never human-reviewed or safety-certified (RULE-LANGUAGES). The SOP
  // text itself may name certified people (an EPA RRP certified renovator), so only the release record is checked.
  const records = out.versions.map((v) => ({ ...v, content: null }))
  assert.doesNotMatch(JSON.stringify(records), /human[- ]?review|certif|revisado por (?:un )?humano/i)
  assert.ok(out.versions.every((v) => ['ai_reviewed', 'pending'].includes(v.releaseStatus)))
  for (const v of out.versions)
    assert.equal(
      v.releaseStatus === 'ai_reviewed',
      CATEGORIES.every((c) => v.check.results[c] === 'pass') && v.check.ambiguous.length === 0,
    )
})
