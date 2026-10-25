-- 0099 The escalation procedure in every job packet: the Owner's number and the recorded escalation actions (TSK-0129;
-- HH-PKT-09, HH-WORK-13, FACT-SVC-ESCALATION-PATH, ENT-StaffUser, ENT-AuditEvent, OWN-DEC-172, OWN-DEC-208,
-- RULE-SAFETY-GATES, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). The server decides who may do what
-- (apps/server/src/modules/escalation); this migration keeps the records true whatever path writes.
-- - identity.staff_escalation_phones: the phone number the Owner enters in their own staff profile, read by every job
--   packet and Stop Work for "Call Owner — Report a Problem". It is personal data the owner gives: never in the
--   repository, the graph or a fixture other than a synthetic one, and never in the audit summary. Its own table, like
--   the password hash (0009), so no staff query returns it by accident. Only an account holding a live Owner grant
--   holds a number; clearing it keeps the row with no number (the version keeps counting, so If-Match never mistakes a
--   cleared and re-entered number for the one shown). While no active Owner has one, Call Owner is NOT CONFIGURED.
-- - work.escalation_calls: each tap of Call Owner, Call 911 and "I could not reach the Owner" a phone recorded, keyed
--   by the UUID the phone generated (recorded once however often it is resent: the call itself is a phone link that
--   never waits for this record). Never changed or deleted; the job, its visit and its report are its own.

CREATE TABLE identity.staff_escalation_phones (
  staff_user_id uuid PRIMARY KEY REFERENCES identity.staff_users (id),
  -- PROPOSED: a North American number, +1 and ten digits (packages/domain/src/escalation.ts OWNER_PHONE_RE); null once
  -- the Owner cleared it.
  phone         text CHECK (phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
COMMENT ON TABLE identity.staff_escalation_phones IS
  'The Owner''s escalation phone number, entered by the Owner in their own staff profile (HH-PKT-09, OWN-DEC-172).';

CREATE FUNCTION identity.staff_escalation_phone_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an escalation number is cleared, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.phone IS NOT NULL AND NOT work.has_live_role(NEW.staff_user_id, 'owner') THEN
    RAISE EXCEPTION 'only an Owner account holds the escalation number' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
  ELSE
    IF NEW.staff_user_id <> OLD.staff_user_id THEN
      RAISE EXCEPTION 'an escalation number stays on its account' USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER staff_escalation_phones_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.staff_escalation_phones
  FOR EACH ROW EXECUTE FUNCTION identity.staff_escalation_phone_guard();

CREATE TABLE work.escalation_calls (
  -- The UUID the phone generated for the tap (its sync key).
  client_id          uuid PRIMARY KEY,
  job_id             uuid NOT NULL,
  project_id         uuid NOT NULL,
  -- The visit the worker was on and the Stop Work it follows, when the phone knew them.
  visit_id           uuid REFERENCES work.visits (id),
  report_id          uuid REFERENCES work.issue_reports (id),
  action             text NOT NULL CHECK (action IN ('call_owner', 'call_911', 'owner_unreachable')),
  actor_id           uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The phone's time of the tap (it may have been offline), beside the server's time of receiving it.
  device_recorded_at timestamptz NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escalation_calls_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX escalation_calls_job ON work.escalation_calls (job_id, device_recorded_at);
CREATE INDEX escalation_calls_report ON work.escalation_calls (report_id) WHERE report_id IS NOT NULL;
CREATE TRIGGER escalation_calls_append_only BEFORE UPDATE OR DELETE ON work.escalation_calls
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.escalation_calls IS
  'Call Owner, Call 911 and Owner-unreachable taps from staff phones (HH-PKT-09): recorded once per client UUID.';

CREATE FUNCTION work.escalation_call_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'an escalation call names a visit of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.report_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM work.issue_reports WHERE id = NEW.report_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'an escalation call names a report of its own job' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER escalation_calls_check BEFORE INSERT ON work.escalation_calls
  FOR EACH ROW EXECUTE FUNCTION work.escalation_call_check();

-- A staging reset is the only path that empties the escalation calls (TSK-0141); the Owner's number is staff profile
-- data and is kept, like the staff accounts.
CREATE TRIGGER escalation_calls_reset_only_truncate BEFORE TRUNCATE ON work.escalation_calls
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
