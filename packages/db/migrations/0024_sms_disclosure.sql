-- 0024 The SMS opt-in disclosure of the request form as a policy version (TSK-0029; HH-INT-22, HH-INT-18, HH-COM-12,
-- ENT-ConsentPreference, ENT-PolicyVersion, OWN-DEC-147, OQ-ATTORNEY-PRIVACY).
-- - legal.sms_disclosure: the text shown beside the SMS checkbox (SMS_DISCLOSURE of @handyhub/domain/legal). Checking
--   the box records an SMS consent with this document ID as its disclosure version; the server accepts only a
--   published version, so a consent record never names a text that was never shown.
-- - A draft that no attorney has reviewed (OQ-ATTORNEY-PRIVACY); the row is marked proposed because its label and
--   frequency sentences are drafted, not owner-approved. The other sentences are those of the SMS terms (sms-terms-1).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('legal.sms_disclosure', 1, 'configured',
   '{"documentId": "sms-disclosure-1", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-21", "contentSha256": "56dab52f3acdc48150550556dea7a3551e545213f137f22b7c6cdfca59edac2d"}',
   true, ARRAY['HH-INT-22', 'HH-COM-12', 'OWN-DEC-147', 'OQ-ATTORNEY-PRIVACY'], 'migration:0024');
