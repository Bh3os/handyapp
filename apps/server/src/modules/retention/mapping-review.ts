// The review of the table-to-retention mapping (TSK-0152; OWN-DEC-201 I5, HH-PRIV-01, HH-PRIV-05, FACT-RETENTION-SCHEDULE,
// OQ-RETENTION-REVIEW, RULE-HUMAN-REVIEW). "Audit the actual staging data inventory and table-to-retention mappings
// against the approved retention schedule. Do not approve destructive production deletion based solely on an
// unreviewed table mapping."
// - The mapping is the data inventory's annotations (inventory.ts): each table's retention categories, whether it is
//   protected evidence and its end of life, with each category's configuration key and scan state. Its digest is the
//   SHA-256 of that mapping as rendered here, so any change of an annotation or a category is a new mapping to review.
// - The report (docs/retention-mapping-review.md, written by `pnpm data-inventory`) groups the tables by category,
//   says where each category's rule comes from (decided by the Owner, provisional until the CPA and the attorney
//   confirm it, or no period in the schedule) and lists the findings a reviewer should look at (PROPOSED kinds).
// - The live audit compares the database the server runs on (staging) with the annotations: a table without an
//   annotation or an annotation without a table is a finding.
// - The Owner records a review of one digest, saying whether the CPA and the attorney confirmed it (append-only,
//   privacy.mapping_reviews). In production every Delete action stays disabled until the latest review names the
//   mapping in force with both confirmations (deletionGate): the Delete of a review entry, the erasures of a privacy
//   deletion request and the audit-retention delete. Closing login access is not a deletion of records and is never
//   held by it (OWN-DEC-71). Outside production nothing is gated, so staging keeps exercising the workflow.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { CATEGORY_DEFINITIONS, RETENTION_CATEGORIES, type RetentionCategory, type ScanState } from './schedule.js'
import { TABLES, endOfLife, type TableAnnotation } from './inventory.js'

type Reader = Db | Tx

/** Where a category's rule comes from. */
export type CategoryStatus = 'decided' | 'provisional' | 'unscheduled'

export function categoryStatus(c: RetentionCategory): CategoryStatus {
  if (c === 'not_scheduled') return 'unscheduled'
  return CATEGORY_DEFINITIONS[c].sources.includes('OWN-DEC-177') ? 'provisional' : 'decided'
}

/** What a reviewer should look at in a table's mapping (PROPOSED kinds). */
export const MAPPING_FINDINGS = [
  // A category with no period in the approved schedule (kept, never deleted automatically).
  'no_scheduled_period',
  // A provisional period (OWN-DEC-177) the CPA and the attorney have not confirmed.
  'provisional_period',
  // The event that starts the period is not recorded yet: the rows never reach the review queue.
  'start_not_recorded',
  // Several categories: the record each row belongs to decides which applies.
  'several_categories',
  // Only some rows are protected evidence.
  'partly_protected',
] as const
export type MappingFinding = (typeof MAPPING_FINDINGS)[number]

export type MappingRow = {
  table: string
  categories: RetentionCategory[]
  protectedEvidence: boolean | string
  endOfLife: string
  findings: MappingFinding[]
}

const START_NOT_RECORDED: ScanState = 'start_not_recorded'

export function findingsOf(a: TableAnnotation): MappingFinding[] {
  const out: MappingFinding[] = []
  const cats = a.categories
  if (cats.some((c) => categoryStatus(c) === 'unscheduled')) out.push('no_scheduled_period')
  if (cats.some((c) => categoryStatus(c) === 'provisional')) out.push('provisional_period')
  if (cats.some((c) => CATEGORY_DEFINITIONS[c].scan === START_NOT_RECORDED)) out.push('start_not_recorded')
  if (cats.length > 1) out.push('several_categories')
  if (typeof a.protectedEvidence === 'string') out.push('partly_protected')
  return out
}

/** The mapping as reviewed: every annotated table, sorted by name. */
export function mappingRows(): MappingRow[] {
  return Object.entries(TABLES as Record<string, TableAnnotation>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, a]) => ({
      table,
      categories: [...a.categories],
      protectedEvidence: a.protectedEvidence ?? false,
      endOfLife: endOfLife(a),
      findings: findingsOf(a),
    }))
}

/** The SHA-256 of the mapping: the tables' categories, evidence and end of life, and each category's key and scan. */
export function mappingDigest(): string {
  const mapping = {
    tables: mappingRows().map((r) => [r.table, r.categories, r.protectedEvidence, r.endOfLife]),
    categories: RETENTION_CATEGORIES.map((c) => [
      c,
      CATEGORY_DEFINITIONS[c].configKey,
      CATEGORY_DEFINITIONS[c].scan,
      categoryStatus(c),
    ]),
  }
  return createHash('sha256').update(JSON.stringify(mapping), 'utf8').digest('hex')
}

/** The live audit: the database's tables against the annotations (on staging, the actual inventory). */
export async function liveMappingAudit(db: Reader): Promise<{ unannotated: string[]; missing: string[] }> {
  const { rows } = await sql<{ t: string }>`SELECT n.nspname || '.' || c.relname AS t FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY 1`.execute(db)
  const actual = new Set(rows.map((r) => r.t))
  const annotated = new Set(Object.keys(TABLES))
  return {
    unannotated: [...actual].filter((t) => !annotated.has(t)).sort(),
    missing: [...annotated].filter((t) => !actual.has(t)).sort(),
  }
}

export type MappingReview = {
  id: string
  digest: string
  tables: number
  cpaConfirmed: boolean
  attorneyConfirmed: boolean
  note: string
  recordedBy: { id: string; name: string | null }
  recordedAt: string
}

export async function latestMappingReview(db: Reader): Promise<MappingReview | null> {
  const r = await db
    .selectFrom('privacy.mapping_reviews as m')
    .leftJoin('identity.staff_users as u', 'u.id', 'm.recorded_by')
    .select([
      'm.id',
      'm.digest',
      'm.tables',
      'm.cpa_confirmed',
      'm.attorney_confirmed',
      'm.note',
      'm.recorded_by',
      'u.display_name',
      'm.recorded_at',
    ])
    .orderBy('m.seq', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!r) return null
  return {
    id: r.id,
    digest: r.digest,
    tables: r.tables,
    cpaConfirmed: r.cpa_confirmed,
    attorneyConfirmed: r.attorney_confirmed,
    note: r.note,
    recordedBy: { id: r.recorded_by, name: r.display_name },
    recordedAt: new Date(r.recorded_at).toISOString(),
  }
}

/** A review that enables deletion: this exact mapping, confirmed by the CPA and the attorney. */
export const reviewCovers = (review: MappingReview | null, digest: string): boolean =>
  review !== null && review.digest === digest && review.cpaConfirmed && review.attorneyConfirmed

/** Whether the Delete actions may run here: always outside production; in production once the mapping is reviewed. */
export async function deletionAllowed(db: Reader, environment: string | undefined): Promise<boolean> {
  if (environment !== 'production') return true
  return reviewCovers(await latestMappingReview(db), mappingDigest())
}

/** The refusal of a Delete while production deletion waits for the review (CONFLICT MAPPING_NOT_REVIEWED). */
export const mappingNotReviewed = () =>
  new ApiError('CONFLICT', { fieldErrors: [{ field: 'blockers', code: 'MAPPING_NOT_REVIEWED', message: '' }] })

export type MappingStatus = {
  digest: string
  tables: number
  environment: string
  /** Production deletion: enabled once a covering review is recorded; outside production never gated. */
  productionDeletion: 'enabled' | 'disabled'
  latest: MappingReview | null
  /** The latest review names this mapping (whatever its confirmations). */
  current: boolean
  findings: { finding: MappingFinding; tables: number }[]
  categories: { category: RetentionCategory; status: CategoryStatus; scan: ScanState; tables: string[] }[]
  live: { unannotated: string[]; missing: string[] }
}

export async function mappingStatus(db: Reader, environment: string): Promise<MappingStatus> {
  const rows = mappingRows()
  const digest = mappingDigest()
  const latest = await latestMappingReview(db)
  return {
    digest,
    tables: rows.length,
    environment,
    productionDeletion: reviewCovers(latest, digest) ? 'enabled' : 'disabled',
    latest,
    current: latest?.digest === digest,
    findings: MAPPING_FINDINGS.map((finding) => ({
      finding,
      tables: rows.filter((r) => r.findings.includes(finding)).length,
    })),
    categories: RETENTION_CATEGORIES.map((category) => ({
      category,
      status: categoryStatus(category),
      scan: CATEGORY_DEFINITIONS[category].scan,
      tables: rows.filter((r) => r.categories.includes(category)).map((r) => r.table),
    })),
    live: await liveMappingAudit(db),
  }
}

export const MAPPING_NOTE_MAX = 2000

/** The Owner's review of the mapping in force (STALE_MAPPING when the digest is not the current one). */
export async function recordMappingReview(
  tx: Tx,
  input: {
    digest: string
    cpaConfirmed: boolean
    attorneyConfirmed: boolean
    note: string
    staffUserId: string
    requestId: string
  },
): Promise<MappingReview> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('privacy.mapping_review', 0))`.execute(tx)
  if (input.digest !== mappingDigest())
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'body.digest', code: 'STALE_MAPPING', message: '' }] })
  await tx
    .insertInto('privacy.mapping_reviews')
    .values({
      digest: input.digest,
      tables: mappingRows().length,
      cpa_confirmed: input.cpaConfirmed,
      attorney_confirmed: input.attorneyConfirmed,
      note: input.note.trim(),
      recorded_by: input.staffUserId,
      request_id: input.requestId,
    })
    .execute()
  return (await latestMappingReview(tx)) as MappingReview
}

const STATUS_TEXT: Record<CategoryStatus, string> = {
  decided: "Decided by the Owner's schedule; awaiting CPA and attorney confirmation (OQ-RETENTION-REVIEW)",
  provisional: 'Provisional default (OWN-DEC-177); awaiting CPA and attorney confirmation',
  unscheduled: 'No period in the schedule (PROPOSED: kept, never deleted automatically)',
}
const SCAN_TEXT: Record<ScanState, string> = {
  scanned: 'Expired records enter the review queue',
  start_not_recorded: 'Start not recorded yet: no review entries',
  no_period: 'No period: no review entries',
  while_referenced: 'Kept while referenced: no review entries',
  not_stored: 'Not in the database',
}
const FINDING_TEXT: Record<MappingFinding, string> = {
  no_scheduled_period: 'A category with no period in the approved schedule',
  provisional_period: 'A provisional period (OWN-DEC-177)',
  start_not_recorded: 'The event that starts the period is not recorded yet',
  several_categories: 'Several categories: the record each row belongs to decides',
  partly_protected: 'Only some rows are protected evidence',
}

const cell = (s: string) => s.replace(/\|/g, '\\|')
const row = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`

/** docs/retention-mapping-review.md: the report the Owner, the CPA and the attorney review. */
export function renderMappingReview(): string {
  const rows = mappingRows()
  const out: string[] = []
  const push = (...lines: string[]) => out.push(...lines)
  push(
    '# Table-to-retention mapping review',
    '',
    'Generated by `pnpm data-inventory` from the table annotations in `apps/server/src/modules/retention/inventory.ts`',
    'and the schedule in `apps/server/src/modules/retention/schedule.ts` (TSK-0152; OWN-DEC-201 I5, HH-PRIV-01). Do',
    'not edit by hand: a unit test fails when this file differs from the annotations.',
    '',
    `Mapping digest (SHA-256): \`${mappingDigest()}\` (${rows.length} tables).`,
    '',
    '## What the review decides',
    '',
    '- OWN-DEC-201 I5: "Audit the actual staging data inventory and table-to-retention mappings against the approved',
    '  retention schedule. Do not approve destructive production deletion based solely on an unreviewed table',
    '  mapping."',
    '- The Owner, the CPA and the attorney review this mapping: whether each table is in the right retention category,',
    "  whether each category's period applies to it, and the findings listed below. Their confirmation of the periods",
    '  themselves is OQ-RETENTION-REVIEW.',
    '- The Owner records the review on the Retention reviews screen (Table-to-retention mapping), naming this digest and',
    '  whether the CPA and the attorney confirmed it. In production every Delete action stays disabled until the latest',
    '  review names the mapping in force with both confirmations; any later change of an annotation is a new digest to',
    '  review. Nothing is deleted automatically in any case.',
    '- The live audit on the same screen compares the tables of the database the server runs on (staging) with these',
    '  annotations and lists any table without an annotation, or annotation without a table.',
    '',
    '## Findings',
    '',
    row(['Finding (PROPOSED)', 'Tables']),
    row(['---', '---']),
  )
  for (const f of MAPPING_FINDINGS)
    push(row([FINDING_TEXT[f], String(rows.filter((r) => r.findings.includes(f)).length)]))
  push('', '## Categories', '')
  for (const c of RETENTION_CATEGORIES) {
    const d = CATEGORY_DEFINITIONS[c]
    const tables = rows.filter((r) => r.categories.includes(c))
    push(
      `### \`${c}\``,
      '',
      `- Rule: ${d.decided}`,
      `- Status: ${STATUS_TEXT[categoryStatus(c)]}.`,
      `- Configuration: ${d.configKey ? `\`${d.configKey}\`` : 'none'}. Retention job: ${SCAN_TEXT[d.scan]}.`,
      `- Tables (${tables.length}): ${tables.length ? tables.map((t) => `\`${t.table}\``).join(', ') : 'none'}.`,
      '',
    )
  }
  push(
    '## Tables with findings',
    '',
    row(['Table', 'Categories', 'End of life', 'Findings']),
    row(['---', '---', '---', '---']),
  )
  for (const r of rows.filter((x) => x.findings.length > 0))
    push(
      row([
        `\`${r.table}\``,
        r.categories.map((c) => `\`${c}\``).join(', '),
        r.endOfLife,
        r.findings.map((f) => FINDING_TEXT[f]).join('; '),
      ]),
    )
  push('')
  return out.join('\n')
}
