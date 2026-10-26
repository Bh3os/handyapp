-- 0126 The A2P 10DLC consent texts in the owner's wording (TSK-0133; OWN-DEC-190, OWN-DEC-178, HH-INT-22, HH-COM-12,
-- ENT-PolicyVersion, ENT-ConsentPreference, OQ-ATTORNEY-PRIVACY, OQ-10DLC-PACKAGE-DETAILS).
-- - legal.sms_disclosure version 2 (sms-disclosure-2): the request form's SMS opt-in is opt-in point A of OWN-DEC-190,
--   the label and the disclosure beside it word for word, with the support contact HH-INT-22 asks for (PROPOSED) and
--   links to the Privacy Policy and the SMS Terms (SMS_DISCLOSURE of @handyhub/domain/legal). Version 1 stays a
--   published version, so consent records that name sms-disclosure-1 still name a text that was shown.
-- - legal.sms_terms version 2 (sms-terms-2): the SMS Terms with the real message types (the customer messages the
--   registry may send by text, the three routine reminders now automatic) and the receipt's separate consent to a
--   one-time verification code (opt-in point B). Its new sentences are PROPOSED.
-- - Both stay drafts no attorney has reviewed (OQ-ATTORNEY-PRIVACY). Nothing here sends a text: sms.live_delivery is
--   unchanged (off until the registration is approved, OWN-DEC-190).
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'legal.sms_disclosure' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'legal.sms_disclosure', max(version) + 1, 'configured',
   '{"documentId": "sms-disclosure-2", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-26", "contentSha256": "e97e5c3a0259a394e76fb493667bf9616c3569065ac7e4280e1f987edc1018a5"}',
   true, ARRAY['OWN-DEC-190', 'HH-INT-22', 'HH-COM-12', 'OQ-ATTORNEY-PRIVACY', 'OQ-10DLC-PACKAGE-DETAILS'],
   'migration:0126', 'TSK-0133: the request form''s SMS opt-in in the owner''s wording (OWN-DEC-190 opt-in point A)'
FROM platform.policy_version WHERE key = 'legal.sms_disclosure';

UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'legal.sms_terms' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'legal.sms_terms', max(version) + 1, 'configured',
   '{"documentId": "sms-terms-2", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-26", "contentSha256": "696005c75e1f90739d1e346438dcd883f47aa05e8ae028c808194f3ec6dcc6ad"}',
   true, ARRAY['HH-COM-12', 'OWN-DEC-190', 'OWN-DEC-178', 'FACT-AUTOMATIC-MESSAGES', 'OQ-ATTORNEY-PRIVACY', 'OQ-10DLC-PACKAGE-DETAILS'],
   'migration:0126', 'TSK-0133: the SMS Terms list the real message types and both opt-in points'
FROM platform.policy_version WHERE key = 'legal.sms_terms';
