-- 0044 The approval transaction: the customer's approval of one exact estimate version, the job it creates, the job's
-- first scope snapshot and its scheduling task (TSK-0057; HH-EST-06, HH-EST-07, HH-EST-08, HH-ID-07, HH-API-04,
-- HH-DATA-04, T32, T33, T34, ENT-Approval, ENT-Job, ENT-JobScopeSnapshot, ENT-SchedulingTask, OWN-DEC-103,
-- OWN-DEC-104, OWN-DEC-105, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ).
-- - approval_selections: the options a customer has selected on a version before approving, so a verification that
--   went stale (HH-ID-07) never loses them: kept on the server per version and verified contact, besides the page.
--   Working data, not evidence: it is replaced as the customer changes it and removed when the version is approved.
-- - approvals: the evidence that a verified customer approved one exact published version (ENT-Approval). It pins the
--   version and the SHA-256 of its customer content (and of the uploaded customer PDF), the selected options, the
--   approved totals and deposit in integer cents (computed by the server from the version's own line amounts and the
--   policy versions the version pinned), the terms document ID, hash and policy version, the payment term with the
--   words shown, the privacy-notice version, the typed full name, the verified contact, the access used (the grant or
--   the account and its session, with when the session was verified), the method, the TEST mark, the necessary
--   security metadata (the client address the server saw and the user agent: no device fingerprint), the idempotency
--   key and the server time. At most one per version; append-only (never edited or deleted).
-- - jobs: the operational commitment created from one approval (ENT-Job): one per project and one per approval, so a
--   retry, a second tab or a race can never create a second one. Created pending_preparation; later states belong to
--   their own tasks.
-- - job_scope_snapshots: the immutable copy of the approved scope and price on the job (ENT-JobScopeSnapshot).
--   Version 1 comes from the approval; each approved change order adds a version (TSK-0082). Append-only.
-- - scheduling_tasks: the staff work item to schedule the job's work visits (ENT-SchedulingTask), one per job, created
--   open. Never shown to the customer as a booking; fulfilled only after a committed visit (TSK-0061 builds visits).
-- - work_packages.job_id: set once, by the approval, to the job of the same project.
-- Nothing here confirms an appointment, reserves capacity or marks a deposit paid (OWN-DEC-103, HH-EST-08).

CREATE TABLE estimating.approval_selections (
  version_id  uuid NOT NULL REFERENCES estimating.estimate_versions (id),
  contact_ref text NOT NULL CHECK (char_length(contact_ref) BETWEEN 1 AND 200),
  -- The selected option lines by their position on the version (published lines never change).
  options     smallint[] NOT NULL DEFAULT '{}' CHECK (cardinality(options) <= 200),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, contact_ref)
);
COMMENT ON TABLE estimating.approval_selections IS
  'Options a customer selected before approving, kept on the server across a stale verification (HH-ID-07).';

CREATE TABLE estimating.approvals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES crm.projects (id),
  estimate_id           uuid NOT NULL REFERENCES estimating.estimates (id),
  version_id            uuid NOT NULL UNIQUE,
  version               integer NOT NULL CHECK (version >= 1),
  -- The exact content the customer viewed: SHA-256 of the version's canonical customer content, and of the published
  -- customer PDF of an uploaded estimate.
  content_sha256        text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  authoring_method      text NOT NULL CHECK (authoring_method IN ('written', 'uploaded')),
  document_sha256       text CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  selected_options      smallint[] NOT NULL DEFAULT '{}',
  subtotal_cents        bigint NOT NULL CHECK (subtotal_cents > 0),
  discount_cents        bigint NOT NULL CHECK (discount_cents >= 0),
  total_cents           bigint NOT NULL CHECK (total_cents > 0),
  deposit_state         text NOT NULL CHECK (deposit_state IN ('required', 'not_required')),
  deposit_cents         bigint,
  deposit_rule_version  integer NOT NULL CHECK (deposit_rule_version >= 1),
  discount_rule_version integer CHECK (discount_rule_version >= 1),
  terms_document_id     text NOT NULL CHECK (char_length(terms_document_id) BETWEEN 1 AND 60),
  terms_sha256          text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  terms_policy_version  integer NOT NULL CHECK (terms_policy_version >= 1),
  payment_term          text NOT NULL CHECK (payment_term IN ('due_on_receipt')),
  payment_term_version  integer NOT NULL CHECK (payment_term_version >= 1),
  payment_term_text     text NOT NULL CHECK (char_length(payment_term_text) BETWEEN 1 AND 500),
  privacy_notice_id     text CHECK (char_length(privacy_notice_id) BETWEEN 1 AND 60),
  -- "I have read and accept the estimate terms" was ticked (unchecked by default), and the name was typed.
  terms_accepted        boolean NOT NULL CHECK (terms_accepted),
  full_name             text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 200),
  contact_ref           text NOT NULL CHECK (char_length(contact_ref) BETWEEN 1 AND 200),
  access_via            text NOT NULL CHECK (access_via IN ('grant', 'account')),
  grant_id              uuid REFERENCES identity.project_access_grants (id),
  account_id            uuid REFERENCES identity.customer_accounts (id),
  customer_session_id   uuid NOT NULL REFERENCES identity.customer_sessions (id),
  verified_at           timestamptz NOT NULL,
  method                text NOT NULL CHECK (method IN ('portal')),
  test_mark             boolean NOT NULL,
  client_address        text CHECK (char_length(client_address) BETWEEN 1 AND 100),
  user_agent            text CHECK (char_length(user_agent) BETWEEN 1 AND 400),
  idempotency_key       text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id),
  CONSTRAINT approvals_version FOREIGN KEY (version_id, estimate_id)
    REFERENCES estimating.estimate_versions (id, estimate_id),
  CONSTRAINT approvals_totals CHECK (total_cents = subtotal_cents - discount_cents),
  CONSTRAINT approvals_deposit CHECK (
    (deposit_state = 'required') = (deposit_cents IS NOT NULL)
    AND (deposit_cents IS NULL OR (deposit_cents > 0 AND deposit_cents <= total_cents))),
  CONSTRAINT approvals_access CHECK (
    (access_via = 'grant') = (grant_id IS NOT NULL) AND (access_via = 'account') = (account_id IS NOT NULL)),
  CONSTRAINT approvals_document CHECK ((authoring_method = 'uploaded') = (document_sha256 IS NOT NULL)),
  CONSTRAINT approvals_full_name_trimmed CHECK (full_name = btrim(full_name))
);
CREATE INDEX approvals_project ON estimating.approvals (project_id, created_at);
COMMENT ON TABLE estimating.approvals IS
  'A verified customer''s approval of one exact estimate version (ENT-Approval): append-only, one per version.';

-- An approval is written in the version's own move to accepted, for the version's project and number; it is never
-- changed or deleted.
CREATE FUNCTION estimating.approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'approvals are append-only: they are never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT project_id, version, state, authoring_method, subtotal_cents INTO v
    FROM estimating.estimate_versions WHERE id = NEW.version_id;
  IF v.state IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'an approval is recorded with its version''s move to accepted' USING ERRCODE = 'check_violation';
  END IF;
  IF (v.project_id, v.version, v.authoring_method) IS DISTINCT FROM (NEW.project_id, NEW.version, NEW.authoring_method)
  THEN
    RAISE EXCEPTION 'an approval names its version''s project, number and method' USING ERRCODE = 'check_violation';
  END IF;
  -- The base lines are always part of the approved scope; options only add to them.
  IF NEW.subtotal_cents < v.subtotal_cents THEN
    RAISE EXCEPTION 'an approved subtotal is never below the version''s base subtotal' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approvals_guard BEFORE INSERT OR UPDATE OR DELETE ON estimating.approvals
  FOR EACH ROW EXECUTE FUNCTION estimating.approval_guard();

CREATE TABLE work.jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL UNIQUE REFERENCES crm.projects (id),
  approval_id       uuid NOT NULL UNIQUE,
  -- ENT-Job operational states; the transitions after pending_preparation belong to their own tasks.
  operational_state text NOT NULL DEFAULT 'pending_preparation' CHECK (operational_state IN ('pending_preparation',
                      'ready', 'in_progress', 'paused', 'ready_for_qa', 'operationally_complete', 'closed',
                      'reopened')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (id, project_id),
  CONSTRAINT jobs_approval FOREIGN KEY (approval_id, project_id) REFERENCES estimating.approvals (id, project_id)
);
COMMENT ON TABLE work.jobs IS 'The operational commitment created from one approval (ENT-Job): one per project.';

-- A job starts pending preparation on an approved project; it keeps its project, approval and creation time and is
-- never deleted.
CREATE FUNCTION work.job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'jobs are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.operational_state <> 'pending_preparation' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a job is created pending preparation' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM crm.projects WHERE id = NEW.project_id AND state = 'approved') THEN
      RAISE EXCEPTION 'a job is created for an approved project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.project_id, NEW.approval_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.approval_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a job keeps its project and approval' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_guard BEFORE INSERT OR UPDATE OR DELETE ON work.jobs
  FOR EACH ROW EXECUTE FUNCTION work.job_guard();

CREATE TABLE work.job_scope_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES work.jobs (id),
  version             integer NOT NULL CHECK (version >= 1),
  source              text NOT NULL CHECK (source IN ('approval', 'change_order')),
  approval_id         uuid REFERENCES estimating.approvals (id),
  estimate_version_id uuid REFERENCES estimating.estimate_versions (id),
  -- The approved lines (the base lines and the selected options) as the customer saw them, and every other
  -- customer-facing text of the version (scope, exclusions, assumptions, responsibilities, dependencies).
  lines               jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) >= 1),
  texts               jsonb NOT NULL CHECK (jsonb_typeof(texts) = 'object'),
  exclusions          text[] NOT NULL,
  selected_options    smallint[] NOT NULL,
  subtotal_cents      bigint NOT NULL CHECK (subtotal_cents > 0),
  discount_cents      bigint NOT NULL CHECK (discount_cents >= 0),
  total_cents         bigint NOT NULL CHECK (total_cents > 0),
  terms_document_id   text NOT NULL CHECK (char_length(terms_document_id) BETWEEN 1 AND 60),
  terms_sha256        text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  -- SHA-256 of the snapshot's own canonical content.
  content_sha256      text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version),
  CONSTRAINT job_scope_snapshots_totals CHECK (total_cents = subtotal_cents - discount_cents),
  CONSTRAINT job_scope_snapshots_first CHECK (
    (source = 'approval') = (version = 1)
    AND (source <> 'approval' OR (approval_id IS NOT NULL AND estimate_version_id IS NOT NULL)))
);
CREATE UNIQUE INDEX job_scope_snapshots_one_per_approval ON work.job_scope_snapshots (approval_id)
  WHERE approval_id IS NOT NULL;
CREATE TRIGGER job_scope_snapshots_append_only BEFORE UPDATE OR DELETE ON work.job_scope_snapshots
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.job_scope_snapshots IS
  'Immutable copies of the approved scope and price on a job (ENT-JobScopeSnapshot); version 1 from the approval.';

CREATE TABLE work.scheduling_tasks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  purpose    text NOT NULL DEFAULT 'work_visits' CHECK (purpose IN ('work_visits')),
  state      text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'planning', 'fulfilled', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT scheduling_tasks_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
COMMENT ON TABLE work.scheduling_tasks IS
  'The staff work item to schedule a job''s work visits (ENT-SchedulingTask): one per job, never a booking.';

-- A scheduling task starts open; it keeps its job; it is never deleted; it is fulfilled only after a committed visit,
-- and no committed work visit exists before the visit model (TSK-0061), so nothing fulfils it yet.
CREATE FUNCTION work.scheduling_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scheduling tasks are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'a scheduling task is created open' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.job_id, NEW.project_id, NEW.purpose, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.job_id, OLD.project_id, OLD.purpose, OLD.created_at) THEN
    RAISE EXCEPTION 'a scheduling task keeps its job and purpose' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = 'fulfilled' AND OLD.state <> 'fulfilled' THEN
    RAISE EXCEPTION 'a scheduling task is fulfilled only after a committed visit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scheduling_tasks_guard BEFORE INSERT OR UPDATE OR DELETE ON work.scheduling_tasks
  FOR EACH ROW EXECUTE FUNCTION work.scheduling_task_guard();

-- The approval links the project's work packages to its job, once, and only to the job of the same project.
ALTER TABLE work.work_packages
  ADD CONSTRAINT work_packages_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id);
CREATE FUNCTION work.work_package_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.job_id IS NOT NULL AND NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'a work package keeps the job it was approved into' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_packages_job_guard BEFORE UPDATE ON work.work_packages
  FOR EACH ROW EXECUTE FUNCTION work.work_package_job_guard();
