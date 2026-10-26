-- 0108 The provisional retention defaults for staff accounts, consent records, settings and content history, technical
-- logs and expired sessions and access links (TSK-0138; HH-PRIV-01, HH-DATA-09, HH-STAFF-02, ENT-RetentionReview,
-- FACT-RETENTION-SCHEDULE, OWN-DEC-177, OWN-DEC-70, OWN-DEC-122, OQ-RETENTION-REVIEW, OQ-RETENTION-DEFAULTS-DETAILS).
-- 1. The owner decided the periods (OWN-DEC-177: "Implement these settings as configurable policies, not hardcoded
--    values"), so each is seeded active (RULE-DECIDED-VALUES-ACTIVE), citing the decision, the fact and the open CPA and
--    attorney confirmation. The values can only say what the decision says: after the period a record goes to the
--    owner's deletion review, never to an automatic deletion ("Do not activate irreversible automatic deletion until
--    retention requirements have been verified and approved"), and holds keep records. The shapes are in
--    apps/server/src/platform/config/keys.ts:
--    - retention.staff_accounts: 7 years after departure, a review threshold;
--    - retention.consent_records: 5 years after the last relevant use, a review threshold;
--    - retention.settings_history: while retained records depend on it, immutable while referenced; unreferenced history
--      goes to the owner's deletion review;
--    - retention.technical_logs: ordinary application and diagnostic logs 90 days; security-incident evidence longer
--      when justified. The software keeps no log in this database (the logs are the server's output lines kept by the
--      host), so no review entry is ever opened for them;
--    - retention.sessions_and_links: sessions and access links expire at once under their security settings; their
--      minimal metadata up to 30 days after they ended.
-- 2. privacy.retention_reviews accepts the new categories. A period is whole years or whole calendar days (exactly one
--    of the two), and an entry may stand for a batch of rows (record_count, PROPOSED: the expired sessions and links of
--    one kind and one calendar month in the business time zone make one entry, so the owner's queue is not a row per
--    sign-in). The table stays append-only: no entry is changed by this migration.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('retention.staff_accounts', 1, 'configured',
   '{"years": 7, "after": "staff_departure", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-177', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0108'),
  ('retention.consent_records', 1, 'configured',
   '{"years": 5, "after": "last_relevant_use", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-177', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0108'),
  ('retention.settings_history', 1, 'configured',
   '{"keep": "while_retained_records_depend_on_it", "immutableWhileReferenced": true, "unreferencedAfter": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-177', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0108'),
  ('retention.technical_logs', 1, 'configured',
   '{"days": 90, "after": "logged", "securityEvidenceKeptLonger": true}',
   false, ARRAY['OWN-DEC-177', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0108'),
  ('retention.sessions_and_links', 1, 'configured',
   '{"days": 30, "after": "expired_or_ended", "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-177', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'], 'migration:0108');

ALTER TABLE privacy.retention_reviews DROP CONSTRAINT retention_reviews_category_check;
ALTER TABLE privacy.retention_reviews ADD CONSTRAINT retention_reviews_category_check CHECK (category IN (
  'requests_not_converted', 'unaccepted_estimates', 'customer_profiles', 'accepted_agreements', 'financial_records',
  'job_records', 'safety_records', 'staff_accounts', 'consent_records', 'sessions_and_links', 'audit_log'));
ALTER TABLE privacy.retention_reviews ALTER COLUMN period_years DROP NOT NULL;
ALTER TABLE privacy.retention_reviews ADD COLUMN period_days integer CHECK (period_days BETWEEN 1 AND 366);
ALTER TABLE privacy.retention_reviews ADD CONSTRAINT retention_reviews_one_period
  CHECK ((period_years IS NULL) <> (period_days IS NULL));
-- The rows a batch entry stands for; null for an entry about one record.
ALTER TABLE privacy.retention_reviews ADD COLUMN record_count integer CHECK (record_count >= 1);
COMMENT ON COLUMN privacy.retention_reviews.record_count IS
  'Rows a batch entry stands for (TSK-0138: expired sessions and links of one kind and month); null for one record.';
