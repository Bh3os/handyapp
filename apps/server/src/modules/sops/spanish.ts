// The Spanish release of SOP versions (TSK-0103; HH-LANG-04, HH-PKT-04, T45, T70, OWN-DEC-79, RULE-LANGUAGES).
// - The latest comparison recorded for an English version decides (catalog.sop_spanish_versions, migration 0085): its
//   status is "ai_reviewed" only when all six categories passed with nothing flagged; no comparison is "pending".
// - The Spanish text is returned only for a released version: a worker never reads Spanish safety text that did not
//   pass. The comparison result itself (date, result per category, flags) is returned either way.
// - Never labelled human-reviewed or safety-certified; the label is "AI-reviewed" (staff catalogs).
import type { Db, Tx } from '@handyhub/db'
import type { SopContent, SopItem } from '@handyhub/domain'

type Reader = Db | Tx

export const SPANISH_CATEGORIES = [
  'warnings',
  'ppe',
  'prohibited_actions',
  'measurements_units',
  'step_order',
  'stop_work',
] as const
export type SpanishCategory = (typeof SPANISH_CATEGORIES)[number]
export type SpanishStatus = 'ai_reviewed' | 'pending'

export type SpanishRelease = {
  status: SpanishStatus
  /** The latest comparison, or null when the version was never compared (never translated, or the English changed). */
  check: {
    checkedOn: string
    tool: string
    englishContentSha256: string
    results: Record<SpanishCategory, 'pass' | 'fail'>
    problems: number
    ambiguous: { item: string; note: string }[]
  } | null
  /** The Spanish title and content: only for a released version. */
  title: string | null
  content: Pick<SopContent, 'stages' | 'stopWork'> | null
}

const PENDING: SpanishRelease = { status: 'pending', check: null, title: null, content: null }
const day = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** The Spanish release of each English version id (pending when none was recorded). */
export async function spanishReleases(db: Reader, versionIds: readonly string[]): Promise<Map<string, SpanishRelease>> {
  const out = new Map<string, SpanishRelease>(versionIds.map((id) => [id, PENDING]))
  if (!versionIds.length) return out
  const rows = await db
    .selectFrom('catalog.sop_spanish_versions')
    .select([
      'sop_version_id',
      'english_content_sha256',
      'title',
      'content',
      'comparison_tool',
      'checked_on',
      'results',
      'problems',
      'ambiguous',
      'release_status',
    ])
    .distinctOn('sop_version_id')
    .where('sop_version_id', 'in', [...new Set(versionIds)])
    .orderBy('sop_version_id')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
  for (const r of rows) {
    const released = r.release_status === 'ai_reviewed'
    out.set(r.sop_version_id, {
      status: released ? 'ai_reviewed' : 'pending',
      check: {
        checkedOn: day(r.checked_on),
        tool: r.comparison_tool,
        englishContentSha256: r.english_content_sha256,
        results: r.results as Record<SpanishCategory, 'pass' | 'fail'>,
        problems: (r.problems as unknown[]).length,
        ambiguous: r.ambiguous as { item: string; note: string }[],
      },
      title: released ? r.title : null,
      content: released ? (r.content as unknown as Pick<SopContent, 'stages' | 'stopWork'>) : null,
    })
  }
  return out
}

/** The released Spanish item with the English item's id, if any. */
export function spanishItem(release: SpanishRelease | undefined, id: string): SopItem | null {
  if (!release?.content) return null
  for (const s of release.content.stages) for (const i of s.items) if (i.id === id) return i
  return release.content.stopWork.find((i) => i.id === id) ?? null
}
