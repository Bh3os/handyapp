-- 0011 Requests and their records (TSK-0025; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21, ENT-Request, ENT-Customer,
-- ENT-Contact, ENT-Property, ENT-Project, OWN-DEC-93, OWN-DEC-97, OWN-DEC-117).
-- One public submission creates, in one transaction: a customer, its contact, a property, a project (not a job and
-- not an appointment) and the request with its services and answers, plus the request.submitted outbox event.
-- A submission is never matched to an existing customer by email, phone, name or address: matching details are only
-- duplicate suggestions for staff (HH-ID-02). The original submission is never edited.
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS intake;

CREATE TABLE crm.customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  -- Customer-facing language is English (RULE-LANGUAGES, OWN-DEC-45).
  language       text NOT NULL DEFAULT 'en' CHECK (language = 'en'),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged')),
  merged_into_id uuid REFERENCES crm.customers (id),
  provenance     text NOT NULL CHECK (provenance IN ('request_submission', 'staff_entry')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((status = 'merged') = (merged_into_id IS NOT NULL))
);

CREATE TABLE crm.contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES crm.customers (id),
  full_name           text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
  email               text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  email_normalized    text GENERATED ALWAYS AS (lower(email)) STORED,
  phone_e164          text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- Email and phone are verified separately; verifying one never marks the other (ENT-Contact, OWN-DEC-96).
  email_verification  text NOT NULL DEFAULT 'unverified'
    CHECK (email_verification IN ('unverified', 'pending', 'verified', 'expired', 'failed')),
  phone_verification  text NOT NULL DEFAULT 'unverified'
    CHECK (phone_verification IN ('unverified', 'pending', 'verified', 'expired', 'failed')),
  preferred_channel   text NOT NULL CHECK (preferred_channel IN ('email', 'call', 'text')),
  is_primary          boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
-- Staff-only duplicate suggestions (HH-ID-02); never unique, never used to link records automatically.
CREATE INDEX contacts_email ON crm.contacts (email_normalized);
CREATE INDEX contacts_phone ON crm.contacts (phone_e164);

CREATE TABLE crm.properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street          text NOT NULL CHECK (char_length(street) BETWEEN 1 AND 200),
  unit            text CHECK (char_length(unit) BETWEEN 1 AND 50),
  city            text NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100),
  state           text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  zip             text NOT NULL CHECK (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  -- FACT-PROPERTY-TYPES (OWN-DEC-139).
  property_type   text NOT NULL CHECK (property_type IN ('house', 'apartment_condo', 'townhouse', 'rental_short_term')),
  time_zone       text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  -- OWN-DEC-88: four outcomes; never blocks a request. 'unknown' until the coverage rules exist (TSK-0022).
  coverage_result text NOT NULL CHECK (coverage_result IN ('in_coverage', 'boundary', 'out_of_coverage', 'unknown')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX properties_address ON crm.properties (zip, lower(street));

-- Record relationships (HH-DATA-01): which properties a customer is authorized for.
CREATE TABLE crm.customer_properties (
  customer_id  uuid NOT NULL REFERENCES crm.customers (id),
  property_id  uuid NOT NULL REFERENCES crm.properties (id),
  relationship text NOT NULL CHECK (relationship IN ('requester')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, property_id)
);

CREATE TABLE crm.projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            text NOT NULL UNIQUE CHECK (reference ~ '^HH-[0-9A-HJKMNP-TV-Z]{8}$'),
  customer_id          uuid NOT NULL REFERENCES crm.customers (id),
  property_id          uuid NOT NULL REFERENCES crm.properties (id),
  -- The project.lifecycle machine of @handyhub/domain; created 'open' (OWN-DEC-97).
  state                text NOT NULL CHECK (state IN ('open', 'approved', 'completed', 'closed', 'cancellation_review', 'canceled')),
  state_version        integer NOT NULL DEFAULT 1 CHECK (state_version >= 1),
  -- payment.term_default at creation (FACT-PAYMENT-DUE) and the policy version it came from.
  payment_term         text NOT NULL CHECK (payment_term IN ('due_on_receipt')),
  payment_term_version integer NOT NULL,
  responsible_staff_id text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intake.requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference              text NOT NULL UNIQUE CHECK (reference ~ '^HH-[0-9A-HJKMNP-TV-Z]{8}$'),
  project_id             uuid NOT NULL UNIQUE REFERENCES crm.projects (id),
  customer_id            uuid NOT NULL REFERENCES crm.customers (id),
  contact_id             uuid NOT NULL REFERENCES crm.contacts (id),
  property_id            uuid NOT NULL REFERENCES crm.properties (id),
  -- The request.lifecycle machine of @handyhub/domain; created 'received'.
  state                  text NOT NULL CHECK (state IN ('received', 'reviewing', 'needs_information', 'needs_site_visit',
                           'ready_for_estimate', 'estimated', 'declined', 'outside_scope', 'not_served', 'withdrawn',
                           'closed_no_response')),
  state_version          integer NOT NULL DEFAULT 1 CHECK (state_version >= 1),
  source                 text NOT NULL CHECK (source IN ('public_form')),
  -- One request per idempotency key (ENT-Request), besides the API's scoped idempotency record.
  idempotency_key        text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  privacy_notice_version text NOT NULL CHECK (char_length(privacy_notice_version) BETWEEN 1 AND 40),
  form_version           text NOT NULL CHECK (char_length(form_version) BETWEEN 1 AND 40),
  not_sure               boolean NOT NULL,
  description            text CHECK (char_length(description) <= 5000),
  other_services_text    text CHECK (char_length(other_services_text) <= 2000),
  preferred_date         date,
  flexible               boolean NOT NULL,
  need_help_today        boolean NOT NULL,
  time_windows           text[] NOT NULL CHECK (time_windows <@ ARRAY['mornings', 'afternoons', 'evenings', 'weekends', 'any_time']),
  estimate_preference    text NOT NULL CHECK (estimate_preference IN ('online', 'site_visit', 'let_handyhub_decide')),
  preferred_channel      text NOT NULL CHECK (preferred_channel IN ('email', 'call', 'text')),
  -- The SMS opt-in (unchecked by default, HH-INT-22) and marketing permission (separate, HH-PRIV-02) as submitted;
  -- the consent records themselves are kept with the contact step (TSK-0029).
  sms_opt_in             boolean NOT NULL,
  marketing_opt_in       boolean NOT NULL,
  coverage_result        text NOT NULL CHECK (coverage_result IN ('in_coverage', 'boundary', 'out_of_coverage', 'unknown')),
  -- Quiet spam controls only flag a request for review; nothing is silently discarded (HH-INT-11).
  spam_suspected         boolean NOT NULL,
  spam_signals           text[] NOT NULL DEFAULT '{}',
  -- The exact submitted inputs (without the spam-control fields), never edited.
  original_submission    jsonb NOT NULL CHECK (jsonb_typeof(original_submission) = 'object'),
  responsible_staff_id   text,
  CHECK (flexible OR preferred_date IS NOT NULL),
  CHECK (NOT ('any_time' = ANY (time_windows)) OR cardinality(time_windows) = 1)
);
CREATE INDEX requests_received ON intake.requests (submitted_at) WHERE state = 'received';

-- The original submission and its identity never change; only state, assignment and their versions do.
CREATE FUNCTION intake.request_original_unchanged() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['state', 'state_version', 'responsible_staff_id'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'state_version', 'responsible_staff_id']) THEN
    RAISE EXCEPTION 'ORIGINAL_SUBMISSION: a request''s original submission is never edited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER requests_original_unchanged BEFORE UPDATE ON intake.requests
  FOR EACH ROW EXECUTE FUNCTION intake.request_original_unchanged();
CREATE TRIGGER requests_no_delete BEFORE DELETE ON intake.requests
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

CREATE TABLE intake.request_services (
  request_id      uuid NOT NULL REFERENCES intake.requests (id),
  position        smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  service_id      text NOT NULL REFERENCES catalog.services (id),
  service_version integer NOT NULL,
  notes           text CHECK (char_length(notes) <= 2000),
  PRIMARY KEY (request_id, service_id),
  UNIQUE (request_id, position)
);

-- Answers with units and approximate values; "I don't know" is stored as unknown, never as zero (HH-SVC-03).
CREATE TABLE intake.request_answers (
  request_id   uuid NOT NULL REFERENCES intake.requests (id),
  service_id   text REFERENCES catalog.services (id),
  question_key text NOT NULL CHECK (question_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  value_kind   text NOT NULL CHECK (value_kind IN ('number', 'text', 'unknown')),
  value_number numeric,
  value_text   text CHECK (char_length(value_text) <= 2000),
  unit         text CHECK (unit ~ '^[a-z][a-z0-9_]{0,23}$'),
  approximate  boolean NOT NULL DEFAULT false,
  CHECK ((value_kind = 'number') = (value_number IS NOT NULL)),
  CHECK ((value_kind = 'text') = (value_text IS NOT NULL)),
  CHECK (value_kind = 'number' OR (unit IS NULL AND NOT approximate))
);
CREATE UNIQUE INDEX request_answers_one ON intake.request_answers (request_id, coalesce(service_id, ''), question_key);

-- Fixed-window rate counters shared by every instance (HH-INT-11); keys are HMAC hashes, never raw addresses.
CREATE TABLE platform.rate_counters (
  bucket       text NOT NULL CHECK (bucket ~ '^[a-z][a-z0-9_-]{0,63}$'),
  key_hash     text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{32}$'),
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL CHECK (hits >= 1),
  PRIMARY KEY (bucket, key_hash, window_start)
);
