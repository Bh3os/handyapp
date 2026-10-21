-- 0056 The retention schedule as active configuration and the Owner's deletion-review queue (TSK-0099; HH-PRIV-01,
-- HH-DATA-09, ENT-RetentionReview, FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-142, OWN-DEC-122, OQ-RETENTION-REVIEW).
-- - The schedule's periods are owner decisions (OWN-DEC-70), so each category is seeded active
--   (RULE-DECIDED-VALUES-ACTIVE), citing the decision, the fact and the open CPA and attorney confirmation. The value
--   names what starts the period and can only say that the record then goes to the owner's deletion review: the shapes
--   (apps/server/src/platform/config/keys.ts) accept no automatic deletion, no record without its holds and no period
--   shorter than the decided one (the owner may extend it). Audit records keep retention.audit_log (migration 0055).
-- - privacy.retention_reviews is the deletion-review queue: one entry per record whose period ended, written by the
--   retention job with the hold checks it could run. It is append-only: an entry is never edited or removed (a
--   decision on it is a later, separate record), and nothing here deletes, archives or changes the record itself.
--   An entry keeps the record's reference, never its personal content.
CREATE SCHEMA privacy;
COMMENT ON SCHEMA privacy IS 'Retention reviews (TSK-0099); privacy requests follow (TSK-0100).';

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('retention.requests_not_converted', 1, 'configured',
   '{"years": 2, "after": "request_closed", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056'),
  ('retention.unaccepted_estimates', 1, 'configured',
   '{"years": 2, "after": "estimate_expired_or_closed", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056'),
  ('retention.customer_profiles', 1, 'configured',
   '{"years": 7, "after": "last_completed_service", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056'),
  ('retention.accepted_agreements', 1, 'configured',
   '{"years": 10, "after": "final_job_closeout", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056'),
  ('retention.financial_records', 1, 'configured',
   '{"years": 7, "after": "tax_return_filed_or_tax_paid", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056'),
  ('retention.job_records', 1, 'configured',
   '{"years": 7, "after": "job_closeout", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056'),
  ('retention.safety_records', 1, 'configured',
   '{"years": 10, "after": "closure", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0056');

CREATE TABLE privacy.retention_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                  bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- The schedule category whose period ended (apps/server/src/modules/retention/schedule.ts).
  category             text NOT NULL CHECK (category IN ('requests_not_converted', 'unaccepted_estimates',
                         'customer_profiles', 'accepted_agreements', 'financial_records', 'job_records',
                         'safety_records', 'audit_log')),
  record_type          text NOT NULL CHECK (record_type ~ '^[a-z][a-z0-9_]*$' AND char_length(record_type) <= 60),
  record_id            uuid NOT NULL,
  -- A reference that names the record without its personal content (request reference, estimate number, entry #).
  record_ref           text NOT NULL CHECK (char_length(btrim(record_ref)) BETWEEN 1 AND 160),
  project_id           uuid REFERENCES crm.projects (id),
  -- The configuration version whose period was applied.
  policy_key           text NOT NULL,
  policy_version       integer NOT NULL,
  period_years         integer NOT NULL CHECK (period_years BETWEEN 1 AND 100),
  retention_started_at timestamptz NOT NULL,
  period_ends_at       timestamptz NOT NULL CHECK (period_ends_at > retention_started_at),
  -- Each hold check: {"check": ..., "result": found | none_found | not_applicable | not_recorded, "count": n?}.
  hold_checks          jsonb NOT NULL CHECK (jsonb_typeof(hold_checks) = 'array' AND jsonb_array_length(hold_checks) > 0),
  holds_found          boolean NOT NULL,
  opened_by            text NOT NULL CHECK (char_length(opened_by) BETWEEN 1 AND 100),
  opened_at            timestamptz NOT NULL DEFAULT now(),
  request_id           text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  FOREIGN KEY (policy_key, policy_version) REFERENCES platform.policy_version (key, version),
  UNIQUE (record_type, record_id, policy_key, period_ends_at)
);
CREATE INDEX retention_reviews_record ON privacy.retention_reviews (record_type, record_id);
CREATE INDEX retention_reviews_category ON privacy.retention_reviews (category, period_ends_at, seq);
CREATE TRIGGER retention_reviews_append_only BEFORE UPDATE OR DELETE ON privacy.retention_reviews
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER retention_reviews_no_truncate BEFORE TRUNCATE ON privacy.retention_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
REVOKE UPDATE, DELETE, TRUNCATE ON privacy.retention_reviews FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON privacy.retention_reviews FROM %I', current_user);
END;
$$;
COMMENT ON TABLE privacy.retention_reviews IS
  'The owner''s deletion-review queue (ENT-RetentionReview, OWN-DEC-70): records past their period, never deleted automatically.';
