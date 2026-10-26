-- 0111 Phone verification opt-in on the receipt (TSK-0134; OWN-DEC-178, OWN-DEC-190, HH-INT-13, HH-INT-22, HH-COM-05,
-- HH-COM-12, ENT-ConsentPreference, ENT-PolicyVersion, OQ-ATTORNEY-PRIVACY).
-- A guest whose request has no current SMS opt-in can agree on the receipt to one-time verification codes by text:
-- - consent_records gains the purpose sms_verification (texts carrying a verification code, nothing else) and the
--   source receipt. It is separate from the SMS opt-in (transactional_sms) and from marketing: it never permits another
--   text and is never read as either of them. STOP withdraws it with the SMS opt-in (TSK-0048).
-- - A receipt consent names its request in its evidence (requestId, with the receipt capability and the HTTP request
--   that recorded it), so the receipt reads its own answer and never another request's consent for the same number
--   (HH-ID-03). It applies to the number it was given for only; a corrected number needs its own consent.
-- - legal.sms_verification_disclosure: the checkbox label and the disclosure beside it (SMS_VERIFICATION_DISCLOSURE of
--   @handyhub/domain/legal), the owner's wording of OWN-DEC-190 opt-in point B, recorded with the SHA-256 of its exact
--   content. The server accepts only a published version as the consent's disclosure version. A draft until the
--   attorney review (OQ-ATTORNEY-PRIVACY); not proposed, since the wording is the owner's.
ALTER TABLE platform.consent_records DROP CONSTRAINT consent_records_purpose_check;
ALTER TABLE platform.consent_records
  ADD CONSTRAINT consent_records_purpose_check
    CHECK (purpose IN ('service_communication', 'transactional_sms', 'marketing', 'sms_verification'));
ALTER TABLE platform.consent_records DROP CONSTRAINT consent_records_source_check;
ALTER TABLE platform.consent_records
  ADD CONSTRAINT consent_records_source_check
    CHECK (source IN ('request_form', 'receipt', 'portal', 'sms_keyword', 'provider_suppression', 'staff_recorded'));
ALTER TABLE platform.consent_records
  ADD CONSTRAINT consent_records_sms_verification_channel CHECK (purpose <> 'sms_verification' OR channel = 'sms'),
  -- An agreement on the receipt always names the disclosure it was given under.
  ADD CONSTRAINT consent_records_receipt_disclosure
    CHECK (source <> 'receipt' OR NOT granted OR (disclosure_version IS NOT NULL AND evidence ? 'requestId'));

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('legal.sms_verification_disclosure', 1, 'configured',
   '{"documentId": "sms-verification-disclosure-1", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-26", "contentSha256": "5abf6a2fbb02ba1d6b87cd1434f794b9d47a98662a02a9a39d771698f30b1686"}',
   false, ARRAY['OWN-DEC-178', 'OWN-DEC-190', 'HH-INT-13', 'HH-COM-12', 'OQ-ATTORNEY-PRIVACY'], 'migration:0111');
