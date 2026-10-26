-- 0101 Financial closeout, the Owner's reopen, the satisfaction check and review requests (TSK-0092; HH-QA-09,
-- HH-QA-10, HH-STATE-02, HH-DATA-05, HH-COM-05, T56, T64, T67, OWN-DEC-77, OWN-DEC-157, OWN-DEC-113, OWN-DEC-109,
-- OWN-DEC-124, ENT-Job, ENT-Case, ENT-Message, ENT-AuditEvent, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). The server
-- decides who may do what and names every open obligation (apps/server/src/modules/closeout); this migration keeps the
-- records true whatever path writes.
-- 1. work.job_closeout_events: the Owner's close and reopen of a job, append-only. A close names the financial basis
--    it was recorded on (the final invoice paid, or the balance explicitly tracked: a payment plan, a collection hold
--    or the Owner's overdue decision, PROPOSED); a reopen needs the Owner's written reason. Only a live Owner records
--    either (another role, including another administrator, is refused: OWN-DEC-77).
-- 2. work.jobs: a job becomes `closed` only from `operationally_complete` or `reopened`, in the transaction that wrote
--    the Owner's close, with no open case on its project (the quality conditions stay those of 0082); it becomes
--    `reopened` only from `closed`, in the transaction that wrote the Owner's reopen. PROPOSED: an operationally
--    complete job leaves that state only by closing, a closed job only by the Owner's reopen, and a reopened job only by
--    closing again; the original records (review, punch items, invoices, payments) are never changed by either.
-- 3. quality.satisfaction_responses: the customer's answer to the service-quality follow-up as staff recorded it from
--    their reply (PROPOSED: positive, mixed or negative, with an optional note), append-only, by a live Owner or Office.
--    The answer never changes whether a review request may be offered (OWN-DEC-113: no positive-review filtering).
-- 4. The service-quality follow-up (customer_follow_up, MESSAGE 18) version 2: the owner's wording kept as it is, with
--    one added paragraph carrying the secure project link to report a concern or ask for help (OWN-DEC-157 item 8;
--    the added wording is PROPOSED in OQ-CLOSEOUT-DETAILS). English only; email only while texts are off (OWN-DEC-190).
-- 5. Jobs already operationally complete wait for the Owner's close in Owner Decisions (job_closeout). Jobs already
--    operationally complete or closed get one preparation job each for their follow-up: it waits for the
--    configured time after the review passed (reminders.cadences.satisfaction) or, when that has passed, prepares the
--    draft at once; once per job, nothing for a reopened job.

-- 1. The Owner's close and reopen.
CREATE TABLE work.job_closeout_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL,
  project_id      uuid NOT NULL,
  event           text NOT NULL CHECK (event IN ('closed', 'reopened')),
  from_state      text NOT NULL CHECK (from_state IN ('operationally_complete', 'closed', 'reopened')),
  -- A close: what the financial records were when it was recorded.
  financial_basis text CHECK (financial_basis IN ('paid', 'payment_plan', 'collection_hold', 'overdue_decided')),
  -- A reopen: the Owner's reason (required); a close: an optional note.
  reason          text CHECK (char_length(reason) BETWEEN 1 AND 2000 AND reason = btrim(reason)),
  recorded_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The Owner's session the fresh sign-in was checked on (a reopen).
  staff_session_id uuid,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_closeout_events_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT job_closeout_events_basis CHECK ((event = 'closed') = (financial_basis IS NOT NULL)),
  CONSTRAINT job_closeout_events_reason CHECK (event <> 'reopened' OR reason IS NOT NULL),
  CONSTRAINT job_closeout_events_session CHECK (event <> 'reopened' OR staff_session_id IS NOT NULL),
  CONSTRAINT job_closeout_events_from CHECK (
    (event = 'closed' AND from_state IN ('operationally_complete', 'reopened'))
    OR (event = 'reopened' AND from_state = 'closed'))
);
CREATE INDEX job_closeout_events_job ON work.job_closeout_events (job_id, recorded_at);
COMMENT ON TABLE work.job_closeout_events IS
  'The Owner''s close and reopen of a job (HH-QA-09, OWN-DEC-77): who, when, the financial basis or the reason. '
  'Append-only.';

-- Recorded by a live Owner on the job's current state; never changed or deleted.
CREATE FUNCTION work.job_closeout_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  j record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'closeout events are kept as recorded, never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT project_id, operational_state INTO j FROM work.jobs WHERE id = NEW.job_id;
  IF NOT FOUND OR j.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'a closeout event names its job''s own project' USING ERRCODE = 'check_violation';
  END IF;
  IF j.operational_state <> NEW.from_state THEN
    RAISE EXCEPTION 'a closeout event starts from the job''s current state' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.recorded_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only the Owner closes or reopens a job' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER job_closeout_events_guard BEFORE INSERT OR UPDATE OR DELETE ON work.job_closeout_events
  FOR EACH ROW EXECUTE FUNCTION work.job_closeout_event_guard();

-- 2. Closing and reopening follow the Owner's record. Named to run after jobs_completion_guard (0082), whose quality
-- conditions keep their own refusal.
CREATE FUNCTION work.job_closeout_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.operational_state = 'closed' AND NEW.operational_state <> 'reopened' THEN
    RAISE EXCEPTION 'a closed job changes only by the Owner''s reopen' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.operational_state = 'operationally_complete' AND NEW.operational_state <> 'closed' THEN
    RAISE EXCEPTION 'an operationally complete job changes only by closing' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.operational_state = 'reopened' AND NEW.operational_state <> 'closed' THEN
    RAISE EXCEPTION 'a reopened job changes only by closing again' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.operational_state = 'closed' THEN
    IF OLD.operational_state NOT IN ('operationally_complete', 'reopened') THEN
      RAISE EXCEPTION 'a job closes from operationally complete or reopened' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM quality.cases c WHERE c.project_id = NEW.project_id AND c.state <> 'closed') THEN
      RAISE EXCEPTION 'a job closes only with no open case on its project' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.operational_state IN ('closed', 'reopened') AND NOT EXISTS (
       SELECT 1 FROM work.job_closeout_events e
        WHERE e.job_id = NEW.id AND e.event = NEW.operational_state AND e.recorded_at = now()) THEN
    RAISE EXCEPTION 'a job is closed or reopened only with the Owner''s recorded close or reopen'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_owner_closeout_guard BEFORE UPDATE OF operational_state ON work.jobs
  FOR EACH ROW WHEN (OLD.operational_state IS DISTINCT FROM NEW.operational_state
                     AND (NEW.operational_state IN ('closed', 'reopened')
                          OR OLD.operational_state IN ('operationally_complete', 'closed', 'reopened')))
  EXECUTE FUNCTION work.job_closeout_guard();

-- 3. The customer's answer to the follow-up.
CREATE TABLE quality.satisfaction_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL,
  project_id  uuid NOT NULL,
  -- The follow-up delivery it answers, when it came back to one.
  delivery_id uuid REFERENCES platform.message_deliveries (id),
  answer      text NOT NULL CHECK (answer IN ('positive', 'mixed', 'negative')),
  note        text CHECK (char_length(note) BETWEEN 1 AND 2000 AND note = btrim(note)),
  recorded_by uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT satisfaction_responses_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX satisfaction_responses_job ON quality.satisfaction_responses (job_id, recorded_at);
COMMENT ON TABLE quality.satisfaction_responses IS
  'The customer''s answer to the service-quality follow-up as staff recorded it (OWN-DEC-157 item 9). Append-only; '
  'it never gates a review request (OWN-DEC-113).';

CREATE FUNCTION quality.satisfaction_response_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'satisfaction answers are kept as recorded, never changed or deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.recorded_by, ARRAY['owner', 'office']) THEN
    RAISE EXCEPTION 'the Owner or Office records a satisfaction answer' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.delivery_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM platform.message_deliveries d
        WHERE d.id = NEW.delivery_id AND d.message_key = 'reminder.satisfaction_check'
          AND d.record_type = 'job' AND d.record_id = NEW.job_id::text) THEN
    RAISE EXCEPTION 'an answer names a follow-up of its own job' USING ERRCODE = 'check_violation';
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER satisfaction_responses_guard BEFORE INSERT OR UPDATE OR DELETE ON quality.satisfaction_responses
  FOR EACH ROW EXECUTE FUNCTION quality.satisfaction_response_guard();

-- A staging reset is the only path that empties these tables (TSK-0141).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work.job_closeout_events', 'quality.satisfaction_responses'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;

-- 4. The follow-up's wording with the secure concern link (English; customer content is English only).
INSERT INTO platform.message_template_versions
  (message_key, channel, audience, locale, version, subject, body, translation_review, source_ids, released_by,
   template_id)
SELECT 'reminder.satisfaction_check', 'email', 'customer', 'en',
       coalesce((SELECT max(version) FROM platform.message_template_versions v
                  WHERE v.message_key = 'reminder.satisfaction_check' AND v.channel = 'email' AND v.locale = 'en'), 0)
         + 1,
$s$HandyHub | How Was Your Experience?$s$,
$b$Hi {customerName},

Thank you for choosing HandyHub for your recent project #{jobNumber}!

We hope you're happy with the completed work.

Your feedback is important to us and helps us continue improving our services.

If you'd like to share your experience or have any questions about the work, we'd love to hear from you.

If anything about the work needs attention, you can report a concern or ask for help securely through your project page:

{projectLink}

Thank you again for trusting HandyHub. We appreciate your business!

The HandyHub Team$b$,
       'source', ARRAY['OWN-DEC-151', 'OWN-DEC-157', 'OQ-CLOSEOUT-DETAILS'], 'migration:0101', 'customer_follow_up';

-- 5. Jobs already complete wait for the Owner's close in Owner Decisions ("Jobs to close")...
INSERT INTO ops.queue_items (type, subject_type, subject_id, band, project_id, reference, subject_status, reason)
SELECT 'job_closeout', 'job', j.id::text, 'other', j.project_id, p.reference, j.operational_state, 'closeout_pending'
  FROM work.jobs j
  JOIN crm.projects p ON p.id = j.project_id
 WHERE j.operational_state = 'operationally_complete'
ON CONFLICT (type, subject_type, subject_id) WHERE resolved_at IS NULL DO NOTHING;

-- ... and get one preparation job each (the job decides when and whether a follow-up is prepared).
INSERT INTO platform.jobs (automation, job_key, target_type, target_id, payload, request_id, run_at, max_attempts)
SELECT 'closeout.follow_up_prepare', 'closeout.follow_up_prepare:' || j.id, 'job', j.id::text, '{}',
       'migration:0101', now(), 5
  FROM work.jobs j
  JOIN quality.reviews r ON r.job_id = j.id AND r.state = 'passed'
 WHERE j.operational_state IN ('operationally_complete', 'closed')
ON CONFLICT (job_key) DO NOTHING;
