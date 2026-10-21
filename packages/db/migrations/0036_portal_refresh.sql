-- 0036 Customer project page refresh (TSK-0038; HH-ARC-10, HH-PORT-06, OWN-DEC-59, RULE-DECIDED-VALUES-ACTIVE).
-- An open customer project page refreshes itself from the server at a modest interval and pauses while the browser
-- tab is hidden. HH-ARC-10 asks for "30-60 seconds by default (a configured value)"; OWN-DEC-59 keeps the guide's
-- engineering defaults configurable. No owner decision names the number, so 30 seconds is PROPOSED (proposed = true).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('portal.refresh', 1, 'configured', '{"pollSeconds": 30}', true, ARRAY['HH-ARC-10', 'OWN-DEC-59'],
   'migration:0036');
