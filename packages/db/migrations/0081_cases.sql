-- 0081 Cases: complaints, incidents, damage, injury and disputes (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04,
-- ENT-Case, ENT-Hold, ENT-Photo, OWN-DEC-124, OWN-DEC-143, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ).
-- The server decides who may read what (apps/server/src/modules/cases); this migration keeps the records factual and
-- complete whatever code path writes:
-- - quality.cases: one tracked issue linked to a project (and its job when known). Complaints carry a category,
--   severity, assigned person and due date; incident, damage, injury and dispute cases carry the reported type and
--   keep their details in the restricted section below. One open complaint per project and category (staff are
--   offered "add to existing case" instead). States follow the two lifecycles of ENT-Case; closing needs a recorded
--   resolution, the re-check when one is required and no open follow-up item. The current hold is a link to
--   work.holds of the same project; a hazard report of TSK-0077 is a nullable link (its foreign key is TSK-0077's).
--   Nothing here holds fault, liability, coverage or compensation: those are the Owner's decisions (RULE-HUMAN-REVIEW).
-- - quality.incident_reports: the restricted factual report of a non-complaint case (what happened, people affected,
--   work areas, immediate actions and only the medical detail that is necessary), one per case, append-only.
-- - quality.case_notes: complaint descriptions and additions (internal_operational) and restricted notes
--   (restricted_incident), append-only; the class follows the case kind and never changes.
-- - quality.case_attachments: supporting photos, private, in the class of their case; never in the project gallery
--   or any worker-wide feed (they are not intake or field photos).
-- - quality.case_follow_ups: corrective work as assigned items with a due date (open, done or canceled).
-- - quality.case_referrals: the Owner's own record of an insurer, attorney or other professional referral,
--   append-only, written only by an Owner; nothing else ever says a professional was contacted.
-- - quality.case_customer_updates: neutral customer updates drafted by staff and released after review; a released
--   update is never changed or withdrawn, so the customer's history stays truthful.
-- - quality.case_events: every state change with who, when and the note given, append-only (history kept).

CREATE SCHEMA quality;

CREATE SEQUENCE quality.case_numbers AS integer START 1;

CREATE TABLE quality.cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number           integer NOT NULL UNIQUE DEFAULT nextval('quality.case_numbers'),
  project_id       uuid NOT NULL REFERENCES crm.projects (id),
  job_id           uuid,
  kind             text NOT NULL CHECK (kind IN ('complaint', 'incident', 'damage', 'injury', 'dispute')),
  -- What the reporter said happened (non-complaint kinds only).
  incident_type    text CHECK (incident_type IN ('injury', 'near_miss', 'property_damage', 'exposure_concern',
                     'customer_conflict', 'equipment_failure', 'dispute', 'other')),
  category         text CHECK (category IN ('work_quality', 'conduct', 'schedule', 'billing', 'other')),
  severity         text CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  source           text NOT NULL CHECK (source IN ('walkthrough', 'message', 'call', 'worker_report')),
  state            text NOT NULL,
  reported_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  reported_at      timestamptz NOT NULL DEFAULT now(),
  assigned_to      uuid REFERENCES identity.staff_users (id),
  due_on           date,
  -- The responsible reviewer: an Owner (HH-INC-01, HH-INC-04).
  reviewer_id      uuid REFERENCES identity.staff_users (id),
  -- The current hold of the case (a hold of the same project), and the hazard report of TSK-0077, if any.
  hold_id          uuid REFERENCES work.holds (id),
  hazard_report_id uuid,
  resolution       text CHECK (char_length(btrim(resolution)) BETWEEN 1 AND 2000),
  resolved_by      uuid REFERENCES identity.staff_users (id),
  resolved_at      timestamptz,
  recheck_required boolean NOT NULL DEFAULT false,
  recheck_note     text CHECK (char_length(btrim(recheck_note)) BETWEEN 1 AND 1000),
  recheck_by       uuid REFERENCES identity.staff_users (id),
  recheck_at       timestamptz,
  closed_by        uuid REFERENCES identity.staff_users (id),
  closed_at        timestamptz,
  reopen_count     integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cases_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT cases_complaint_fields CHECK (
    kind <> 'complaint'
    OR (category IS NOT NULL AND incident_type IS NULL AND severity IS NOT NULL AND assigned_to IS NOT NULL
        AND due_on IS NOT NULL AND source IN ('walkthrough', 'message', 'call'))),
  CONSTRAINT cases_incident_fields CHECK (
    kind = 'complaint' OR (category IS NULL AND incident_type IS NOT NULL)),
  CONSTRAINT cases_incident_kind CHECK (
    kind = 'complaint'
    OR ((kind = 'injury') = (incident_type = 'injury') AND (kind = 'damage') = (incident_type = 'property_damage')
        AND (kind = 'dispute') = (incident_type = 'dispute'))),
  CONSTRAINT cases_state CHECK (
    (kind = 'complaint' AND state IN ('open', 'acknowledged', 'investigating', 'action_pending', 'resolved', 'closed'))
    OR (kind <> 'complaint' AND state IN ('reported', 'triaged', 'action_pending', 'resolution_review', 'closed'))),
  CONSTRAINT cases_resolution CHECK (
    state NOT IN ('resolved', 'resolution_review', 'closed')
    OR (resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT cases_recheck CHECK ((recheck_at IS NULL) = (recheck_by IS NULL) AND (recheck_at IS NULL) = (recheck_note IS NULL)),
  CONSTRAINT cases_closed CHECK (
    (state = 'closed') = (closed_at IS NOT NULL) AND (closed_at IS NULL) = (closed_by IS NULL)
    AND (state <> 'closed' OR NOT recheck_required OR recheck_at IS NOT NULL))
);
-- No duplicate open complaint for the same project and category (HH-QA-06).
CREATE UNIQUE INDEX cases_one_open_complaint ON quality.cases (project_id, category)
  WHERE kind = 'complaint' AND state <> 'closed';
CREATE INDEX cases_project ON quality.cases (project_id, state);
CREATE INDEX cases_open ON quality.cases (reported_at) WHERE state <> 'closed';
COMMENT ON TABLE quality.cases IS
  'Cases (ENT-Case): complaints, incidents, damage, injury and disputes; never fault, liability or compensation.';

-- A case starts in its first state, keeps what was reported, links a hold of its own project, and closes only with no
-- open follow-up item. Its reviewer is an Owner.
CREATE FUNCTION quality.case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  first_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cases are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    first_state := CASE WHEN NEW.kind = 'complaint' THEN 'open' ELSE 'reported' END;
    IF NEW.state <> first_state OR NEW.version <> 1
       OR NEW.resolution IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.reopen_count <> 0 THEN
      RAISE EXCEPTION 'a case is created in its first state' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF (NEW.id, NEW.number, NEW.project_id, NEW.kind, NEW.incident_type, NEW.source, NEW.reported_by, NEW.reported_at)
       IS DISTINCT FROM
       (OLD.id, OLD.number, OLD.project_id, OLD.kind, OLD.incident_type, OLD.source, OLD.reported_by, OLD.reported_at)
       OR (OLD.job_id IS NOT NULL AND NEW.job_id IS DISTINCT FROM OLD.job_id)
       OR (NEW.category IS DISTINCT FROM OLD.category) THEN
      RAISE EXCEPTION 'a case keeps what was reported' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'a case change takes the next version' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.state = 'closed' AND OLD.state <> 'closed'
       AND EXISTS (SELECT 1 FROM quality.case_follow_ups WHERE case_id = NEW.id AND state = 'open') THEN
      RAISE EXCEPTION 'a case closes only with no open follow-up item' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.hold_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM work.holds WHERE id = NEW.hold_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'a case links a hold of its own project' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reviewer_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id)
     AND NOT work.has_live_role(NEW.reviewer_id, 'owner') THEN
    RAISE EXCEPTION 'the reviewer of a case is an Owner' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cases_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.cases
  FOR EACH ROW EXECUTE FUNCTION quality.case_guard();

-- Rows of a case written in the class its kind requires: restricted_incident for every non-complaint case.
CREATE FUNCTION quality.case_class_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k text;
  required text;
BEGIN
  SELECT kind INTO k FROM quality.cases WHERE id = NEW.case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a % row names a case', TG_TABLE_NAME USING ERRCODE = 'foreign_key_violation';
  END IF;
  required := CASE WHEN k = 'complaint' THEN 'internal_operational' ELSE 'restricted_incident' END;
  IF (to_jsonb(NEW) ->> 'visibility_class') IS DISTINCT FROM required THEN
    RAISE EXCEPTION 'a % row of a % case has the class its kind requires', TG_TABLE_NAME, k
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- The restricted incident report ------------------------------------------------------------------------------------
CREATE TABLE quality.incident_reports (
  case_id           uuid PRIMARY KEY REFERENCES quality.cases (id),
  occurred_at       timestamptz,
  what_happened     text NOT NULL CHECK (char_length(btrim(what_happened)) BETWEEN 1 AND 4000),
  people_affected   text CHECK (char_length(btrim(people_affected)) BETWEEN 1 AND 1000),
  work_areas        text CHECK (char_length(btrim(work_areas)) BETWEEN 1 AND 1000),
  immediate_actions text CHECK (char_length(btrim(immediate_actions)) BETWEEN 1 AND 2000),
  -- Only the medical detail that is necessary (HH-INC-01).
  medical_detail    text CHECK (char_length(btrim(medical_detail)) BETWEEN 1 AND 1000),
  visibility_class  text NOT NULL DEFAULT 'restricted_incident' CHECK (visibility_class = 'restricted_incident'),
  reported_by       uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER incident_reports_append_only BEFORE UPDATE OR DELETE ON quality.incident_reports
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER incident_reports_class BEFORE INSERT ON quality.incident_reports
  FOR EACH ROW EXECUTE FUNCTION quality.case_class_check();
COMMENT ON TABLE quality.incident_reports IS
  'The restricted factual report of an incident, damage, injury or dispute case (HH-INC-01, HH-INC-02).';

-- Notes --------------------------------------------------------------------------------------------------------------
CREATE TABLE quality.case_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES quality.cases (id),
  kind             text NOT NULL CHECK (kind IN ('description', 'addition', 'note')),
  -- Where an addition came from ("add to existing case").
  source           text CHECK (source IN ('walkthrough', 'message', 'call', 'worker_report')),
  body             text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  visibility_class text NOT NULL CHECK (visibility_class IN ('internal_operational', 'restricted_incident')),
  written_by       uuid NOT NULL REFERENCES identity.staff_users (id),
  written_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_notes_source CHECK ((kind = 'addition') = (source IS NOT NULL))
);
CREATE INDEX case_notes_case ON quality.case_notes (case_id, written_at);
CREATE TRIGGER case_notes_append_only BEFORE UPDATE OR DELETE ON quality.case_notes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER case_notes_class BEFORE INSERT ON quality.case_notes
  FOR EACH ROW EXECUTE FUNCTION quality.case_class_check();

-- Attachments ---------------------------------------------------------------------------------------------------------
CREATE TABLE quality.case_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES quality.cases (id),
  object_key       text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 1 AND 300),
  content_type     text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size        integer NOT NULL CHECK (byte_size > 0),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  visibility_class text NOT NULL CHECK (visibility_class IN ('internal_operational', 'restricted_incident')),
  uploaded_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_attachments_once UNIQUE (case_id, sha256)
);
CREATE TRIGGER case_attachments_append_only BEFORE UPDATE OR DELETE ON quality.case_attachments
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER case_attachments_class BEFORE INSERT ON quality.case_attachments
  FOR EACH ROW EXECUTE FUNCTION quality.case_class_check();
COMMENT ON TABLE quality.case_attachments IS
  'Supporting photos of a case, private in the class of their case; never in the project gallery or a worker feed.';

-- Follow-up items -----------------------------------------------------------------------------------------------------
CREATE TABLE quality.case_follow_ups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES quality.cases (id),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  assigned_to uuid NOT NULL REFERENCES identity.staff_users (id),
  due_on      date NOT NULL,
  state       text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'canceled')),
  created_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_note   text CHECK (char_length(btrim(done_note)) BETWEEN 1 AND 1000),
  done_by     uuid REFERENCES identity.staff_users (id),
  done_at     timestamptz,
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT case_follow_ups_done CHECK (
    (state = 'open') = (done_at IS NULL) AND (done_at IS NULL) = (done_by IS NULL)
    AND (state = 'open' OR done_note IS NOT NULL))
);
CREATE INDEX case_follow_ups_case ON quality.case_follow_ups (case_id, state);
CREATE FUNCTION quality.case_follow_up_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'follow-up items are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a follow-up item is created open' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM quality.cases WHERE id = NEW.case_id AND state = 'closed') THEN
      RAISE EXCEPTION 'a closed case takes no new follow-up item' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'open' OR (NEW.id, NEW.case_id, NEW.description, NEW.assigned_to, NEW.due_on, NEW.created_by,
      NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.case_id, OLD.description, OLD.assigned_to, OLD.due_on,
      OLD.created_by, OLD.created_at) OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a follow-up item only moves from open to done or canceled' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_follow_ups_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.case_follow_ups
  FOR EACH ROW EXECUTE FUNCTION quality.case_follow_up_guard();

-- Professional referrals (the Owner's own record) ---------------------------------------------------------------------
CREATE TABLE quality.case_referrals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES quality.cases (id),
  professional text NOT NULL CHECK (professional IN ('insurer', 'attorney', 'other_professional')),
  note         text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  referred_on  date NOT NULL,
  recorded_by  uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_referrals_case ON quality.case_referrals (case_id, recorded_at);
CREATE TRIGGER case_referrals_append_only BEFORE UPDATE OR DELETE ON quality.case_referrals
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE FUNCTION quality.case_referral_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT work.has_live_role(NEW.recorded_by, 'owner') THEN
    RAISE EXCEPTION 'only an Owner records a professional referral' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_referrals_check BEFORE INSERT ON quality.case_referrals
  FOR EACH ROW EXECUTE FUNCTION quality.case_referral_check();

-- Customer updates ----------------------------------------------------------------------------------------------------
CREATE TABLE quality.case_customer_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES quality.cases (id),
  kind         text NOT NULL CHECK (kind IN ('acknowledgment', 'progress', 'next_step', 'safety_pause')),
  detail       text CHECK (char_length(btrim(detail)) BETWEEN 1 AND 500),
  -- The exact customer text, composed from the template when drafted; what the reviewer released.
  body         text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 700),
  state        text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'released', 'withdrawn')),
  drafted_by   uuid NOT NULL REFERENCES identity.staff_users (id),
  drafted_at   timestamptz NOT NULL DEFAULT now(),
  released_by  uuid REFERENCES identity.staff_users (id),
  released_at  timestamptz,
  withdrawn_by uuid REFERENCES identity.staff_users (id),
  withdrawn_at timestamptz,
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT case_customer_updates_detail CHECK ((kind IN ('progress', 'next_step')) = (detail IS NOT NULL)),
  CONSTRAINT case_customer_updates_released CHECK (
    (state = 'released') = (released_at IS NOT NULL) AND (released_at IS NULL) = (released_by IS NULL)),
  CONSTRAINT case_customer_updates_withdrawn CHECK (
    (state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL))
);
CREATE INDEX case_customer_updates_case ON quality.case_customer_updates (case_id, state, released_at);
CREATE FUNCTION quality.case_customer_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'customer updates are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a customer update starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'draft' OR (NEW.id, NEW.case_id, NEW.kind, NEW.detail, NEW.body, NEW.drafted_by, NEW.drafted_at)
     IS DISTINCT FROM (OLD.id, OLD.case_id, OLD.kind, OLD.detail, OLD.body, OLD.drafted_by, OLD.drafted_at)
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a customer update is released or withdrawn as drafted, once' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_customer_updates_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.case_customer_updates
  FOR EACH ROW EXECUTE FUNCTION quality.case_customer_update_guard();
COMMENT ON TABLE quality.case_customer_updates IS
  'Neutral customer updates of a case: drafted by staff, shown to the customer only once released after review.';

-- History -------------------------------------------------------------------------------------------------------------
CREATE TABLE quality.case_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES quality.cases (id),
  event      text NOT NULL CHECK (event ~ '^[a-z_]{1,40}$'),
  from_state text,
  to_state   text NOT NULL,
  actor_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  note       text CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_events_case ON quality.case_events (case_id, at);
CREATE TRIGGER case_events_append_only BEFORE UPDATE OR DELETE ON quality.case_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Staging reset (TSK-0141): these are test records with no TRUNCATE guard of their own; only a permitted staging reset
-- clears them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quality.cases', 'quality.incident_reports', 'quality.case_notes',
                           'quality.case_attachments', 'quality.case_follow_ups', 'quality.case_referrals',
                           'quality.case_customer_updates', 'quality.case_events'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
