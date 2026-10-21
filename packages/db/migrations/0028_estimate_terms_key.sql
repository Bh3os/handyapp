-- 0028 The estimate terms as a configuration key, NOT CONFIGURED until written (TSK-0053; HH-EST-01, HH-EST-05,
-- HH-EST-13, OWN-DEC-127, ENT-PolicyVersion, RULE-NO-INVENTED-FACTS).
-- - Every published estimate version shows the estimate terms version it carries (HH-EST-01, HH-EST-13). The terms
--   v1.0 document itself, its wording and its content hash are written with the customer estimate view (TSK-0056); no
--   wording exists in the software yet, so the key is NOT CONFIGURED and the staff builder's publish readiness names it
--   as the reason a version cannot be published. A draft can always be saved (HH-EST-05).
-- - TSK-0056 records the v1.0 document as the next version of this key (same shape as the other legal documents).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('legal.estimate_terms', 1, 'not_configured', NULL,
   false, ARRAY['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'], 'migration:0028');
