-- 0034 Access recovery: the neutral reissue of a project access link (TSK-0035; HH-ID-09, HH-ID-06, HH-ID-04,
-- HH-ID-03, HH-INT-11, ENT-ProjectAccessGrant "the customer requests reissue", OWN-DEC-97 "Expired links offer a safe
-- way to request new access").
-- - A reissued grant is a new row (issued_reason 'reissue') for the same one project and its contact on file; the
--   older grants keep their own expiry and revocation, and nothing about any other project changes. Its link goes only
--   to the contact on file (the automatic message project.access_link, triggered by project.access_requested), never
--   to an address the visitor typed.
-- - Reissues per project are bounded by access.recovery. The owner has not set a number, so the value is PROPOSED
--   (proposed = true) until the owner confirms it (OQ-ACCESS-RECOVERY). The count is the grants issued for reissue in
--   the last 24 hours, so no further table is needed.
ALTER TABLE identity.project_access_grants DROP CONSTRAINT project_access_grants_issued_reason_check;
ALTER TABLE identity.project_access_grants
  ADD CONSTRAINT project_access_grants_issued_reason_check
  CHECK (issued_reason IN ('submission', 'contact_change', 'reissue'));
CREATE INDEX project_access_grants_reissue ON identity.project_access_grants (project_id, created_at DESC)
  WHERE issued_reason = 'reissue';

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('access.recovery', 1, 'configured', '{"maxReissuesPerProjectPerDay": 3}', true,
   ARRAY['HH-ID-09', 'HH-ID-06', 'HH-INT-11', 'ENT-ProjectAccessGrant'], 'migration:0034');
