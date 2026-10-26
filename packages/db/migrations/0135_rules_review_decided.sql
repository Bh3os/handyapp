-- 0135 The rules the owner approved as built are decided configuration (TSK-0153; OWN-DEC-192, OWN-DEC-198,
-- ENT-PolicyVersion, RULE-DECIDED-VALUES-ACTIVE).
-- - portal.refresh version 2: the 30-second refresh of an open customer project page, paused while the tab is hidden,
--   is rule F7 of the Rules Review, approved as built (OWN-DEC-192; OWN-DEC-198 "Approve F7"). The value is the one
--   version 1 proposed (migration 0036); only the PROPOSED flag ends. Version 1 stays readable as superseded.
-- - access.grants and access.recovery already left PROPOSED with their version 2 (migration 0119, OWN-DEC-160 and
--   OWN-DEC-198 F5). Every other PROPOSED key stays PROPOSED: no rule of the Rules Review covers it
--   (verification.limits, payment.square_link_hosts, owner_approval.discretionary_credit, and the legal drafts that
--   wait on the attorney, OQ-ATTORNEY-PRIVACY).
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'portal.refresh' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
SELECT 'portal.refresh', max(version) + 1, 'configured', '{"pollSeconds": 30}', false,
       ARRAY['HH-ARC-10', 'OWN-DEC-192', 'OWN-DEC-198'], 'migration:0135',
       'OWN-DEC-192 F7 (OWN-DEC-198): the 30-second refresh is approved as built'
  FROM platform.policy_version WHERE key = 'portal.refresh';
