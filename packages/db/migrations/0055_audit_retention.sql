-- 0055 Audit-log retention as active configuration (TSK-0098; HH-SEC-06, HH-STAFF-08, ENT-AuditEvent,
-- FACT-RETENTION-SCHEDULE, OWN-DEC-142, OWN-DEC-70, OWN-DEC-122).
-- The owner decided the period (OWN-DEC-142: "7 years"), so it is seeded active (RULE-DECIDED-VALUES-ACTIVE). After
-- the period an audit record goes to the owner's deletion-review queue; it is never deleted automatically, and a
-- record under a case or legal hold is kept until the hold ends (OWN-DEC-70). The value can only say so: the shape
-- accepts no automatic deletion (apps/server/src/platform/config/keys.ts). The audit table stays append-only
-- (migration 0002): nothing here deletes or changes a row. The review entries themselves are the retention job of
-- TSK-0099; the periods still await CPA and attorney confirmation (OQ-RETENTION-REVIEW), which the audit screen says.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('retention.audit_log', 1, 'configured',
   '{"years": 7, "afterPeriod": "owner_deletion_review", "automaticDeletion": false, "holdsKeepRecords": true}',
   false, ARRAY['OWN-DEC-142', 'FACT-RETENTION-SCHEDULE', 'OWN-DEC-70', 'OQ-RETENTION-REVIEW'], 'migration:0055');
