-- 0040 Property records and the protected access-code store (TSK-0045; HH-CRM-02, HH-CRM-03, T28, ENT-Property,
-- ENT-AccessInstructionSecret, OWN-DEC-117, OWN-DEC-40, OWN-DEC-121, OWN-DEC-70, RULE-SERVER-AUTHZ).
--
-- Property record (HH-CRM-02, OWN-DEC-117):
-- - crm.property_addresses: every address a property has had, append-only. The current one is mirrored on
--   crm.properties (address_version); the others are its former addresses. A request keeps the address it was sent
--   with in its original submission, so historic records never take the new address.
-- - crm.property_details: the current value of each changeable detail (non-secret access instructions, parking and
--   loading, occupants and pets, ...) with where it came from and when it was last confirmed. The address and the
--   property type live on crm.properties; their rows here hold only their source and last confirmation.
-- - crm.property_changes: every staff change or confirmation with its required reason and the values before and
--   after (staff-only history; the audit log names the detail and the reason, never the value).
--
-- Protected access-code store (HH-CRM-03, ENT-AccessInstructionSecret, OWN-DEC-121):
-- - crm.access_instruction_secrets: gate, lockbox, alarm and door codes and key locations, in their own table, apart
--   from notes and property fields. The value is sealed by the server (AES-256-GCM under ACCESS_CODE_ENCRYPTION_KEY,
--   bound to the row ID) and only ever unsealed by the audited reveal; this database never holds the plain value.
--   Removing a code erases the sealed value at once (FACT-RETENTION-SCHEDULE: removed when no longer needed); the
--   row stays as the record that a code existed, who entered it and who removed it. Nothing is removed
--   automatically (OWN-DEC-70).
-- - crm.access_code_reveals: who revealed which code and when, append-only, next to the audit event of each reveal.

-- PROPOSED (TSK-0045): where a detail came from. request_form: the customer's request; customer_call and
-- customer_message: the customer said so by phone or in writing; site_visit: seen on site; office_record: other
-- office knowledge.
CREATE FUNCTION crm.property_source_ok(source text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT source IN ('request_form', 'customer_call', 'customer_message', 'site_visit', 'office_record')
$$;

-- 1. Address history.
ALTER TABLE crm.properties ADD COLUMN address_version integer NOT NULL DEFAULT 1 CHECK (address_version >= 1);
COMMENT ON COLUMN crm.properties.address_version IS
  'The crm.property_addresses version the street, unit, city, state and ZIP columns hold (HH-CRM-02).';

CREATE TABLE crm.property_addresses (
  property_id     uuid NOT NULL REFERENCES crm.properties (id),
  address_version integer NOT NULL CHECK (address_version >= 1),
  street          text NOT NULL CHECK (char_length(street) BETWEEN 1 AND 200),
  unit            text CHECK (char_length(unit) BETWEEN 1 AND 50),
  city            text NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100),
  state           text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  zip             text NOT NULL CHECK (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  source          text NOT NULL CHECK (crm.property_source_ok(source)),
  -- The first address comes with the property; every later one is a staff change with its reason.
  reason          text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  recorded_by     uuid REFERENCES identity.staff_users (id),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, address_version),
  CHECK (address_version = 1 OR (recorded_by IS NOT NULL AND reason IS NOT NULL))
);
CREATE TRIGGER property_addresses_append_only BEFORE UPDATE OR DELETE ON crm.property_addresses
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.property_addresses IS
  'Every address of a property (HH-CRM-02): the latest is current, the others are former addresses. Append-only.';

-- 2. Changeable details with their source and last confirmation.
CREATE TABLE crm.property_details (
  property_id  uuid NOT NULL REFERENCES crm.properties (id),
  detail       text NOT NULL CHECK (detail IN ('address', 'property_type', 'site_contact', 'access_windows',
                 'access_notes', 'parking_loading', 'occupants_pets', 'restricted_areas', 'utilities',
                 'customer_preparation', 'site_flags')),
  -- Text details: the current value, or null once staff cleared it. The address and the property type: always null
  -- (their values are the columns of crm.properties).
  value        text CHECK (char_length(btrim(value)) BETWEEN 1 AND 2000),
  source       text NOT NULL CHECK (crm.property_source_ok(source)),
  confirmed_at timestamptz NOT NULL,
  -- Null: given by the customer on the request form, not confirmed by staff.
  confirmed_by uuid REFERENCES identity.staff_users (id),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (property_id, detail),
  CHECK (detail NOT IN ('address', 'property_type') OR value IS NULL)
);
CREATE TRIGGER property_details_no_delete BEFORE DELETE ON crm.property_details
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.property_details IS
  'Each changeable property detail with its source and last confirmation (HH-CRM-02). Never holds access codes.';
COMMENT ON COLUMN crm.property_details.value IS
  'Non-secret text. Access codes are kept only in crm.access_instruction_secrets (HH-CRM-03).';

CREATE TABLE crm.property_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES crm.properties (id),
  detail      text NOT NULL CHECK (detail IN ('address', 'property_type', 'site_contact', 'access_windows',
                'access_notes', 'parking_loading', 'occupants_pets', 'restricted_areas', 'utilities',
                'customer_preparation', 'site_flags')),
  action      text NOT NULL CHECK (action IN ('changed', 'cleared', 'confirmed')),
  previous    jsonb NOT NULL CHECK (jsonb_typeof(previous) = 'object'),
  current     jsonb NOT NULL CHECK (jsonb_typeof(current) = 'object'),
  source      text NOT NULL CHECK (crm.property_source_ok(source)),
  reason      text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  changed_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_changes_property ON crm.property_changes (property_id, changed_at);
CREATE TRIGGER property_changes_append_only BEFORE UPDATE OR DELETE ON crm.property_changes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.property_changes IS
  'Staff changes and confirmations of property details with their reasons (HH-CRM-02). Staff only; append-only.';

-- Every property so far came from a request: its address and type were given on the request form when it was made.
INSERT INTO crm.property_addresses (property_id, address_version, street, unit, city, state, zip, source, recorded_at)
  SELECT id, 1, street, unit, city, state, zip, 'request_form', created_at FROM crm.properties;
INSERT INTO crm.property_details (property_id, detail, source, confirmed_at)
  SELECT id, d.detail, 'request_form', created_at
  FROM crm.properties CROSS JOIN (VALUES ('address'), ('property_type')) AS d (detail);

-- A new property starts its address history and the source of its address and type (the request form: the only way
-- a property is created so far).
CREATE FUNCTION crm.property_started() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO crm.property_addresses (property_id, address_version, street, unit, city, state, zip, source, recorded_at)
    VALUES (NEW.id, NEW.address_version, NEW.street, NEW.unit, NEW.city, NEW.state, NEW.zip, 'request_form',
            NEW.created_at);
  INSERT INTO crm.property_details (property_id, detail, source, confirmed_at)
    VALUES (NEW.id, 'address', 'request_form', NEW.created_at), (NEW.id, 'property_type', 'request_form', NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER properties_started AFTER INSERT ON crm.properties
  FOR EACH ROW EXECUTE FUNCTION crm.property_started();

-- The address on a property changes only to the next recorded version, so the history can never be skipped.
CREATE FUNCTION crm.property_address_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a property keeps its ID' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.street, NEW.unit, NEW.city, NEW.state, NEW.zip) IS DISTINCT FROM
     (OLD.street, OLD.unit, OLD.city, OLD.state, OLD.zip) THEN
    IF NEW.address_version <> OLD.address_version + 1 OR NOT EXISTS (
      SELECT 1 FROM crm.property_addresses a
      WHERE a.property_id = NEW.id AND a.address_version = NEW.address_version
        AND (a.street, a.unit, a.city, a.state, a.zip) IS NOT DISTINCT FROM
            (NEW.street, NEW.unit, NEW.city, NEW.state, NEW.zip)) THEN
      RAISE EXCEPTION 'ADDRESS_HISTORY: a property address changes only to its next recorded version'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW.address_version <> OLD.address_version THEN
    RAISE EXCEPTION 'ADDRESS_HISTORY: the address version changes only with the address'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER properties_address_guard BEFORE UPDATE ON crm.properties
  FOR EACH ROW EXECUTE FUNCTION crm.property_address_guard();

-- 3. The protected access-code store.
CREATE TABLE crm.access_instruction_secrets (
  -- Chosen by the server before sealing: the sealed value is bound to this ID and opens under no other row.
  id             uuid PRIMARY KEY,
  property_id    uuid NOT NULL REFERENCES crm.properties (id),
  -- PROPOSED kinds (ENT-AccessInstructionSecret: a lockbox, gate, alarm or door code or a key location).
  kind           text NOT NULL CHECK (kind IN ('gate', 'lockbox', 'alarm', 'door', 'key_location', 'other')),
  -- A short non-secret name ("Back gate"); never the code.
  label          text CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  sealed_value   text CHECK (sealed_value ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  source         text NOT NULL CHECK (crm.property_source_ok(source) AND source <> 'request_form'),
  confirmed_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_by   uuid NOT NULL REFERENCES identity.staff_users (id),
  created_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz,
  removed_by     uuid REFERENCES identity.staff_users (id),
  removal_reason text CHECK (char_length(btrim(removal_reason)) BETWEEN 1 AND 1000),
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((removed_at IS NULL) = (sealed_value IS NOT NULL)),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  CHECK ((removed_at IS NULL) = (removal_reason IS NULL))
);
CREATE INDEX access_instruction_secrets_property ON crm.access_instruction_secrets (property_id)
  WHERE removed_at IS NULL;
COMMENT ON TABLE crm.access_instruction_secrets IS
  'Access codes and key locations (HH-CRM-03): sealed, masked by default, revealed only by the audited reveal; never '
  'in notes, messages, exports, packets, offline downloads, caches, logs or analytics.';
COMMENT ON COLUMN crm.access_instruction_secrets.sealed_value IS
  'AES-256-GCM under ACCESS_CODE_ENCRYPTION_KEY, bound to the row ID; null once removed (the value is erased).';

-- A code keeps its property, kind and creation; a removed code is never changed or revealed again; nothing is
-- deleted (the removal erases the value and keeps the record).
CREATE FUNCTION crm.access_secret_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'access codes are removed (value erased), never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.property_id, NEW.kind, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.property_id, OLD.kind, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'an access code keeps its property, kind and creation' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACCESS_CODE_REMOVED: a removed access code is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_instruction_secrets_guard BEFORE UPDATE OR DELETE ON crm.access_instruction_secrets
  FOR EACH ROW EXECUTE FUNCTION crm.access_secret_guard();

CREATE TABLE crm.access_code_reveals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id   uuid NOT NULL REFERENCES crm.access_instruction_secrets (id),
  property_id uuid NOT NULL REFERENCES crm.properties (id),
  staff_id    uuid NOT NULL REFERENCES identity.staff_users (id),
  roles       text[] NOT NULL,
  request_id  text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 200),
  revealed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_code_reveals_secret ON crm.access_code_reveals (secret_id, revealed_at);
CREATE TRIGGER access_code_reveals_append_only BEFORE UPDATE OR DELETE ON crm.access_code_reveals
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.access_code_reveals IS 'Who revealed which access code and when (HH-CRM-03). Append-only.';
