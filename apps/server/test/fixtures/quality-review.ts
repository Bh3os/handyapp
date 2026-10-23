// A stand-in outcome of the Owner's quality review (TSK-0084) for the invoice and privacy tests. A real review needs a
// job awaiting quality review, which only the worker's Finished (TSK-0083, not built) produces; the quality-review
// tests walk the real review (quality-review.test.ts). The tests of what issuing does once a review passes (the
// number, the deposit credit exactly once, immutability, the PDF and the notice, the ledger of an issued invoice)
// replace finance.invoice_quality_gate, in their own throwaway test database only, with one that reads this fixture's
// table: a synthetic outcome per job the test names, and the real review's answer (quality.review_gate, migration
// 0082) for every other job. A test fixture, never a recorded review: no real or staging database ever has it.
import type { Db } from '@handyhub/db'
import { sql } from 'kysely'

/** Installs the stand-in gate in this test database (idempotent). */
export async function standInQualityReview(db: Db): Promise<void> {
  await sql`CREATE SCHEMA IF NOT EXISTS test_fixture`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS test_fixture.quality_reviews (
    job_id  uuid PRIMARY KEY,
    outcome text NOT NULL CHECK (outcome IN ('passed', 'owner_may_issue', 'blocked')))`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION finance.invoice_quality_gate(p_job uuid) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT outcome FROM test_fixture.quality_reviews WHERE job_id = p_job),
                    quality.review_gate(p_job))
  $$`.execute(db)
}

/** Records the synthetic review outcome of one job (the stand-in must be installed). */
export async function reviewOutcome(
  db: Db,
  jobId: string,
  outcome: 'passed' | 'owner_may_issue' | 'blocked' = 'passed',
): Promise<void> {
  await sql`INSERT INTO test_fixture.quality_reviews (job_id, outcome) VALUES (${jobId}, ${outcome})
            ON CONFLICT (job_id) DO UPDATE SET outcome = EXCLUDED.outcome`.execute(db)
}
