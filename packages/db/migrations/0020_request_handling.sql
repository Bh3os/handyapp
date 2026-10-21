-- 0020 Staff request handling (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-LEAD-08, HH-SVC-04, OWN-DEC-99, OWN-DEC-100,
-- OWN-DEC-116, RULE-SERVER-AUTHZ).
-- - The original submission stays as it was sent: intake.requests already refuses edits to everything but its state,
--   assignment and their version; its services and answers now refuse every change too.
-- - Handling a request appends history and never rewrites it: who was made responsible (and by whom), each saved
--   qualification, internal notes, and every decision with its reason. None of these rows is updated or deleted.
-- - Internal notes are staff-only: they are a separate table from anything a customer can read, and the visibility
--   column admits only 'internal' (customer messages are a separate record, TSK-0050).
-- - Several services form one project with one work package per service (HH-SVC-04). Packages are created when staff
--   choose the estimating route, 'planned' until approval and the job (TSK-0057) take them further.
CREATE SCHEMA IF NOT EXISTS work;
COMMENT ON SCHEMA work IS 'Project scope: work packages (HH-SVC-04), and later the job and its tasks.';

-- The submitted services and answers are part of the original submission (ENT-Request: never edited).
CREATE TRIGGER request_services_append_only BEFORE UPDATE OR DELETE ON intake.request_services
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER request_answers_append_only BEFORE UPDATE OR DELETE ON intake.request_answers
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Exactly one responsible staff member at a time (intake.requests.responsible_staff_id); every assignment and
-- reassignment is one row here (HH-LEAD-01).
CREATE TABLE intake.request_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES intake.requests (id),
  staff_user_id          uuid NOT NULL REFERENCES identity.staff_users (id),
  previous_staff_user_id uuid REFERENCES identity.staff_users (id),
  assigned_by            uuid NOT NULL REFERENCES identity.staff_users (id),
  assigned_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_staff_user_id IS DISTINCT FROM staff_user_id)
);
CREATE INDEX request_assignments_request ON intake.request_assignments (request_id, assigned_at);
CREATE TRIGGER request_assignments_append_only BEFORE UPDATE OR DELETE ON intake.request_assignments
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Staff qualification (HH-LEAD-02): each save is a new revision; the latest is current. Classification is by staff;
-- AI classification stays off (RULE-AI-WAVE2). The checks object is validated by the API (one outcome per check).
CREATE TABLE intake.request_qualifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES intake.requests (id),
  revision    integer NOT NULL CHECK (revision >= 1),
  checks      jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'object'),
  recorded_by uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, revision)
);
CREATE TRIGGER request_qualifications_append_only BEFORE UPDATE OR DELETE ON intake.request_qualifications
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Internal notes: staff-only, never shown to customers (HH-LEAD-02, HH-COM-01). A correction is a new note.
CREATE TABLE intake.request_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES intake.requests (id),
  project_id      uuid NOT NULL REFERENCES crm.projects (id),
  author_staff_id uuid NOT NULL REFERENCES identity.staff_users (id),
  visibility      text NOT NULL DEFAULT 'internal' CHECK (visibility = 'internal'),
  body            text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_notes_request ON intake.request_notes (request_id, created_at);
CREATE TRIGGER request_notes_append_only BEFORE UPDATE OR DELETE ON intake.request_notes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- Every staff decision on a request, with its reason, kept in the project history (HH-LEAD-01, HH-LEAD-02). Not a Fit
-- keeps its reason category, the plain-language reason the customer sees and the staff-only note (OWN-DEC-100); a
-- request with accepted work, an appointment or money is routed to the Owner instead of closing.
CREATE TABLE intake.request_decisions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         uuid NOT NULL REFERENCES intake.requests (id),
  project_id         uuid NOT NULL REFERENCES crm.projects (id),
  action             text NOT NULL CHECK (action IN ('ask_question', 'prepare_online_estimate',
                       'arrange_estimate_visit', 'not_a_fit', 'not_a_fit_owner_review')),
  -- The request.lifecycle event, or the project event for the Owner routing.
  event              text NOT NULL CHECK (event ~ '^[a-z][a-z0-9_]*$' AND char_length(event) <= 60),
  from_state         text NOT NULL,
  to_state           text NOT NULL,
  project_from_state text,
  project_to_state   text,
  reason_category    text CHECK (reason_category IN ('coverage', 'outside_scope', 'specialist_assessment', 'other')),
  -- Customer-visible text: the Not a Fit plain-language reason, or the site-visit explanation (OWN-DEC-99).
  customer_text      text CHECK (char_length(btrim(customer_text)) BETWEEN 1 AND 1000),
  -- Staff-only: internal risk notes stay private (OWN-DEC-100).
  internal_note      text CHECK (char_length(internal_note) <= 5000),
  decided_by         uuid NOT NULL REFERENCES identity.staff_users (id),
  decided_at         timestamptz NOT NULL DEFAULT now(),
  -- The request's version after the decision.
  request_version    integer NOT NULL CHECK (request_version >= 1),
  CHECK (action NOT IN ('not_a_fit', 'not_a_fit_owner_review')
         OR (reason_category IS NOT NULL AND customer_text IS NOT NULL)),
  CHECK (action <> 'arrange_estimate_visit' OR customer_text IS NOT NULL),
  CHECK ((project_from_state IS NULL) = (project_to_state IS NULL))
);
CREATE INDEX request_decisions_request ON intake.request_decisions (request_id, decided_at);
CREATE TRIGGER request_decisions_append_only BEFORE UPDATE OR DELETE ON intake.request_decisions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();

-- One work package per service of the project (HH-SVC-04; ENT-WorkPackage states). The job link is set by the
-- approval (TSK-0057); readiness, dependencies, SOP checklist and quality checks attach to the package later
-- (TSK-0068). A package is never deleted, and keeps its project, request and service.
CREATE TABLE work.work_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES crm.projects (id),
  request_id      uuid NOT NULL REFERENCES intake.requests (id),
  service_id      text NOT NULL REFERENCES catalog.services (id),
  service_version integer NOT NULL CHECK (service_version >= 1),
  position        smallint NOT NULL CHECK (position >= 1),
  state           text NOT NULL DEFAULT 'planned'
                    CHECK (state IN ('planned', 'ready', 'in_progress', 'complete', 'blocked')),
  job_id          uuid,
  created_by      uuid NOT NULL REFERENCES identity.staff_users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (project_id, service_id),
  UNIQUE (project_id, position)
);
CREATE INDEX work_packages_request ON work.work_packages (request_id);

CREATE FUNCTION work.work_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'work packages are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.project_id, NEW.request_id, NEW.service_id, NEW.service_version, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.project_id, OLD.request_id, OLD.service_id, OLD.service_version, OLD.created_by,
                       OLD.created_at) THEN
    RAISE EXCEPTION 'a work package keeps its project, request and service' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_packages_guard BEFORE UPDATE OR DELETE ON work.work_packages
  FOR EACH ROW EXECUTE FUNCTION work.work_package_guard();
COMMENT ON TABLE work.work_packages IS 'One work package per service of a project (HH-SVC-04, ENT-WorkPackage).';
