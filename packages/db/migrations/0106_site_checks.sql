-- 0106 First-visit site checks at confirmation (TSK-0126; OWN-DEC-167, OWN-DEC-179, OWN-DEC-206, HH-SCH-06, HH-CRM-02,
-- ENT-Visit, ENT-Property, ENT-Contact, ENT-CoverageRule, ENT-AuditEvent, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES).
-- The three checks of OWN-DEC-167, each a staff record with the information it rests on, its verifier and its time.
-- The server names every missing one (apps/server/src/modules/visits/site-checks.ts); this database refuses the
-- confirmation itself while one is missing, whatever path writes it, and records on the visit which checks it used.
-- 1. Verified property address: the address-and-county check of migration 0067 (crm.property_county_verifications),
--    per address version, unchanged. A new address version needs it again.
-- 2. Authorized site contact: crm.project_site_contacts, the person the project's customer designated (the customer
--    themselves or someone they name), per project, with their name, role and a phone or email, and what staff
--    confirmed they may do: give access to the property and/or coordinate the visit. Nothing here ever gives a site
--    contact authority over money or contract changes (OWN-DEC-167). Each change is the next version; an empty
--    authority is a designated person whose authority is not confirmed (the check is unmet). A contact designated as
--    the customer rests on the customer's contact record as it was: a changed name, phone or email needs the check
--    again. PROPOSED (OQ-SITE-CHECK-DETAILS): the contact belongs to the project, not the property, since the customer
--    of each project designates it; the property's free-text site-contact detail (0040) stays a note.
-- 3. Service-area coverage: crm.project_coverage_acceptances, per project, on the current address-and-county check. A
--    county inside coverage.area is SERVED and accepted by the Owner or Office with no owner approval (OWN-DEC-179);
--    a county outside it is OUTSIDE and needs the Owner's exception with a written reason. The outcome comes from the
--    county check, never from the person accepting it. An exception lifts only this check: every hold, the approval
--    and the deposit gate still apply (no legal, licensing or safety restriction is overridden, RULE-SAFETY-GATES).
--    PROPOSED: EDGE and UNKNOWN stay ZIP-only screening results; a verified county is inside or outside the area, so
--    the confirmation-time outcome is SERVED or OUTSIDE (OWN-DEC-206).
-- Every check is append-only (a correction is a new row) and written by a live Owner or Office; the exception by the
-- Owner. PROPOSED: every confirmation of the project's visits needs the three checks current, not only the first;
-- they persist, so staff record them again only after the address, the county check or the contact changed.

-- 2. The site contact.
CREATE TABLE crm.project_site_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  project_id  uuid NOT NULL REFERENCES crm.projects (id),
  version     integer NOT NULL CHECK (version >= 1),
  -- 'customer': the project's customer contact (contact_id); 'other': a person the customer named.
  designation text NOT NULL CHECK (designation IN ('customer', 'other')),
  contact_id  uuid REFERENCES crm.contacts (id),
  full_name   text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200 AND full_name ~ '\S'),
  -- The person's role at the property (tenant, property manager, family member...), in staff's words; the customer
  -- designated as their own site contact needs none.
  role        text CHECK (char_length(role) BETWEEN 1 AND 100 AND role ~ '\S'),
  phone_e164  text CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email       text CHECK (char_length(email) BETWEEN 3 AND 254),
  -- What staff confirmed the person may do. Empty: designated, authority not confirmed.
  authority   text[] NOT NULL
    CHECK (authority <@ ARRAY['property_access', 'visit_coordination']::text[] AND array_position(authority, NULL) IS NULL),
  -- How the customer designated the person (the sources of property details, 0040).
  source      text NOT NULL CHECK (crm.property_source_ok(source)),
  note        text CHECK (char_length(note) BETWEEN 1 AND 1000),
  recorded_by uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  CHECK ((designation = 'customer') = (contact_id IS NOT NULL)),
  CHECK (designation = 'customer' OR role IS NOT NULL),
  CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);
COMMENT ON TABLE crm.project_site_contacts IS
  'The authorized site contact of a project and its confirmed authority, versioned (TSK-0126, OWN-DEC-167); append-only.';
CREATE INDEX project_site_contacts_project ON crm.project_site_contacts (project_id, version);

-- The next version, by a live Owner or Office; a customer designation names the project's own customer's contact.
CREATE FUNCTION crm.project_site_contact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: site contacts are kept as recorded; a change is the next version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> coalesce((SELECT max(version) FROM crm.project_site_contacts WHERE project_id = NEW.project_id), 0) + 1
  THEN
    RAISE EXCEPTION 'a site contact is recorded as the project''s next version' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.designation = 'customer' AND NOT EXISTS (
       SELECT 1 FROM crm.contacts c JOIN crm.projects p ON p.customer_id = c.customer_id
       WHERE c.id = NEW.contact_id AND p.id = NEW.project_id) THEN
    RAISE EXCEPTION 'a customer site contact is the project''s own customer''s contact' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (work.has_live_role(NEW.recorded_by, 'owner') OR work.has_live_role(NEW.recorded_by, 'office')) THEN
    RAISE EXCEPTION 'the Owner or Office records the site contact' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER project_site_contacts_guard BEFORE INSERT OR UPDATE OR DELETE ON crm.project_site_contacts
  FOR EACH ROW EXECUTE FUNCTION crm.project_site_contact_guard();

-- The project's current site contact (its newest version), or a row of nulls.
CREATE FUNCTION crm.current_site_contact(p_project uuid)
RETURNS crm.project_site_contacts LANGUAGE sql STABLE AS $$
  SELECT * FROM crm.project_site_contacts WHERE project_id = p_project ORDER BY version DESC LIMIT 1
$$;

-- Whether a customer site contact still matches the customer's contact record (name, phone and email as confirmed).
CREATE FUNCTION crm.site_contact_unchanged(c crm.project_site_contacts) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT c.designation = 'other' OR EXISTS (
    SELECT 1 FROM crm.contacts k
    WHERE k.id = c.contact_id AND k.full_name = c.full_name
      AND k.phone_e164 IS NOT DISTINCT FROM c.phone_e164 AND lower(k.email) IS NOT DISTINCT FROM lower(c.email))
$$;

-- 3. The coverage acceptance and the Owner's exception.
CREATE TABLE crm.project_coverage_acceptances (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                    bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  project_id             uuid NOT NULL REFERENCES crm.projects (id),
  -- The address-and-county check it rests on: a new address version or a new check needs a new acceptance.
  county_verification_id uuid NOT NULL REFERENCES crm.property_county_verifications (id),
  -- From the county check: inside coverage.area SERVED, outside it OUTSIDE (never chosen by the person accepting).
  outcome                text NOT NULL CHECK (outcome IN ('served', 'outside')),
  -- The Owner's reason for serving a location outside the standard area; none for SERVED.
  exception_reason       text CHECK (char_length(btrim(exception_reason)) BETWEEN 1 AND 1000),
  accepted_by            uuid NOT NULL REFERENCES identity.staff_users (id),
  accepted_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((outcome = 'served') = (exception_reason IS NULL))
);
COMMENT ON TABLE crm.project_coverage_acceptances IS
  'Staff acceptance of a project''s service-area coverage, or the Owner''s exception with its reason (TSK-0126, '
  'OWN-DEC-167); append-only.';
CREATE INDEX project_coverage_acceptances_project ON crm.project_coverage_acceptances (project_id, seq);

-- On the current check of the project's property; the outcome is the check's; SERVED by a live Owner or Office, an
-- exception by the Owner.
CREATE FUNCTION crm.project_coverage_acceptance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_check crm.property_county_verifications;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'APPEND_ONLY: coverage acceptances are kept as recorded' USING ERRCODE = 'restrict_violation';
  END IF;
  current_check := crm.current_county_verification((SELECT property_id FROM crm.projects WHERE id = NEW.project_id));
  IF current_check.id IS DISTINCT FROM NEW.county_verification_id THEN
    RAISE EXCEPTION 'coverage is accepted on the current address-and-county check of the project''s property'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.outcome <> (CASE WHEN current_check.in_area THEN 'served' ELSE 'outside' END) THEN
    RAISE EXCEPTION 'the coverage outcome is the county check''s' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.outcome = 'served'
     AND NOT (work.has_live_role(NEW.accepted_by, 'owner') OR work.has_live_role(NEW.accepted_by, 'office')) THEN
    RAISE EXCEPTION 'the Owner or Office accepts SERVED coverage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.outcome <> 'served' AND NOT work.has_live_role(NEW.accepted_by, 'owner') THEN
    RAISE EXCEPTION 'only the Owner approves a coverage exception' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.accepted_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER project_coverage_acceptances_guard BEFORE INSERT OR UPDATE OR DELETE ON crm.project_coverage_acceptances
  FOR EACH ROW EXECUTE FUNCTION crm.project_coverage_acceptance_guard();

-- A staging reset is the only path that empties these tables (TSK-0141).
CREATE TRIGGER project_site_contacts_reset_only_truncate BEFORE TRUNCATE ON crm.project_site_contacts
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER project_coverage_acceptances_reset_only_truncate BEFORE TRUNCATE ON crm.project_coverage_acceptances
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();

-- The checks a confirmation used, recorded on the visit beside its county check (0067).
ALTER TABLE work.visits
  ADD COLUMN site_contact_id        uuid REFERENCES crm.project_site_contacts (id),
  ADD COLUMN coverage_acceptance_id uuid REFERENCES crm.project_coverage_acceptances (id);

-- The confirmation guard of 0067, now for the three checks: the current address-and-county check, the current site
-- contact with confirmed authority (unchanged since), and the project's coverage acceptance on that county check.
-- Each refusal names its check; the server names them all at once before it gets here.
CREATE OR REPLACE FUNCTION work.visit_county_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  verified crm.property_county_verifications;
  contact  crm.project_site_contacts;
  accepted crm.project_coverage_acceptances;
BEGIN
  verified := crm.current_county_verification(NEW.property_id);
  IF verified.id IS NULL THEN
    RAISE EXCEPTION 'visit % cannot be confirmed before staff verify the property address and county', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  contact := crm.current_site_contact(NEW.project_id);
  IF contact.id IS NULL THEN
    RAISE EXCEPTION 'visit % cannot be confirmed before staff record the authorized site contact', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF cardinality(contact.authority) = 0 THEN
    RAISE EXCEPTION 'visit % cannot be confirmed: the site contact''s authority is not confirmed', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT crm.site_contact_unchanged(contact) THEN
    RAISE EXCEPTION 'visit % cannot be confirmed: the site contact changed since staff confirmed it', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO accepted FROM crm.project_coverage_acceptances
   WHERE project_id = NEW.project_id AND county_verification_id = verified.id
   ORDER BY seq DESC LIMIT 1;
  IF accepted.id IS NULL AND NOT verified.in_area THEN
    RAISE EXCEPTION 'visit % cannot be confirmed: the verified county is outside the service area (no Owner exception)',
      NEW.id USING ERRCODE = 'check_violation';
  END IF;
  IF accepted.id IS NULL THEN
    RAISE EXCEPTION 'visit % cannot be confirmed before staff accept the service-area coverage', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.county_verification_id := verified.id;
  NEW.site_contact_id := contact.id;
  NEW.coverage_acceptance_id := accepted.id;
  RETURN NEW;
END $$;
