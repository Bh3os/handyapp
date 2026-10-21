-- 0015 Coverage rules (TSK-0022; HH-CUS-03, HH-INT-16, ENT-CoverageRule, FACT-SERVICE-AREA, OWN-DEC-37, OWN-DEC-88).
-- - coverage.area (policy_version): the decided service area, eleven whole counties (OWN-DEC-37), active configuration
--   (OWN-DEC-122). It names counties, never ZIP codes.
-- - coverage_rule_sets / coverage_rules: the ZIP rules the public checker, staff qualification and scheduling share
--   (ENT-CoverageRule). A rule set is derived from the official Census ZCTA-to-county relationship file and the
--   coverage.area version (OWN-DEC-37: never typed by hand or guessed), imported as 'proposed', and used only once the
--   owner has confirmed it (OQ-SERVICE-AREA-ZIPS) and it is 'active'. This migration seeds no ZIP: until a rule set is
--   active every ZIP is the unknown outcome, and no outcome ever blocks a request.
-- - Each property and request records the outcome and the rule set it came from (null: no active rule set).

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('coverage.area', 1, 'configured',
   '{"counties": [
      {"state": "KY", "county": "Jefferson"}, {"state": "KY", "county": "Oldham"}, {"state": "KY", "county": "Bullitt"},
      {"state": "KY", "county": "Shelby"}, {"state": "KY", "county": "Meade"},
      {"state": "IN", "county": "Clark"}, {"state": "IN", "county": "Floyd"}, {"state": "IN", "county": "Harrison"},
      {"state": "IN", "county": "Scott"}, {"state": "IN", "county": "Washington"}, {"state": "IN", "county": "Jefferson"}
    ]}',
   false, ARRAY['FACT-SERVICE-AREA', 'OWN-DEC-37', 'OWN-DEC-122'], 'migration:0015');

CREATE TABLE platform.coverage_rule_sets (
  version          integer PRIMARY KEY CHECK (version >= 1),
  status           text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'superseded')),
  -- Where the ZIP rules come from, for example the Census 2020 ZCTA-to-county relationship file, and its SHA-256.
  source           text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 200),
  source_sha256    text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  -- The coverage.area version the rules were derived from.
  area_version     integer NOT NULL CHECK (area_version >= 1),
  created_by       text NOT NULL CHECK (created_by <> ''),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- The owner's confirmation (OQ-SERVICE-AREA-ZIPS): who recorded it and the decision node it cites.
  approved_by      text CHECK (approved_by <> ''),
  approval_sources text[],
  approved_at      timestamptz,
  CHECK ((status = 'proposed') = (approved_by IS NULL)),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK ((approved_by IS NULL) = (approval_sources IS NULL)),
  CHECK (approval_sources IS NULL OR cardinality(approval_sources) >= 1)
);
COMMENT ON TABLE platform.coverage_rule_sets IS
  'Versioned ZIP coverage rules (ENT-CoverageRule); only the one active set answers the checker and staff.';
CREATE UNIQUE INDEX coverage_rule_sets_one_active ON platform.coverage_rule_sets (status) WHERE status = 'active';

-- A rule set changes only forward: proposed -> active (with the approval), active -> superseded. Never deleted.
CREATE FUNCTION platform.coverage_rule_set_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'coverage rule sets are kept: add a new version instead of deleting'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'proposed' AND NEW.status = 'active'
     AND (to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approval_sources', 'approved_at'])
         = (to_jsonb(OLD) - ARRAY['status', 'approved_by', 'approval_sources', 'approved_at']) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'superseded' AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'coverage rule sets change only proposed -> active -> superseded'
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER coverage_rule_set_transition BEFORE UPDATE OR DELETE ON platform.coverage_rule_sets
  FOR EACH ROW EXECUTE FUNCTION platform.coverage_rule_set_transition();

CREATE TABLE platform.coverage_rules (
  rule_set    integer NOT NULL REFERENCES platform.coverage_rule_sets (version),
  zip5        text NOT NULL CHECK (zip5 ~ '^[0-9]{5}$'),
  -- in_coverage: the ZIP lies inside the area; boundary: partly inside (the address is checked); out_of_coverage: none.
  disposition text NOT NULL CHECK (disposition IN ('in_coverage', 'boundary', 'out_of_coverage')),
  -- The counties the ZIP touches inside the area, as 'KY:Jefferson' (empty when out_of_coverage).
  counties    text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (rule_set, zip5),
  CHECK ((disposition = 'out_of_coverage') = (cardinality(counties) = 0))
);
COMMENT ON TABLE platform.coverage_rules IS 'One disposition per ZIP within a rule set; a ZIP not listed is unknown.';
CREATE TRIGGER coverage_rules_append_only BEFORE UPDATE OR DELETE ON platform.coverage_rules
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- The rule set each stored outcome came from (null: no active rule set, so the outcome is unknown).
ALTER TABLE crm.properties ADD COLUMN coverage_rule_set integer REFERENCES platform.coverage_rule_sets (version);
ALTER TABLE intake.requests ADD COLUMN coverage_rule_set integer REFERENCES platform.coverage_rule_sets (version);
ALTER TABLE crm.properties
  ADD CONSTRAINT properties_coverage_pinned CHECK (coverage_result = 'unknown' OR coverage_rule_set IS NOT NULL);
ALTER TABLE intake.requests
  ADD CONSTRAINT requests_coverage_pinned CHECK (coverage_result = 'unknown' OR coverage_rule_set IS NOT NULL);
