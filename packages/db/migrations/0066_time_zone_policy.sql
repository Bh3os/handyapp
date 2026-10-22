-- 0066 The time-zone policy (TSK-0123; OWN-DEC-159, FACT-TIMEZONE, HH-SCH-02, HH-DATA-06, HH-COM-15, ENT-Property,
-- ENT-PolicyVersion, T41, RULE-NO-INVENTED-FACTS).
-- 1. business.timezone: a new version, America/Kentucky/Louisville, decided by the owner (OWN-DEC-159), so no longer
--    PROPOSED. Business hours, the response goal, reporting and estimate validity count in it.
-- 2. geo.county_time_zones: the zone of each service-area county, from which a property's zone is derived. No county's
--    zone is written here: the repository holds no authoritative county-to-zone data, so the list is NOT CONFIGURED
--    (OQ-COUNTY-TIME-ZONES) and every new property's zone is unknown until staff verify it.
-- 3. A property's zone (ENT-Property): the IANA zone id, its state (unknown, derived, verified) and what it rests on,
--    with the counties used, mirrored on crm.properties from an append-only history (crm.property_time_zones). An
--    unknown zone is null: never assumed Eastern. The zone the existing properties carry was the withdrawn assumption
--    that every served property is Eastern (FACT-TIMEZONE): it is recorded in their history as withdrawn and their zone
--    becomes unknown. The visits already planned keep the zone they were planned in (work.visits.time_zone).
-- 4. A property whose zone is unknown while one of its projects is open is flagged in the staff queue (property_time_
--    zone), opened and resolved by the database in the same transaction as the zone or the project changes.
-- 5. A contact's own zone for texts (crm.contacts.time_zone; null: unknown). The property's zone is never assumed to be
--    the recipient's (OWN-DEC-159 item 5); staff record it with a reason (crm.record_changes).

-- 1. The decided business time zone.
UPDATE platform.policy_version SET status = 'superseded' WHERE key = 'business.timezone' AND status = 'active';
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason)
  SELECT 'business.timezone', coalesce(max(version), 0) + 1, 'configured', '{"zone": "America/Kentucky/Louisville"}',
         false, ARRAY['FACT-TIMEZONE', 'OWN-DEC-159'], 'migration:0066',
         'OWN-DEC-159: the official business time zone is America/Kentucky/Louisville'
    FROM platform.policy_version WHERE key = 'business.timezone';

-- 2. The county-to-zone list: NOT CONFIGURED until an authoritative list is supplied.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('geo.county_time_zones', 1, 'not_configured', NULL, false,
   ARRAY['OWN-DEC-159', 'FACT-SERVICE-AREA', 'OQ-COUNTY-TIME-ZONES'], 'migration:0066');

-- 2b. The text window for a recipient whose own zone cannot be established (OWN-DEC-207, HH-COM-15; final owner amendments
--     2026-10-22, reading 8): non-urgent texts only between 9 AM and 9 PM Eastern, in the business zone id. The
--     recipient's verified zone is used whenever there is one; applying either window to deliveries is TSK-0122.
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by, change_reason) VALUES
  ('sms.unknown_zone_hours', 1, 'configured', '{"open": "09:00", "close": "21:00", "zone": "America/Kentucky/Louisville"}',
   false, ARRAY['OWN-DEC-207', 'HH-COM-15', 'OWN-DEC-159'], 'migration:0066',
   'OWN-DEC-207 (final owner amendments 2026-10-22): 9 AM-9 PM Eastern when the recipient zone is unknown');

-- 3. The property's zone.
CREATE FUNCTION crm.zone_status_ok(status text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT status IN ('unknown', 'derived', 'verified')
$$;
CREATE FUNCTION crm.zone_basis_ok(status text, basis text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE status
    WHEN 'derived' THEN basis = 'zip_counties'
    WHEN 'verified' THEN basis = 'verified_county'
    ELSE basis IN ('no_zip_rule', 'zip_outside_area', 'zip_boundary', 'county_map_not_configured', 'county_not_mapped',
                   'counties_disagree', 'assumption_withdrawn')
  END
$$;
CREATE FUNCTION crm.zone_id_ok(zone text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT zone IS NULL OR (zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(zone) <= 64)
$$;

CREATE TABLE crm.property_time_zones (
  property_id   uuid NOT NULL REFERENCES crm.properties (id),
  zone_version  integer NOT NULL CHECK (zone_version >= 1),
  -- Null while the zone is unknown.
  time_zone     text CHECK (crm.zone_id_ok(time_zone)),
  status        text NOT NULL CHECK (crm.zone_status_ok(status)),
  basis         text NOT NULL,
  -- The counties the zone was read from, as 'KY:Jefferson' (the ZIP's counties, or the verified county).
  counties      text[] NOT NULL DEFAULT '{}',
  -- The zone this version replaced (for the first version of an existing property: the withdrawn assumption).
  previous_zone text CHECK (crm.zone_id_ok(previous_zone)),
  -- A staff verification names who and why; a derivation (at creation or after an address change) names neither.
  reason        text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  recorded_by   uuid REFERENCES identity.staff_users (id),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, zone_version),
  CHECK (crm.zone_basis_ok(status, basis)),
  CHECK ((time_zone IS NULL) = (status = 'unknown')),
  CHECK (status <> 'verified' OR (recorded_by IS NOT NULL AND reason IS NOT NULL AND cardinality(counties) = 1))
);
CREATE TRIGGER property_time_zones_append_only BEFORE UPDATE OR DELETE ON crm.property_time_zones
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.property_time_zones IS
  'Every zone state of a property (OWN-DEC-159, ENT-Property): unknown, derived or verified, with its basis. Append-only.';

ALTER TABLE crm.properties ALTER COLUMN time_zone DROP NOT NULL;
ALTER TABLE crm.properties
  ADD COLUMN time_zone_status   text NOT NULL DEFAULT 'unknown' CHECK (crm.zone_status_ok(time_zone_status)),
  ADD COLUMN time_zone_basis    text NOT NULL DEFAULT 'no_zip_rule',
  ADD COLUMN time_zone_counties text[] NOT NULL DEFAULT '{}',
  ADD COLUMN time_zone_version  integer NOT NULL DEFAULT 1 CHECK (time_zone_version >= 1);
COMMENT ON COLUMN crm.properties.time_zone IS
  'The property''s IANA zone (appointments are shown in it, OWN-DEC-159); null while unknown, never assumed.';
COMMENT ON COLUMN crm.properties.time_zone_version IS
  'The crm.property_time_zones version the zone columns hold.';

-- The existing properties: their zone was the withdrawn assumption (FACT-TIMEZONE), so it becomes unknown.
INSERT INTO crm.property_time_zones (property_id, zone_version, time_zone, status, basis, previous_zone, recorded_at)
  SELECT id, 1, NULL, 'unknown', 'assumption_withdrawn', time_zone, now() FROM crm.properties;
UPDATE crm.properties
   SET time_zone = NULL, time_zone_status = 'unknown', time_zone_basis = 'assumption_withdrawn',
       time_zone_counties = '{}', time_zone_version = 1;

ALTER TABLE crm.properties
  ADD CONSTRAINT properties_time_zone_format CHECK (crm.zone_id_ok(time_zone)),
  ADD CONSTRAINT properties_time_zone_basis CHECK (crm.zone_basis_ok(time_zone_status, time_zone_basis)),
  ADD CONSTRAINT properties_time_zone_known CHECK ((time_zone IS NULL) = (time_zone_status = 'unknown'));

-- A zone the database does not know is refused, whoever writes it.
CREATE FUNCTION crm.property_zone_known_to_database() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.time_zone IS NOT NULL THEN
    BEGIN
      PERFORM now() AT TIME ZONE NEW.time_zone;
    EXCEPTION WHEN invalid_parameter_value THEN
      RAISE EXCEPTION 'unknown time zone %', NEW.time_zone USING ERRCODE = 'check_violation';
    END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER properties_zone_known BEFORE INSERT OR UPDATE OF time_zone ON crm.properties
  FOR EACH ROW EXECUTE FUNCTION crm.property_zone_known_to_database();

-- A new property starts its zone history with the zone it was created with (derived or unknown).
CREATE FUNCTION crm.property_zone_started() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO crm.property_time_zones (property_id, zone_version, time_zone, status, basis, counties, recorded_at)
    VALUES (NEW.id, NEW.time_zone_version, NEW.time_zone, NEW.time_zone_status, NEW.time_zone_basis,
            NEW.time_zone_counties, NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER properties_zone_started AFTER INSERT ON crm.properties
  FOR EACH ROW EXECUTE FUNCTION crm.property_zone_started();

-- The zone on a property changes only to its next recorded version, so its history is never skipped.
CREATE FUNCTION crm.property_zone_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.time_zone, NEW.time_zone_status, NEW.time_zone_basis, NEW.time_zone_counties) IS DISTINCT FROM
     (OLD.time_zone, OLD.time_zone_status, OLD.time_zone_basis, OLD.time_zone_counties) THEN
    IF NEW.time_zone_version <> OLD.time_zone_version + 1 OR NOT EXISTS (
      SELECT 1 FROM crm.property_time_zones z
      WHERE z.property_id = NEW.id AND z.zone_version = NEW.time_zone_version
        AND (z.time_zone, z.status, z.basis, z.counties) IS NOT DISTINCT FROM
            (NEW.time_zone, NEW.time_zone_status, NEW.time_zone_basis, NEW.time_zone_counties)) THEN
      RAISE EXCEPTION 'ZONE_HISTORY: a property zone changes only to its next recorded version'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW.time_zone_version <> OLD.time_zone_version THEN
    RAISE EXCEPTION 'ZONE_HISTORY: the zone version changes only with the zone' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER properties_zone_guard BEFORE UPDATE ON crm.properties
  FOR EACH ROW EXECUTE FUNCTION crm.property_zone_guard();

-- 4. The queue flag: one property_time_zone item per property while its zone is unknown and a project there is open
--    (not closed or canceled). PROPOSED: the band is 'other' (planning a visit is what it blocks, and planning is
--    refused while it is open, so nothing is booked on a guessed zone); the item names the latest open project.
CREATE FUNCTION ops.sync_property_zone_item(p_property uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  pr record;
  proj record;
BEGIN
  SELECT id, time_zone_status INTO pr FROM crm.properties WHERE id = p_property;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT p.id, p.reference INTO proj
    FROM crm.projects p
   WHERE p.property_id = p_property AND p.state NOT IN ('closed', 'canceled')
   ORDER BY p.created_at DESC, p.id
   LIMIT 1;
  IF pr.time_zone_status <> 'unknown' OR proj.id IS NULL THEN
    UPDATE ops.queue_items
       SET resolved_at = now(), updated_at = now(),
           resolution = CASE WHEN pr.time_zone_status <> 'unknown' THEN 'zone_' || pr.time_zone_status
                             ELSE 'no_open_project' END
     WHERE type = 'property_time_zone' AND subject_type = 'property' AND subject_id = p_property::text
       AND resolved_at IS NULL;
    RETURN;
  END IF;
  INSERT INTO ops.queue_items (type, subject_type, subject_id, band, project_id, reference, reason)
  VALUES ('property_time_zone', 'property', p_property::text, 'other', proj.id, proj.reference, 'time_zone_unknown')
  ON CONFLICT (type, subject_type, subject_id) WHERE resolved_at IS NULL DO UPDATE
     SET project_id = excluded.project_id, reference = excluded.reference, updated_at = now(),
         version = ops.queue_items.version + 1
   WHERE (ops.queue_items.project_id, ops.queue_items.reference)
         IS DISTINCT FROM (excluded.project_id, excluded.reference);
END $$;

CREATE FUNCTION crm.property_zone_syncs_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ops.sync_property_zone_item(NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER properties_zone_queue AFTER UPDATE OF time_zone_status ON crm.properties
  FOR EACH ROW WHEN (NEW.time_zone_status IS DISTINCT FROM OLD.time_zone_status)
  EXECUTE FUNCTION crm.property_zone_syncs_item();

CREATE FUNCTION crm.project_syncs_zone_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ops.sync_property_zone_item(NEW.property_id);
  IF TG_OP = 'UPDATE' AND OLD.property_id IS DISTINCT FROM NEW.property_id THEN
    PERFORM ops.sync_property_zone_item(OLD.property_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER projects_zone_queue AFTER INSERT OR UPDATE OF state, property_id ON crm.projects
  FOR EACH ROW EXECUTE FUNCTION crm.project_syncs_zone_item();

-- The existing properties with an open project are flagged now.
SELECT ops.sync_property_zone_item(id) FROM crm.properties;

-- 5. The recipient's own zone for texts.
ALTER TABLE crm.contacts ADD COLUMN time_zone text CHECK (crm.zone_id_ok(time_zone));
COMMENT ON COLUMN crm.contacts.time_zone IS
  'The contact''s own IANA zone for texts (OWN-DEC-159 item 5, HH-COM-15); null: unknown, never assumed.';
CREATE TRIGGER contacts_zone_known BEFORE INSERT OR UPDATE OF time_zone ON crm.contacts
  FOR EACH ROW EXECUTE FUNCTION crm.property_zone_known_to_database();
