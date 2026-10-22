-- 0067 Service-area ZIP dataset and the SERVED / EDGE / OUTSIDE / UNKNOWN coverage (TSK-0127; HH-CUS-03, HH-CUS-04,
-- ENT-CoverageRule, FACT-SERVICE-AREA, OWN-DEC-179, OWN-DEC-37, OWN-DEC-88, OQ-READINGS-2026-10-21 item 7).
-- - coverage_zip_datasets / coverage_zip_entries: the owner's candidate ZIP dataset of OWN-DEC-179 as versioned policy
--   data, never edited: each ZIP once, with its category (standard, po_box, unique; null where the dataset names
--   none, as in its multi-county tables) and every service county it lists. Version 1 is seeded here exactly as the
--   owner supplied it. The import recounts it against the counts the owner states (169 unique ZIP codes; 146 tied to
--   one county: 94 Standard, 33 PO Box, 19 Unique; 23 tied to several: 7 in Kentucky, 16 in Indiana) and refuses
--   the migration with every discrepancy named rather than filling anything in (OWN-DEC-179 rule 2).
-- - coverage_rule_sets gain the dataset they use and their verification: 'source_file' (rules derived from the Census
--   ZCTA-to-county file, TSK-0022) or 'not_configured' (no geographic verification source: the dataset alone).
-- - coverage_rules gain the ZIP's category and the reason of its outcome, and may be 'unknown': a PO Box or Unique
--   ZIP is a mailing ZIP and never proves that a property is covered (rule 8), which the database enforces.
-- - The rule set derived from dataset v1 is activated here under the owner's authorization (OWN-DEC-179: "activate
--   ... in private staging without additional Owner approval"; no approval queue for individual ZIPs). PROPOSED
--   reading (item 7) while the verification source is NOT CONFIGURED: a Standard ZIP tied to one service county is
--   SERVED (in_coverage), a ZIP tied to several is EDGE (boundary), a PO Box or Unique ZIP is UNKNOWN; a ZIP not in
--   the dataset stays UNKNOWN, never refused (rule 13). Production follows the existing release authorization.
-- - coverage.verification_source: NOT CONFIGURED. No authoritative source is available to this build (no Census
--   relationship file, no address-validation provider returning a county); `coverage import <file>` verifies the
--   dataset once the Census file is supplied and reports every discrepancy.
-- - Requests and properties record the reason beside the outcome and rule set (null: recorded before 0067).
-- - Two audit events record the import and the activation.
-- - Final owner amendments 2026-10-22: a ZIP-only outcome is preliminary screening, never address verification.
--   crm.property_county_verifications records staff's verification of the complete property address and its county,
--   per address version (append-only: a correction is a new row); in_area says whether the county is one of
--   coverage.area at that time. A visit becomes confirmed only while the property's current address version has a
--   verification whose county is in the area: the server names the unmet check (preconditions.ts) and this database
--   refuses the confirmation itself and records the verification on the visit (county_verification_id). No role,
--   flag or AI skips it. A verified county outside the area needs the Owner's exception (OWN-DEC-167, TSK-0126).

CREATE TABLE platform.coverage_zip_datasets (
  version        integer PRIMARY KEY CHECK (version >= 1),
  -- Where the dataset comes from (the owner decision and answer) and the decision nodes it cites.
  source         text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 200),
  source_ids     text[] NOT NULL CHECK (cardinality(source_ids) >= 1),
  -- The counts the source states, checked against the recount when the dataset is imported.
  stated_counts  jsonb NOT NULL CHECK (jsonb_typeof(stated_counts) = 'object'),
  -- SHA-256 of the canonical text (one line per ZIP in ZIP order: zip|category|county+county; @handyhub/domain).
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by     text NOT NULL CHECK (created_by <> ''),
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE platform.coverage_zip_datasets IS
  'Versioned candidate ZIP datasets of the service area (OWN-DEC-179); a new version is added, never an edit.';

CREATE TABLE platform.coverage_zip_entries (
  dataset  integer NOT NULL REFERENCES platform.coverage_zip_datasets (version),
  zip5     text NOT NULL CHECK (zip5 ~ '^[0-9]{5}$'),
  category text CHECK (category IN ('standard', 'po_box', 'unique')),
  -- Every service county the dataset lists for the ZIP, as 'KY:Jefferson', in the dataset's order.
  counties text[] NOT NULL CHECK (cardinality(counties) >= 1),
  PRIMARY KEY (dataset, zip5)
);
COMMENT ON TABLE platform.coverage_zip_entries IS 'One ZIP of a candidate dataset with its category and counties.';

CREATE TRIGGER coverage_zip_datasets_append_only BEFORE UPDATE OR DELETE ON platform.coverage_zip_datasets
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER coverage_zip_entries_append_only BEFORE UPDATE OR DELETE ON platform.coverage_zip_entries
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

ALTER TABLE platform.coverage_rule_sets
  ADD COLUMN dataset_version integer REFERENCES platform.coverage_zip_datasets (version),
  ADD COLUMN verification text NOT NULL DEFAULT 'source_file' CHECK (verification IN ('source_file', 'not_configured')),
  ADD CONSTRAINT coverage_rule_sets_dataset_when_unverified
    CHECK (verification = 'source_file' OR dataset_version IS NOT NULL);

ALTER TABLE platform.coverage_rules
  ADD COLUMN zip_category text CHECK (zip_category IN ('standard', 'po_box', 'unique')),
  ADD COLUMN reason text CHECK (reason IN ('dataset_one_county', 'dataset_several_counties', 'mailing_zip',
    'source_inside', 'source_partly_inside', 'source_outside', 'source_missing')),
  DROP CONSTRAINT coverage_rules_disposition_check,
  ADD CONSTRAINT coverage_rules_disposition_check
    CHECK (disposition IN ('in_coverage', 'boundary', 'out_of_coverage', 'unknown')),
  DROP CONSTRAINT coverage_rules_check,
  -- In coverage or on the boundary names the counties inside the area; out of coverage names none.
  ADD CONSTRAINT coverage_rules_counties_check CHECK (CASE disposition
    WHEN 'out_of_coverage' THEN cardinality(counties) = 0
    WHEN 'unknown' THEN true
    ELSE cardinality(counties) > 0 END),
  -- OWN-DEC-179 rule 8: a mailing ZIP never proves coverage.
  ADD CONSTRAINT coverage_rules_mailing_zip_unknown
    CHECK (zip_category IS NULL OR zip_category = 'standard' OR (disposition = 'unknown' AND reason = 'mailing_zip'));

ALTER TABLE crm.properties ADD COLUMN coverage_reason text CHECK (coverage_reason IN ('dataset_one_county',
  'dataset_several_counties', 'mailing_zip', 'source_inside', 'source_partly_inside', 'source_outside',
  'source_missing', 'not_listed', 'not_configured', 'lookup_failed'));
ALTER TABLE intake.requests ADD COLUMN coverage_reason text CHECK (coverage_reason IN ('dataset_one_county',
  'dataset_several_counties', 'mailing_zip', 'source_inside', 'source_partly_inside', 'source_outside',
  'source_missing', 'not_listed', 'not_configured', 'lookup_failed'));

INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('coverage.verification_source', 1, 'not_configured', NULL, false,
   ARRAY['OWN-DEC-179', 'OWN-DEC-37', 'TSK-0127'], 'migration:0067');

-- Dataset v1, exactly as OWN-DEC-179 lists it (owner answers 2026-10-21 R8-Q2), section by section.
CREATE TEMPORARY TABLE zip_dataset_v1 (zip5 text, category text, counties text[]) ON COMMIT DROP;
INSERT INTO zip_dataset_v1 (zip5, category, counties) VALUES
  -- Jefferson County, KY: Standard (31)
  ('40041', 'standard', ARRAY['KY:Jefferson']),
  ('40118', 'standard', ARRAY['KY:Jefferson']),
  ('40202', 'standard', ARRAY['KY:Jefferson']),
  ('40203', 'standard', ARRAY['KY:Jefferson']),
  ('40204', 'standard', ARRAY['KY:Jefferson']),
  ('40205', 'standard', ARRAY['KY:Jefferson']),
  ('40206', 'standard', ARRAY['KY:Jefferson']),
  ('40207', 'standard', ARRAY['KY:Jefferson']),
  ('40208', 'standard', ARRAY['KY:Jefferson']),
  ('40209', 'standard', ARRAY['KY:Jefferson']),
  ('40210', 'standard', ARRAY['KY:Jefferson']),
  ('40211', 'standard', ARRAY['KY:Jefferson']),
  ('40212', 'standard', ARRAY['KY:Jefferson']),
  ('40213', 'standard', ARRAY['KY:Jefferson']),
  ('40214', 'standard', ARRAY['KY:Jefferson']),
  ('40215', 'standard', ARRAY['KY:Jefferson']),
  ('40216', 'standard', ARRAY['KY:Jefferson']),
  ('40217', 'standard', ARRAY['KY:Jefferson']),
  ('40218', 'standard', ARRAY['KY:Jefferson']),
  ('40219', 'standard', ARRAY['KY:Jefferson']),
  ('40220', 'standard', ARRAY['KY:Jefferson']),
  ('40222', 'standard', ARRAY['KY:Jefferson']),
  ('40223', 'standard', ARRAY['KY:Jefferson']),
  ('40228', 'standard', ARRAY['KY:Jefferson']),
  ('40242', 'standard', ARRAY['KY:Jefferson']),
  ('40243', 'standard', ARRAY['KY:Jefferson']),
  ('40258', 'standard', ARRAY['KY:Jefferson']),
  ('40272', 'standard', ARRAY['KY:Jefferson']),
  ('40291', 'standard', ARRAY['KY:Jefferson']),
  ('40293', 'standard', ARRAY['KY:Jefferson']),
  ('40299', 'standard', ARRAY['KY:Jefferson']),
  -- Jefferson County, KY: PO Box (25)
  ('40018', 'po_box', ARRAY['KY:Jefferson']),
  ('40025', 'po_box', ARRAY['KY:Jefferson']),
  ('40027', 'po_box', ARRAY['KY:Jefferson']),
  ('40201', 'po_box', ARRAY['KY:Jefferson']),
  ('40221', 'po_box', ARRAY['KY:Jefferson']),
  ('40224', 'po_box', ARRAY['KY:Jefferson']),
  ('40231', 'po_box', ARRAY['KY:Jefferson']),
  ('40232', 'po_box', ARRAY['KY:Jefferson']),
  ('40233', 'po_box', ARRAY['KY:Jefferson']),
  ('40250', 'po_box', ARRAY['KY:Jefferson']),
  ('40251', 'po_box', ARRAY['KY:Jefferson']),
  ('40252', 'po_box', ARRAY['KY:Jefferson']),
  ('40253', 'po_box', ARRAY['KY:Jefferson']),
  ('40255', 'po_box', ARRAY['KY:Jefferson']),
  ('40256', 'po_box', ARRAY['KY:Jefferson']),
  ('40257', 'po_box', ARRAY['KY:Jefferson']),
  ('40259', 'po_box', ARRAY['KY:Jefferson']),
  ('40261', 'po_box', ARRAY['KY:Jefferson']),
  ('40268', 'po_box', ARRAY['KY:Jefferson']),
  ('40269', 'po_box', ARRAY['KY:Jefferson']),
  ('40270', 'po_box', ARRAY['KY:Jefferson']),
  ('40285', 'po_box', ARRAY['KY:Jefferson']),
  ('40290', 'po_box', ARRAY['KY:Jefferson']),
  ('40295', 'po_box', ARRAY['KY:Jefferson']),
  ('40298', 'po_box', ARRAY['KY:Jefferson']),
  -- Jefferson County, KY: Unique (12)
  ('40225', 'unique', ARRAY['KY:Jefferson']),
  ('40266', 'unique', ARRAY['KY:Jefferson']),
  ('40280', 'unique', ARRAY['KY:Jefferson']),
  ('40281', 'unique', ARRAY['KY:Jefferson']),
  ('40282', 'unique', ARRAY['KY:Jefferson']),
  ('40283', 'unique', ARRAY['KY:Jefferson']),
  ('40287', 'unique', ARRAY['KY:Jefferson']),
  ('40289', 'unique', ARRAY['KY:Jefferson']),
  ('40292', 'unique', ARRAY['KY:Jefferson']),
  ('40294', 'unique', ARRAY['KY:Jefferson']),
  ('40296', 'unique', ARRAY['KY:Jefferson']),
  ('40297', 'unique', ARRAY['KY:Jefferson']),
  -- Oldham County, KY: Standard (7)
  ('40010', 'standard', ARRAY['KY:Oldham']),
  ('40014', 'standard', ARRAY['KY:Oldham']),
  ('40026', 'standard', ARRAY['KY:Oldham']),
  ('40031', 'standard', ARRAY['KY:Oldham']),
  ('40055', 'standard', ARRAY['KY:Oldham']),
  ('40056', 'standard', ARRAY['KY:Oldham']),
  ('40077', 'standard', ARRAY['KY:Oldham']),
  -- Oldham County, KY: Unique (1)
  ('40032', 'unique', ARRAY['KY:Oldham']),
  -- Bullitt County, KY: Standard (6)
  ('40013', 'standard', ARRAY['KY:Bullitt']),
  ('40047', 'standard', ARRAY['KY:Bullitt']),
  ('40109', 'standard', ARRAY['KY:Bullitt']),
  ('40150', 'standard', ARRAY['KY:Bullitt']),
  ('40165', 'standard', ARRAY['KY:Bullitt']),
  ('40177', 'standard', ARRAY['KY:Bullitt']),
  -- Bullitt County, KY: PO Box (2)
  ('40110', 'po_box', ARRAY['KY:Bullitt']),
  ('40129', 'po_box', ARRAY['KY:Bullitt']),
  -- Bullitt County, KY: Unique (1)
  ('40166', 'unique', ARRAY['KY:Bullitt']),
  -- Shelby County, KY: Standard (9)
  ('40003', 'standard', ARRAY['KY:Shelby']),
  ('40019', 'standard', ARRAY['KY:Shelby']),
  ('40022', 'standard', ARRAY['KY:Shelby']),
  ('40046', 'standard', ARRAY['KY:Shelby']),
  ('40057', 'standard', ARRAY['KY:Shelby']),
  ('40065', 'standard', ARRAY['KY:Shelby']),
  ('40067', 'standard', ARRAY['KY:Shelby']),
  ('40076', 'standard', ARRAY['KY:Shelby']),
  ('40601', 'standard', ARRAY['KY:Shelby']),
  -- Shelby County, KY: PO Box (1)
  ('40066', 'po_box', ARRAY['KY:Shelby']),
  -- Meade County, KY: Standard (11)
  ('40104', 'standard', ARRAY['KY:Meade']),
  ('40108', 'standard', ARRAY['KY:Meade']),
  ('40117', 'standard', ARRAY['KY:Meade']),
  ('40121', 'standard', ARRAY['KY:Meade']),
  ('40142', 'standard', ARRAY['KY:Meade']),
  ('40146', 'standard', ARRAY['KY:Meade']),
  ('40155', 'standard', ARRAY['KY:Meade']),
  ('40157', 'standard', ARRAY['KY:Meade']),
  ('40161', 'standard', ARRAY['KY:Meade']),
  ('40175', 'standard', ARRAY['KY:Meade']),
  ('40176', 'standard', ARRAY['KY:Meade']),
  -- Clark County, IN: Standard (8)
  ('47104', 'standard', ARRAY['IN:Clark']),
  ('47111', 'standard', ARRAY['IN:Clark']),
  ('47129', 'standard', ARRAY['IN:Clark']),
  ('47130', 'standard', ARRAY['IN:Clark']),
  ('47141', 'standard', ARRAY['IN:Clark']),
  ('47143', 'standard', ARRAY['IN:Clark']),
  ('47162', 'standard', ARRAY['IN:Clark']),
  ('47163', 'standard', ARRAY['IN:Clark']),
  -- Clark County, IN: PO Box (2)
  ('47131', 'po_box', ARRAY['IN:Clark']),
  ('47190', 'po_box', ARRAY['IN:Clark']),
  -- Clark County, IN: Unique (5)
  ('47132', 'unique', ARRAY['IN:Clark']),
  ('47133', 'unique', ARRAY['IN:Clark']),
  ('47134', 'unique', ARRAY['IN:Clark']),
  ('47144', 'unique', ARRAY['IN:Clark']),
  ('47199', 'unique', ARRAY['IN:Clark']),
  -- Floyd County, IN: Standard (1)
  ('47150', 'standard', ARRAY['IN:Floyd']),
  -- Floyd County, IN: PO Box (2)
  ('47146', 'po_box', ARRAY['IN:Floyd']),
  ('47151', 'po_box', ARRAY['IN:Floyd']),
  -- Harrison County, IN: Standard (8)
  ('47110', 'standard', ARRAY['IN:Harrison']),
  ('47112', 'standard', ARRAY['IN:Harrison']),
  ('47114', 'standard', ARRAY['IN:Harrison']),
  ('47135', 'standard', ARRAY['IN:Harrison']),
  ('47142', 'standard', ARRAY['IN:Harrison']),
  ('47160', 'standard', ARRAY['IN:Harrison']),
  ('47161', 'standard', ARRAY['IN:Harrison']),
  ('47166', 'standard', ARRAY['IN:Harrison']),
  -- Harrison County, IN: PO Box (1)
  ('47107', 'po_box', ARRAY['IN:Harrison']),
  -- Scott County, IN: Standard (1)
  ('47102', 'standard', ARRAY['IN:Scott']),
  -- Washington County, IN: Standard (6)
  ('47108', 'standard', ARRAY['IN:Washington']),
  ('47120', 'standard', ARRAY['IN:Washington']),
  ('47125', 'standard', ARRAY['IN:Washington']),
  ('47145', 'standard', ARRAY['IN:Washington']),
  ('47167', 'standard', ARRAY['IN:Washington']),
  ('47281', 'standard', ARRAY['IN:Washington']),
  -- Jefferson County, IN: Standard (6)
  ('47043', 'standard', ARRAY['IN:Jefferson']),
  ('47224', 'standard', ARRAY['IN:Jefferson']),
  ('47227', 'standard', ARRAY['IN:Jefferson']),
  ('47231', 'standard', ARRAY['IN:Jefferson']),
  ('47243', 'standard', ARRAY['IN:Jefferson']),
  ('47250', 'standard', ARRAY['IN:Jefferson']),
  -- Several service counties, Kentucky (no category stated)
  ('40023', NULL, ARRAY['KY:Jefferson', 'KY:Shelby']),
  ('40245', NULL, ARRAY['KY:Jefferson', 'KY:Shelby']),
  ('40059', NULL, ARRAY['KY:Jefferson', 'KY:Oldham']),
  ('40241', NULL, ARRAY['KY:Jefferson', 'KY:Oldham']),
  ('40068', NULL, ARRAY['KY:Oldham', 'KY:Shelby']),
  ('40071', NULL, ARRAY['KY:Bullitt', 'KY:Shelby']),
  ('40229', NULL, ARRAY['KY:Jefferson', 'KY:Bullitt']),
  -- Several service counties, Indiana (no category stated)
  ('47106', NULL, ARRAY['IN:Clark', 'IN:Floyd', 'IN:Washington']),
  ('47165', NULL, ARRAY['IN:Clark', 'IN:Floyd', 'IN:Washington']),
  ('47115', NULL, ARRAY['IN:Harrison', 'IN:Washington']),
  ('47164', NULL, ARRAY['IN:Harrison', 'IN:Washington']),
  ('47117', NULL, ARRAY['IN:Floyd', 'IN:Harrison']),
  ('47122', NULL, ARRAY['IN:Floyd', 'IN:Harrison']),
  ('47124', NULL, ARRAY['IN:Floyd', 'IN:Harrison']),
  ('47136', NULL, ARRAY['IN:Floyd', 'IN:Harrison']),
  ('47119', NULL, ARRAY['IN:Clark', 'IN:Floyd']),
  ('47172', NULL, ARRAY['IN:Clark', 'IN:Floyd']),
  ('47126', NULL, ARRAY['IN:Clark', 'IN:Scott', 'IN:Washington']),
  ('47138', NULL, ARRAY['IN:Scott', 'IN:Jefferson']),
  ('47230', NULL, ARRAY['IN:Scott', 'IN:Jefferson']),
  ('47147', NULL, ARRAY['IN:Clark', 'IN:Scott', 'IN:Jefferson']),
  ('47170', NULL, ARRAY['IN:Scott', 'IN:Washington']),
  ('47177', NULL, ARRAY['IN:Clark', 'IN:Scott'])
;

-- The recount (OWN-DEC-179 rule 2): any difference from the stated counts refuses the import, every one named.
DO $$
DECLARE
  problems text[] := ARRAY[]::text[];
  n integer;
BEGIN
  SELECT count(*) - count(DISTINCT zip5) INTO n FROM zip_dataset_v1;
  IF n <> 0 THEN problems := problems || format('%s ZIP codes are listed more than once', n); END IF;
  SELECT count(DISTINCT zip5) INTO n FROM zip_dataset_v1;
  IF n <> 169 THEN problems := problems || format('unique ZIP codes: stated 169, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) = 1;
  IF n <> 146 THEN problems := problems || format('one-county ZIP codes: stated 146, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) = 1 AND category = 'standard';
  IF n <> 94 THEN problems := problems || format('Standard: stated 94, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) = 1 AND category = 'po_box';
  IF n <> 33 THEN problems := problems || format('PO Box: stated 33, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) = 1 AND category = 'unique';
  IF n <> 19 THEN problems := problems || format('Unique: stated 19, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) > 1;
  IF n <> 23 THEN problems := problems || format('multi-county ZIP codes: stated 23, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) > 1 AND counties[1] LIKE 'KY:%';
  IF n <> 7 THEN problems := problems || format('multi-county in Kentucky: stated 7, counted %s', n); END IF;
  SELECT count(*) INTO n FROM zip_dataset_v1 WHERE cardinality(counties) > 1 AND counties[1] LIKE 'IN:%';
  IF n <> 16 THEN problems := problems || format('multi-county in Indiana: stated 16, counted %s', n); END IF;
  -- Every listed county is one of the eleven of coverage.area (OWN-DEC-179 rule 3).
  SELECT count(*) INTO n FROM zip_dataset_v1 d, unnest(d.counties) AS c
  WHERE c NOT IN (SELECT (x ->> 'state') || ':' || (x ->> 'county')
                  FROM platform.policy_version p, jsonb_array_elements(p.value -> 'counties') AS x
                  WHERE p.key = 'coverage.area' AND p.status = 'active');
  IF n <> 0 THEN problems := problems || format('%s county associations name a county outside coverage.area', n); END IF;
  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'ZIP dataset v1 does not match OWN-DEC-179: %', array_to_string(problems, '; ');
  END IF;
END;
$$;

INSERT INTO platform.coverage_zip_datasets (version, source, source_ids, stated_counts, content_sha256, created_by)
SELECT 1, 'OWN-DEC-179 owner ZIP dataset (owner answers 2026-10-21 R8-Q2)', ARRAY['OWN-DEC-179', 'TSK-0127'],
  '{"unique": 169, "singleCounty": {"total": 146, "standard": 94, "poBox": 33, "unique": 19},
    "multiCounty": {"total": 23, "byState": {"KY": 7, "IN": 16}}}'::jsonb,
  encode(sha256(convert_to(string_agg(zip5 || '|' || coalesce(category, '') || '|' || array_to_string(counties, '+'),
    E'\n' ORDER BY zip5), 'UTF8')), 'hex'),
  'migration:0067'
FROM zip_dataset_v1;
INSERT INTO platform.coverage_zip_entries (dataset, zip5, category, counties)
SELECT 1, zip5, category, counties FROM zip_dataset_v1;

-- The rule set of dataset v1 (verification NOT CONFIGURED), active in place of any earlier set, which is kept.
UPDATE platform.coverage_rule_sets SET status = 'superseded' WHERE status = 'active';
INSERT INTO platform.coverage_rule_sets (version, status, source, source_sha256, area_version, created_by,
  approved_by, approval_sources, approved_at, dataset_version, verification)
SELECT coalesce((SELECT max(version) FROM platform.coverage_rule_sets), 0) + 1, 'active',
  'ZIP dataset v1 (OWN-DEC-179); geographic verification NOT CONFIGURED', d.content_sha256,
  (SELECT version FROM platform.policy_version WHERE key = 'coverage.area' AND status = 'active'),
  'migration:0067', 'owner (OWN-DEC-179 authorization)', ARRAY['OWN-DEC-179'], now(), 1, 'not_configured'
FROM platform.coverage_zip_datasets d WHERE d.version = 1;
INSERT INTO platform.coverage_rules (rule_set, zip5, disposition, counties, zip_category, reason)
SELECT (SELECT version FROM platform.coverage_rule_sets WHERE status = 'active'), e.zip5,
  CASE WHEN e.category IN ('po_box', 'unique') THEN 'unknown'
       WHEN cardinality(e.counties) > 1 THEN 'boundary'
       ELSE 'in_coverage' END,
  ARRAY(SELECT c FROM unnest(e.counties) AS c ORDER BY c),
  e.category,
  CASE WHEN e.category IN ('po_box', 'unique') THEN 'mailing_zip'
       WHEN cardinality(e.counties) > 1 THEN 'dataset_several_counties'
       ELSE 'dataset_one_county' END
FROM platform.coverage_zip_entries e WHERE e.dataset = 1;

INSERT INTO platform.audit_events (actor_kind, actor_process, action, target_type, target_id, target_version, result, summary,
  request_id)
SELECT 'system', 'migration:0067', 'coverage.import_dataset', 'coverage_zip_dataset', '1', 1, 'succeeded',
  jsonb_build_object('sources', jsonb_build_array('OWN-DEC-179'), 'zipCodes', count(*),
    'sha256', (SELECT content_sha256 FROM platform.coverage_zip_datasets WHERE version = 1)),
  'migration:0067'
FROM platform.coverage_zip_entries WHERE dataset = 1;
INSERT INTO platform.audit_events (actor_kind, actor_process, action, target_type, target_id, target_version, result, summary,
  request_id)
SELECT 'system', 'migration:0067', 'coverage.activate_rules', 'coverage_rule_set', s.version::text, s.version, 'succeeded',
  jsonb_build_object('sources', jsonb_build_array('OWN-DEC-179'), 'datasetVersion', 1,
    'verification', 'not_configured',
    'in_coverage', (SELECT count(*) FROM platform.coverage_rules r WHERE r.rule_set = s.version
                    AND r.disposition = 'in_coverage'),
    'boundary', (SELECT count(*) FROM platform.coverage_rules r WHERE r.rule_set = s.version
                 AND r.disposition = 'boundary'),
    'unknown', (SELECT count(*) FROM platform.coverage_rules r WHERE r.rule_set = s.version
                AND r.disposition = 'unknown')),
  'migration:0067'
FROM platform.coverage_rule_sets s WHERE s.status = 'active';

-- Staff verification of the property's complete address and county (final owner amendments 2026-10-22).
CREATE TABLE crm.property_county_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  property_id     uuid NOT NULL REFERENCES crm.properties (id),
  -- The address version staff checked; a later address change needs a new verification.
  address_version integer NOT NULL CHECK (address_version >= 1),
  state           text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  -- The county name without "County", as coverage.area records it.
  county          text NOT NULL CHECK (char_length(county) BETWEEN 1 AND 100 AND county ~ '\S'),
  -- Whether the county is one of the counties of coverage.area (area_version) when it was verified.
  in_area         boolean NOT NULL,
  area_version    integer NOT NULL CHECK (area_version >= 1),
  -- How staff verified it, in their words (optional; never an access code).
  note            text CHECK (char_length(note) <= 1000),
  verified_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  verified_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm.property_county_verifications IS
  'Staff verification of a property address and its county, per address version (TSK-0127); append-only.';
CREATE INDEX property_county_verifications_property ON crm.property_county_verifications (property_id, seq);
CREATE TRIGGER property_county_verifications_append_only BEFORE UPDATE OR DELETE ON crm.property_county_verifications
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

ALTER TABLE work.visits
  ADD COLUMN county_verification_id uuid REFERENCES crm.property_county_verifications (id);

-- The verification a confirmation needs: the newest one of the property's current address version.
CREATE FUNCTION crm.current_county_verification(p_property uuid)
RETURNS crm.property_county_verifications LANGUAGE sql STABLE AS $$
  SELECT v.* FROM crm.property_county_verifications v
  JOIN crm.properties p ON p.id = v.property_id AND p.address_version = v.address_version
  WHERE v.property_id = p_property
  ORDER BY v.seq DESC
  LIMIT 1
$$;

CREATE FUNCTION work.visit_county_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  verified crm.property_county_verifications;
BEGIN
  verified := crm.current_county_verification(NEW.property_id);
  IF verified.id IS NULL THEN
    RAISE EXCEPTION 'visit % cannot be confirmed before staff verify the property address and county', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT verified.in_area THEN
    RAISE EXCEPTION 'visit % cannot be confirmed: the verified county is outside the service area', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.county_verification_id := verified.id;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_county_guard BEFORE UPDATE OF state ON work.visits
  FOR EACH ROW WHEN (NEW.state = 'confirmed' AND OLD.state IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION work.visit_county_guard();
