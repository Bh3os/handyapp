-- 0038 Customer and contact records, candidate matches and visibility classes (TSK-0044; HH-CRM-01, HH-ID-02,
-- HH-STAFF-05, T21, T24, T57, ENT-Customer, ENT-Contact, ENT-ConsentPreference, OWN-DEC-117, OWN-DEC-143).
--
-- Visibility classes (HH-STAFF-05): every note and attachment has exactly one of internal_operational,
-- restricted_incident (the Owner and the reporting worker only, OWN-DEC-143), restricted_financial or customer_shared.
-- Internal is the default; sharing with the customer is an explicit, audited action on media (TSK-0076), never a
-- default. Public marketing use stays a separate publication permission (HH-PRIV-02), never a visibility class.
-- - intake.photos: the class names of HH-STAFF-05 replace 0035's 'internal' (same meaning, renamed in place), and
--   restricted_financial joins them. A staff photo still never starts customer_shared.
-- - Notes are never customer_shared (PROPOSED): what a customer should read is a customer message (TSK-0050), kept
--   apart from notes everywhere (HH-STAFF-05 "Internal notes are kept separate from customer-visible messages").
--   Request notes (0022) take the three staff classes; the one stored value 'internal' becomes internal_operational.
--
-- Customer records (HH-CRM-01, OWN-DEC-117):
-- - crm.customer_notes: notes on the customer record itself, append-only like request notes.
-- - crm.record_changes: every staff edit of a customer or contact with its required reason and the values before and
--   after (staff-only history; the audit log records the fields and the reason, never the personal data).
--
-- Candidate matches (HH-ID-02, T21): a shared email, phone or address between two customers is a suggestion for staff
-- review, never a link and never proof of identity. Nothing here merges, links or grants access: the two customers
-- keep their own contacts, properties, projects and access, and the merge itself is a separate, human-reviewed step
-- (HH-CRM-04, TSK-0046). One row per pair of customers; the reviews of a pair are kept in their own append-only rows.

-- 1. Visibility classes on photos.
ALTER TABLE intake.photos DROP CONSTRAINT photos_visibility_check;
UPDATE intake.photos SET visibility = 'internal_operational' WHERE visibility = 'internal';
ALTER TABLE intake.photos
  ALTER COLUMN visibility SET DEFAULT 'internal_operational',
  ADD CONSTRAINT photos_visibility_check
    CHECK (visibility IN ('internal_operational', 'restricted_incident', 'restricted_financial', 'customer_shared'));
COMMENT ON COLUMN intake.photos.visibility IS
  'Visibility class (HH-STAFF-05): internal_operational (default), restricted_incident, restricted_financial or '
  'customer_shared.';

CREATE OR REPLACE FUNCTION intake.photo_visibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Sharing with the customer is a later, explicit step; a staff photo may start in a restricted class.
    IF NEW.uploader_kind = 'staff' AND NEW.visibility = 'customer_shared' THEN
      RAISE EXCEPTION 'PHOTO_INTERNAL_FIRST: a staff photo starts internal' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.uploader_kind IS DISTINCT FROM OLD.uploader_kind THEN
    RAISE EXCEPTION 'PHOTO_UPLOADER: the uploader of a photo never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Visibility classes on request notes. The rename keeps every note's meaning; notes stay append-only afterwards.
ALTER TABLE intake.request_notes DROP CONSTRAINT request_notes_visibility_check;
ALTER TABLE intake.request_notes DISABLE TRIGGER request_notes_append_only;
UPDATE intake.request_notes SET visibility = 'internal_operational' WHERE visibility = 'internal';
ALTER TABLE intake.request_notes ENABLE TRIGGER request_notes_append_only;
ALTER TABLE intake.request_notes
  ALTER COLUMN visibility SET DEFAULT 'internal_operational',
  ADD CONSTRAINT request_notes_visibility_check
    CHECK (visibility IN ('internal_operational', 'restricted_incident', 'restricted_financial'));
COMMENT ON COLUMN intake.request_notes.visibility IS
  'Visibility class (HH-STAFF-05) of a staff-only note: internal_operational (default), restricted_incident or '
  'restricted_financial; never customer_shared.';

-- 3. Notes on the customer record.
CREATE TABLE crm.customer_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES crm.customers (id),
  author_staff_id uuid NOT NULL REFERENCES identity.staff_users (id),
  visibility      text NOT NULL DEFAULT 'internal_operational'
                    CHECK (visibility IN ('internal_operational', 'restricted_incident', 'restricted_financial')),
  body            text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_notes_customer ON crm.customer_notes (customer_id, created_at);
CREATE TRIGGER customer_notes_append_only BEFORE UPDATE OR DELETE ON crm.customer_notes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.customer_notes IS 'Staff-only notes on a customer record, with a visibility class (HH-STAFF-05).';

-- 4. Staff edits of customer and contact details, each with its reason (ENT-Customer, ENT-Contact "with a reason").
CREATE TABLE crm.record_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES crm.customers (id),
  record_type text NOT NULL CHECK (record_type IN ('customer', 'contact')),
  record_id   uuid NOT NULL,
  fields      text[] NOT NULL CHECK (cardinality(fields) BETWEEN 1 AND 10),
  previous    jsonb NOT NULL CHECK (jsonb_typeof(previous) = 'object'),
  current     jsonb NOT NULL CHECK (jsonb_typeof(current) = 'object'),
  reason      text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  changed_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_changes_customer ON crm.record_changes (customer_id, changed_at);
CREATE TRIGGER record_changes_append_only BEFORE UPDATE OR DELETE ON crm.record_changes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE crm.record_changes IS 'Staff edits of customer and contact details with their reasons (HH-CRM-01).';

-- 5. Candidate matches between two customers (HH-ID-02): suggestions for staff, never links.
CREATE TABLE crm.candidate_matches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The customer whose new or changed details produced the suggestion, and the existing customer they resemble.
  customer_id           uuid NOT NULL REFERENCES crm.customers (id),
  candidate_customer_id uuid NOT NULL REFERENCES crm.customers (id),
  pair_low              uuid GENERATED ALWAYS AS (least(customer_id, candidate_customer_id)) STORED,
  pair_high             uuid GENERATED ALWAYS AS (greatest(customer_id, candidate_customer_id)) STORED,
  -- What the two share. A name alone never makes a suggestion (it only supports one), and nothing is ever linked by
  -- name or address alone (HH-ID-02).
  reasons               text[] NOT NULL
    CHECK (cardinality(reasons) >= 1 AND reasons <@ ARRAY['email', 'phone', 'address', 'name']
           AND reasons && ARRAY['email', 'phone', 'address']),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed')),
  detected_by           text NOT NULL CHECK (detected_by IN ('request_submission', 'contact_change')),
  detected_at           timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (customer_id <> candidate_customer_id),
  UNIQUE (pair_low, pair_high)
);
CREATE INDEX candidate_matches_customer ON crm.candidate_matches (customer_id, status);
CREATE INDEX candidate_matches_candidate ON crm.candidate_matches (candidate_customer_id, status);

-- A suggestion keeps the two customers it is about and is never deleted.
CREATE FUNCTION crm.candidate_match_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'candidate matches are reviewed, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.customer_id, NEW.candidate_customer_id, NEW.detected_by, NEW.detected_at)
     IS DISTINCT FROM (OLD.customer_id, OLD.candidate_customer_id, OLD.detected_by, OLD.detected_at) THEN
    RAISE EXCEPTION 'a candidate match keeps its two customers' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER candidate_matches_guard BEFORE UPDATE OR DELETE ON crm.candidate_matches
  FOR EACH ROW EXECUTE FUNCTION crm.candidate_match_guard();
COMMENT ON TABLE crm.candidate_matches IS
  'Possible duplicate customers for staff review (HH-ID-02): suggestions only, never links or proof of identity.';

-- Every review step of a suggestion: reopened by new shared details, or dismissed by staff with a reason.
CREATE TABLE crm.candidate_match_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES crm.candidate_matches (id),
  event       text NOT NULL CHECK (event IN ('detected', 'reasons_added', 'reopened', 'dismissed')),
  reasons     text[] NOT NULL,
  reason      text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  -- Staff for a review; null for the detection automation.
  staff_id    uuid REFERENCES identity.staff_users (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event <> 'dismissed' OR (reason IS NOT NULL AND staff_id IS NOT NULL))
);
CREATE INDEX candidate_match_events_match ON crm.candidate_match_events (match_id, recorded_at);
CREATE TRIGGER candidate_match_events_append_only BEFORE UPDATE OR DELETE ON crm.candidate_match_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
