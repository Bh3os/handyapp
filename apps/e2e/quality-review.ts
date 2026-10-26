// A stand-in for a passed Owner's quality review (TSK-0084) in the invoice spec. A real review needs a job awaiting
// quality review, which only the worker's Finished (TSK-0083, not built) produces; the quality-review spec walks the
// real review on a job moved there by its own fixture. The invoice spec shows the refusal first, then, to show what
// issuing does once a review passes, replaces finance.invoice_quality_gate in the spec run's own fresh e2e database
// with one that passes only the one job the spec names (every other job keeps the real review's answer,
// quality.review_gate, migration 0082), and restores the product's function afterwards. A test fixture, never a
// recorded review.
import { createPool } from '@handyhub/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function run(databaseUrl: string, text: string) {
  const pool = createPool(databaseUrl, { max: 1, applicationName: 'e2e-quality-review' })
  try {
    await pool.query(text)
  } finally {
    await pool.end()
  }
}

/** The stand-in gate: 'passed' for this one job only (see the header). */
export async function passQualityReview(databaseUrl: string, jobId: string): Promise<void> {
  if (!UUID.test(jobId)) throw new Error('a job id')
  await run(
    databaseUrl,
    `CREATE OR REPLACE FUNCTION finance.invoice_quality_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
       SELECT CASE WHEN p_job = '${jobId}'::uuid THEN 'passed' ELSE quality.review_gate(p_job) END $$`,
  )
}

/** Restores the product's gate: the real review's answer (migration 0082). */
export async function restoreQualityGate(databaseUrl: string): Promise<void> {
  await run(
    databaseUrl,
    `CREATE OR REPLACE FUNCTION finance.invoice_quality_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
       SELECT quality.review_gate(p_job) $$`,
  )
}

/**
 * The job awaits quality review, as the worker's Finished leaves it (TSK-0083). Finished needs a started job with its
 * whole checklist and photos, which the quality-review spec does not walk: the state alone is set here, with the
 * database's triggers off for this one statement, in the spec run's own fresh e2e database. A test fixture.
 */
export async function awaitQualityReview(
  databaseUrl: string,
  jobId: string,
  options: { workPackagesComplete?: boolean } = {},
): Promise<void> {
  if (!UUID.test(jobId)) throw new Error('a job id')
  // TSK-0092: the closeout spec also needs the work packages complete on their SOP version, as Finished leaves them.
  const packages = options.workPackagesComplete
    ? `UPDATE work.work_packages w
          SET state = 'complete', version = version + 1, sop_pinned_at = coalesce(sop_pinned_at, now()),
              sop_version_id = coalesce(sop_version_id, (SELECT v.id FROM catalog.sop_versions v
                                                          WHERE v.service_id = w.service_id
                                                          ORDER BY v.version DESC LIMIT 1))
        WHERE job_id = '${jobId}';`
    : ''
  await run(
    databaseUrl,
    `BEGIN; SET LOCAL session_replication_role = replica;
     UPDATE work.jobs SET operational_state = 'ready_for_qa', version = version + 1 WHERE id = '${jobId}';
     ${packages} COMMIT;`,
  )
}

/**
 * TSK-0092: 48 hours after the Owner's review passed, as a test fixture of the spec run's own fresh e2e database: the
 * pass is moved 49 hours back (the triggers off for this one statement) and the follow-up's preparation job made due
 * now, so the server's worker prepares the follow-up draft.
 */
export async function followUpDue(databaseUrl: string, jobId: string): Promise<void> {
  if (!UUID.test(jobId)) throw new Error('a job id')
  await run(
    databaseUrl,
    `BEGIN; SET LOCAL session_replication_role = replica;
     UPDATE quality.reviews SET passed_at = now() - interval '49 hours' WHERE job_id = '${jobId}'; COMMIT;
     UPDATE platform.jobs SET run_at = now()
      WHERE automation = 'closeout.follow_up_prepare' AND target_id = '${jobId}' AND state = 'queued';`,
  )
}
