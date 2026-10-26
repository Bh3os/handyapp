-- 0119 Permanent customer dashboard, Project History and verified project claiming (TSK-0124; HH-ID-14, HH-ID-03,
-- HH-ID-06, HH-ID-09, ENT-CustomerIdentityLink, ENT-ProjectAccessGrant, OWN-DEC-160, OWN-DEC-198, RULE-SERVER-AUTHZ).
-- The server decides who may claim what (apps/server/src/modules/accounts/claims.ts); this migration keeps the records
-- true whatever path writes.
-- - customer_identity_links.evidence 'claim_code': a signed-in account customer claimed a guest project with a one-time
--   code sent to that project's request contact, to the exact email or phone a code had already verified for it
--   (OWN-DEC-160 "securely associate existing guest projects with their verified account"; never on an unverified
--   name, phone or email match, HH-ID-03). The link's existing guard still holds: the contact belongs to the project's
--   customer and the request to the project; what it names never changes; a revocation is final.
-- - access.grants version 2: the 24-hour guest link the owner decided (OWN-DEC-160, OWN-DEC-198 F5), no longer PROPOSED.
-- - access.recovery version 2: the reissue limit as built, 3 per project per day, decided with its secure recovery path
--   (OWN-DEC-198 F5, FACT-SESSION-TIMINGS), no longer PROPOSED.

ALTER TABLE identity.customer_identity_links DROP CONSTRAINT customer_identity_links_evidence_check;
ALTER TABLE identity.customer_identity_links ADD CONSTRAINT customer_identity_links_evidence_check
  CHECK (evidence IN ('receipt_code', 'project_link_code', 'claim_code'));
COMMENT ON COLUMN identity.customer_identity_links.evidence IS
  'The one-time code that proved the link: on the receipt, in a guest-link session, or a claim from the account (TSK-0124).';

UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'access.grants' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'access.grants', max(version) + 1, 'configured', '{"linkHours": 24}', false,
       ARRAY['HH-ID-06', 'FACT-SESSION-TIMINGS', 'OWN-DEC-160', 'OWN-DEC-198'], 'migration:0119',
       'OWN-DEC-160, OWN-DEC-198 F5: guest project links last 24 hours'
  FROM platform.policy_version WHERE key = 'access.grants';

UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'access.recovery' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'access.recovery', max(version) + 1, 'configured', '{"maxReissuesPerProjectPerDay": 3}', false,
       ARRAY['HH-ID-09', 'FACT-SESSION-TIMINGS', 'OWN-DEC-198'], 'migration:0119',
       'OWN-DEC-198 F5: up to 3 new links per project per day, with a secure recovery path at the limit'
  FROM platform.policy_version WHERE key = 'access.recovery';
