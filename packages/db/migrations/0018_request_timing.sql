-- 0018 Property, timing and estimate-approach settings of the request form (TSK-0028; HH-INT-02, HH-INT-03,
-- HH-INT-17, OWN-DEC-92, OWN-DEC-99, FACT-HOURS, FACT-VISIT-FEE, RULE-DECIDED-VALUES-ACTIVE).
-- - request.window_hours: the hours shown beside Mornings, Afternoons and Evenings. The owner asked for "configured
--   window hours within 8 AM-10 PM" but never gave them, so they are NOT CONFIGURED (OQ-WINDOW-HOURS): the form offers
--   the five windows without hours, and no hours are guessed.
-- - estimate.visit_fee: the decided policy (FACT-VISIT-FEE, OWN-DEC-99), active configuration: estimates online or at
--   the property are free; the form shows the owner's approved wording "Free estimates—online or at your property."
--   (OWN-DEC-86) only while this value says so.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('request.window_hours', 1, 'not_configured', NULL,
   false, ARRAY['HH-INT-02', 'OWN-DEC-92', 'OQ-WINDOW-HOURS'], 'migration:0018'),
  ('estimate.visit_fee', 1, 'configured', '{"policy": "free"}',
   false, ARRAY['FACT-VISIT-FEE', 'OWN-DEC-99', 'OWN-DEC-86'], 'migration:0018');
