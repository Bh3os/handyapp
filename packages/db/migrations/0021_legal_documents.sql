-- 0021 Public legal documents as policy versions (TSK-0024; ENT-PolicyVersion, HH-PRIV-04, HH-COM-12, OWN-DEC-72,
-- OWN-DEC-147, OQ-ATTORNEY-PRIVACY).
-- - legal.privacy_notice (/privacy, with the SMS section), legal.sms_terms (/sms-terms) and legal.website_terms
--   (/terms): one version each. The value names the document ID that requests save (privacyNoticeVersion), the draft
--   status and the SHA-256 of the exact wording (@handyhub/domain/legal over the customer catalog), so a page and the
--   version a record pinned can always be matched.
-- - Every version is a draft that no attorney has reviewed: the pages show "Draft - not reviewed by an attorney"
--   (OWN-DEC-72), and production needs the reviewed pages and the owner's documented approval (OQ-ATTORNEY-PRIVACY).
--   The rows are marked proposed: the wording is drafted from the graph, not owner-approved.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('legal.privacy_notice', 1, 'configured',
   '{"documentId": "privacy-notice-1", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-21", "contentSha256": "5ed008ea955d654bcd37008a7ae9e45f009d9d49734ab44f13c1c62003938d18"}',
   true, ARRAY['HH-PRIV-04', 'OWN-DEC-72', 'OWN-DEC-147', 'OQ-ATTORNEY-PRIVACY'], 'migration:0021'),
  ('legal.sms_terms', 1, 'configured',
   '{"documentId": "sms-terms-1", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-21", "contentSha256": "e90bae868d5de8ad9e5ab4c5e92d848099282742953170925bbf253649d62102"}',
   true, ARRAY['HH-COM-12', 'OWN-DEC-147', 'OQ-ATTORNEY-PRIVACY'], 'migration:0021'),
  ('legal.website_terms', 1, 'configured',
   '{"documentId": "website-terms-1", "status": "draft", "attorneyReviewed": false, "preparedOn": "2026-10-21", "contentSha256": "de1b9a77f20c3afd511838688f47b6ff6af97b3d07cdd20ad20344b80dbc94f4"}',
   true, ARRAY['HH-PRIV-04', 'OWN-DEC-72', 'OQ-ATTORNEY-PRIVACY'], 'migration:0021');
