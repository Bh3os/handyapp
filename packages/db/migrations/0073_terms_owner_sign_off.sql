-- 0073 The owner's sign-off of estimate terms v1.0 (TSK-0144; OWN-DEC-187, HH-EST-13, OWN-DEC-127, ENT-PolicyVersion,
-- RULE-DECIDED-VALUES-ACTIVE, RULE-NO-INVENTED-FACTS).
-- - The owner approved terms v1.0, as written and shown on staging, for real customer approvals: "I approve v1.0 now"
--   (owner answers 2026-10-21 R10-Q2, OWN-DEC-187). This records that sign-off on the terms version: the next version of
--   legal.estimate_terms names the v1.0 document (estimate-terms-1) and the SHA-256 of its exact wording, with status
--   approved and the sign-off as the decision states it (by the owner, the decision, where and when it was given, the
--   owner's words). No staff user is named: the decision is the recorded authorization, as for the other decided
--   values the migrations seed (OWN-DEC-128, OWN-DEC-122). The value equals ESTIMATE_TERMS_V1_RECORD of
--   @handyhub/domain/legal (an integration test keeps them equal).
-- - attorneyReviewed stays false: no attorney has reviewed v1.0. It is in effect without that review because the owner
--   approved it as it is; the clauses left out of it and the next version (cancellation rules, warranty) wait for the
--   attorney (OQ-ATTORNEY-TERMS, docs/review-packets/attorney.md A-02, A-03, A-05). Staging approvals stay marked TEST,
--   and real customer use still waits for the launch phases (OWN-DEC-191) and the privacy review (OQ-ATTORNEY-PRIVACY).
-- - business.mailing_address is not touched: the Owner enters it in Business settings (OWN-DEC-183); its value is
--   never written into the repository.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'legal.estimate_terms' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
  SELECT 'legal.estimate_terms', coalesce(max(version), 0) + 1, 'configured',
         '{"documentId": "estimate-terms-1", "status": "approved", "attorneyReviewed": false, "preparedOn": "2026-10-21", "contentSha256": "c4103d986b8131af92e3733de2d69fefda1a49f57c3665f2faa05b445b8827e3", "ownerSignOff": {"by": "owner", "decisionId": "OWN-DEC-187", "source": "owner answers 2026-10-21 R10-Q2", "signedOn": "2026-10-21", "wording": "I approve v1.0 now"}}',
         false, ARRAY['OWN-DEC-187', 'HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'], 'migration:0073',
         'OWN-DEC-187: the owner approved estimate terms v1.0 for real customer approvals (owner answers 2026-10-21 R10-Q2)'
    FROM platform.policy_version WHERE key = 'legal.estimate_terms';
