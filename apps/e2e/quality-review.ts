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
