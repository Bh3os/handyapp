// Test fixture (TSK-0082): a job's next scope snapshot as an approved change order writes it, for tests of what reads
// the approved scope (packets, acknowledgments, invoices) without the whole publish-and-approve flow. A synthetic change
// order and an approved version are recorded first, directly in the test database with the guards set aside for that
// one transaction (migration 0088 lets a change-order snapshot follow only an approved version); the snapshot itself
// carries whatever lines and totals the test needs. change-orders.test.ts covers the real approval transaction.
import { withTx, type Db } from '@handyhub/db'
import { sql } from 'kysely'

export type SnapshotValues = {
  job_id: string
  version: number
  lines: string
  texts: string
  exclusions: string[]
  selected_options: number[]
  subtotal_cents: string | number
  discount_cents: string | number
  total_cents: string | number
  terms_document_id: string
  terms_sha256: string
  content_sha256: string
}

/** Inserts the snapshot of a synthetic approved change order of the job; returns the change order's number. */
export async function insertChangeOrderSnapshot(db: Db, values: SnapshotValues): Promise<number> {
  return withTx(db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    const job = await tx
      .selectFrom('work.jobs')
      .select(['id', 'project_id'])
      .where('id', '=', values.job_id)
      .executeTakeFirstOrThrow()
    const base = await tx
      .selectFrom('work.job_scope_snapshots')
      .select(['id', 'total_cents'])
      .where('job_id', '=', job.id)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()
    const staff = await tx.selectFrom('identity.staff_users').select('id').limit(1).executeTakeFirstOrThrow()
    const last = await tx
      .selectFrom('work.change_orders')
      .select((eb) => eb.fn.max('number').as('n'))
      .where('project_id', '=', job.project_id)
      .executeTakeFirst()
    const number = (last?.n ?? 0) + 1
    const order = await tx
      .insertInto('work.change_orders')
      .values({ project_id: job.project_id, job_id: job.id, number, origin: 'estimator', created_by: staff.id })
      .returning('id')
      .executeTakeFirstOrThrow()
    const baseTotal = Number(base.total_cents)
    const total = Number(values.total_cents)
    // The version's totals hold against its base; a snapshot with the same total still names a change of both kinds.
    const charges = total > baseTotal ? total - baseTotal : total === baseTotal ? 1 : 0
    const credits = total < baseTotal ? baseTotal - total : total === baseTotal ? 1 : 0
    const now = new Date()
    const version = await tx
      .insertInto('work.change_order_versions')
      .values({
        change_order_id: order.id,
        job_id: job.id,
        project_id: job.project_id,
        version: 1,
        state: 'approved',
        reason: 'Synthetic: a change the customer approved',
        scope: 'Synthetic: the approved change',
        base_snapshot_id: base.id,
        base_total_cents: baseTotal,
        charges_cents: charges,
        credits_cents: credits,
        revised_total_cents: baseTotal + charges - credits,
        drafted_by: staff.id,
        updated_by: staff.id,
        reviewed_by: staff.id,
        reviewed_at: now,
        issued_by: staff.id,
        issued_at: new Date(now.getTime() - 3_600_000),
        content_sha256: 'c'.repeat(64),
        valid_until: new Date(now.getTime() + 7 * 86_400_000),
        decided_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await tx
      .insertInto('work.job_scope_snapshots')
      .values({ ...values, source: 'change_order', change_order_version_id: version.id })
      .execute()
    return number
  })
}
