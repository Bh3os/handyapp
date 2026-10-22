-- 0079 Stop Work, Report Hazard, critical holds and issue reports (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13,
-- HH-CHG-04, HH-INC-01, HH-INC-02, HH-STAFF-05, T48, T54, ENT-IssueReport, ENT-Hold, ENT-Photo, OWN-DEC-38, OWN-DEC-80,
-- OWN-DEC-108, OWN-DEC-143, OWN-DEC-172, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
-- The server writes the report, its critical safety hold, the hold's safety-band queue item and the job's pause in one
-- transaction under the job's row lock (apps/server/src/modules/hazards). This migration is the database's backstop:
-- - work.issue_reports (ENT-IssueReport): a Stop Work / Report Hazard (kind hazard: always critical) or an issue report
--   (kind issue: the categories of HH-WORK-08). A critical report names its critical safety hold, which must have been
--   written in the same transaction, for the same job, by the same person, open, with source hazard_report and the
--   report's own id as its source_ref; the report takes the job's row lock, so a Start Work transaction (which holds the
--   same lock, 0074) commits strictly before or after it. A report without its hold, or a hold of another
--   transaction, is refused: the hold exists whenever the report exists. Never through the outbox.
-- - No on-site resolution for a hazard, a critical issue, an unsafe condition or an incident (OWN-DEC-80), and none
--   while a critical safety hold of the project is unresolved; a resolution records what happened, the steps, the
--   materials and how it was checked.
-- - Incident and injury details are restricted_incident (OWN-DEC-143): the visibility is fixed by what was reported.
-- - work.issue_report_photos: photos of a report, taken only when safe (internal or restricted with the report, never
--   served by these routes; PROPOSED minimal record until field photos, TSK-0076).
-- - work.stabilization_records: emergency stabilization recorded separately from change orders (HH-CHG-04): trigger,
--   actions, why necessary, evidence, Owner and customer notification times, follow-up.
-- - work.issue_report_reviews: the Owner's review of an issue report (ENT-IssueReport "Owner reviews"), once.
-- Every table is append-only. Releasing the hold stays the documented path of 0074 (never by its raiser).

CREATE TABLE work.issue_reports (
  -- Given by the server, so the hold written before the report names it in its source_ref.
  id                       uuid PRIMARY KEY,
  job_id                   uuid NOT NULL,
  project_id               uuid NOT NULL,
  -- The visit the reporter was on, when there is one (Office and the Estimator may report from anywhere).
  visit_id                 uuid REFERENCES work.visits (id),
  kind                     text NOT NULL CHECK (kind IN ('hazard', 'issue')),
  hazard                   text CHECK (hazard IN ('gas_leak', 'live_wiring', 'hazardous_material', 'structural',
                             'licensed_trade', 'injury', 'other_unsafe')),
  category                 text CHECK (category IN ('unsafe_condition', 'scope_mismatch', 'hidden_damage',
                             'material_problem', 'missing_equipment', 'access_problem', 'customer_change', 'weather',
                             'product_defect', 'incident')),
  severity                 text NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  -- What the reporter wrote (staff only; restricted for incidents and injuries).
  description              text CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  -- The work packages the report stops (HH-CHG-04); recorded as the server decided them.
  affected_work_package_ids uuid[] NOT NULL DEFAULT '{}',
  visibility               text NOT NULL CHECK (visibility IN ('internal_operational', 'restricted_incident')),
  next_owner               text NOT NULL CHECK (next_owner IN ('owner', 'office', 'worker')),
  people_kept_away         boolean,
  emergency_services_called boolean,
  resolved_on_site         boolean NOT NULL DEFAULT false,
  resolution_what_happened text CHECK (char_length(btrim(resolution_what_happened)) BETWEEN 1 AND 2000),
  resolution_steps         text CHECK (char_length(btrim(resolution_steps)) BETWEEN 1 AND 2000),
  resolution_materials     text CHECK (char_length(btrim(resolution_materials)) BETWEEN 1 AND 1000),
  resolution_check         text CHECK (char_length(btrim(resolution_check)) BETWEEN 1 AND 1000),
  hold_id                  uuid UNIQUE REFERENCES work.holds (id),
  job_state_before         text NOT NULL,
  job_paused               boolean NOT NULL,
  reported_by              uuid NOT NULL REFERENCES identity.staff_users (id),
  reported_at              timestamptz NOT NULL DEFAULT now(),
  -- The device's time when the stop was recorded on the phone (offline, HH-OFF-03), beside the server's time.
  device_recorded_at       timestamptz,
  CONSTRAINT issue_reports_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT issue_reports_kind CHECK (
    (kind = 'hazard' AND hazard IS NOT NULL AND category IS NULL AND severity = 'critical')
    OR (kind = 'issue' AND category IS NOT NULL AND hazard IS NULL)),
  CONSTRAINT issue_reports_unsafe_critical CHECK (category IS DISTINCT FROM 'unsafe_condition' OR severity = 'critical'),
  -- Every critical report writes its critical safety hold; nothing else does.
  CONSTRAINT issue_reports_hold CHECK ((hold_id IS NOT NULL) = (severity = 'critical')),
  CONSTRAINT issue_reports_visibility CHECK (
    (visibility = 'restricted_incident') = (hazard IS NOT DISTINCT FROM 'injury' OR category IS NOT DISTINCT FROM 'incident')),
  CONSTRAINT issue_reports_resolution CHECK (
    resolved_on_site = (resolution_what_happened IS NOT NULL)
    AND resolved_on_site = (resolution_steps IS NOT NULL)
    AND resolved_on_site = (resolution_materials IS NOT NULL)
    AND resolved_on_site = (resolution_check IS NOT NULL)),
  CONSTRAINT issue_reports_no_resolution CHECK (
    NOT resolved_on_site
    OR (kind = 'issue' AND severity <> 'critical' AND category NOT IN ('unsafe_condition', 'incident')))
);
CREATE INDEX issue_reports_job ON work.issue_reports (job_id, reported_at);
CREATE INDEX issue_reports_project ON work.issue_reports (project_id);
CREATE TRIGGER issue_reports_append_only BEFORE UPDATE OR DELETE ON work.issue_reports
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.issue_reports IS
  'Stop Work / Report Hazard and issue reports (ENT-IssueReport); a critical one names its hold of the same transaction.';

CREATE FUNCTION work.issue_report_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The job's row lock: a report and its hold commit strictly before or after any Start Work of the job.
  PERFORM 1 FROM work.jobs WHERE id = NEW.job_id AND project_id = NEW.project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a report names a job of its own project' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.visit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM work.visits WHERE id = NEW.visit_id AND job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'a report names a visit of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.affected_work_package_ids) x
             WHERE NOT EXISTS (SELECT 1 FROM work.work_packages w WHERE w.id = x AND w.job_id = NEW.job_id)) THEN
    RAISE EXCEPTION 'a report names work packages of its own job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.hold_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work.holds h
       WHERE h.id = NEW.hold_id AND h.kind = 'critical_safety' AND h.scope_type = 'job' AND h.scope_id = NEW.job_id
         AND h.project_id = NEW.project_id AND h.source = 'hazard_report'
         AND h.source_ref = 'hazard_report:' || NEW.id::text AND h.raised_by = NEW.reported_by AND h.state = 'open'
         AND h.xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'a critical report names its own open critical safety hold, written in the same transaction'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.resolved_on_site AND EXISTS (
       SELECT 1 FROM work.holds WHERE project_id = NEW.project_id AND kind = 'critical_safety'
         AND state IN ('open', 'under_review')) THEN
    RAISE EXCEPTION 'nothing is resolved on site while a critical safety hold is unresolved'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issue_reports_check BEFORE INSERT ON work.issue_reports
  FOR EACH ROW EXECUTE FUNCTION work.issue_report_check();

-- Photos of a report ----------------------------------------------------------------------------------------------------
CREATE TABLE work.issue_report_photos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES work.issue_reports (id),
  job_id             uuid NOT NULL,
  project_id         uuid NOT NULL,
  staff_user_id      uuid NOT NULL REFERENCES identity.staff_users (id),
  object_key         text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 1 AND 300),
  content_type       text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size          integer NOT NULL CHECK (byte_size > 0),
  sha256             text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  device_captured_at timestamptz,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, sha256),
  CONSTRAINT issue_report_photos_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX issue_report_photos_report ON work.issue_report_photos (report_id);
CREATE TRIGGER issue_report_photos_append_only BEFORE UPDATE OR DELETE ON work.issue_report_photos
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.issue_report_photos IS
  'Photos of a hazard or issue report, taken only when safe; they share the report''s visibility.';

-- Emergency stabilization ---------------------------------------------------------------------------------------------
CREATE TABLE work.stabilization_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id            uuid NOT NULL REFERENCES work.issue_reports (id),
  job_id               uuid NOT NULL,
  project_id           uuid NOT NULL,
  recorded_by          uuid NOT NULL REFERENCES identity.staff_users (id),
  trigger_text         text NOT NULL CHECK (char_length(btrim(trigger_text)) BETWEEN 1 AND 1000),
  actions              text NOT NULL CHECK (char_length(btrim(actions)) BETWEEN 1 AND 2000),
  why_necessary        text NOT NULL CHECK (char_length(btrim(why_necessary)) BETWEEN 1 AND 1000),
  evidence             text CHECK (char_length(btrim(evidence)) BETWEEN 1 AND 1000),
  owner_notified_at    timestamptz,
  customer_notified_at timestamptz,
  follow_up            text CHECK (char_length(btrim(follow_up)) BETWEEN 1 AND 1000),
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stabilization_records_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id)
);
CREATE INDEX stabilization_records_report ON work.stabilization_records (report_id);
CREATE TRIGGER stabilization_records_append_only BEFORE UPDATE OR DELETE ON work.stabilization_records
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.stabilization_records IS
  'Emergency stabilization recorded separately from change orders (HH-CHG-04), escalated to the Owner.';

-- A photo or a stabilization names its report's own job and project.
CREATE FUNCTION work.report_child_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.issue_reports WHERE id = NEW.report_id AND job_id = NEW.job_id
                 AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'a % row names its report''s own job and project', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issue_report_photos_check BEFORE INSERT ON work.issue_report_photos
  FOR EACH ROW EXECUTE FUNCTION work.report_child_check();
CREATE TRIGGER stabilization_records_check BEFORE INSERT ON work.stabilization_records
  FOR EACH ROW EXECUTE FUNCTION work.report_child_check();

-- The Owner's review of an issue report -------------------------------------------------------------------------------
CREATE TABLE work.issue_report_reviews (
  report_id   uuid PRIMARY KEY REFERENCES work.issue_reports (id),
  reviewed_by uuid NOT NULL REFERENCES identity.staff_users (id),
  note        text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER issue_report_reviews_append_only BEFORE UPDATE OR DELETE ON work.issue_report_reviews
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE FUNCTION work.issue_report_review_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT work.has_live_role(NEW.reviewed_by, 'owner') THEN
    RAISE EXCEPTION 'only the Owner reviews an issue report' USING ERRCODE = 'check_violation';
  END IF;
  -- A review never stands in for a hold's release: a critical report is reviewed through its hold (0074).
  IF EXISTS (SELECT 1 FROM work.issue_reports WHERE id = NEW.report_id AND hold_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a critical report is reviewed through its hold, never here' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issue_report_reviews_check BEFORE INSERT ON work.issue_report_reviews
  FOR EACH ROW EXECUTE FUNCTION work.issue_report_review_check();
COMMENT ON TABLE work.issue_report_reviews IS 'The Owner''s review of a non-critical issue report, once.';

-- Staging reset (TSK-0141): test records; only a permitted staging reset truncates them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work.issue_reports', 'work.issue_report_photos', 'work.stabilization_records',
                           'work.issue_report_reviews'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;
