// A stand-in for the Owner's quality review (TSK-0084), which is not built: migration 0077's
// finance.invoice_quality_gate answers 'quality_review_not_recorded' for every job, so no final invoice can be issued
// in the product today. The invoice spec shows that refusal first, then, to show what issuing does once a review
// passes, replaces the function in the spec run's own fresh e2e database with one that passes only the one job the
// spec names (every other job keeps the product's answer), and restores the product's function afterwards. A test
// fixture, never a recorded review: TSK-0084 replaces the function with the real review's outcome.
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
       SELECT CASE WHEN p_job = '${jobId}'::uuid THEN 'passed' ELSE 'quality_review_not_recorded' END $$`,
  )
}

/** Restores the product's gate: nothing passes until TSK-0084 records real reviews. */
export async function restoreQualityGate(databaseUrl: string): Promise<void> {
  await run(
    databaseUrl,
    `CREATE OR REPLACE FUNCTION finance.invoice_quality_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
       SELECT 'quality_review_not_recorded'::text $$`,
  )
}
