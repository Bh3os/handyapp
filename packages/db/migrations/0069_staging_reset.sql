-- 0069 Staging-only Reset Test Data (TSK-0141; HH-OPS-05, OWN-DEC-191, RULE-SYNTHETIC-DATA, RULE-SERVER-AUTHZ,
-- ENT-AuditEvent, ENT-OutboxEvent). The database takes part in the staging check, alongside the server's own checks.
-- What it can and cannot prove: the environment marks are written by the application itself (server boot, migration
-- command), so they record what the processes said they were, not an independent fact. A production server that
-- cannot record or confirm its mark refuses to start, so a database that production used carries the mark; a
-- database that no production server ever started on is protected by the other checks only. Those are: a staging
-- reset runs only on the database named as staging (current_database() = 'handyhub_staging_db', the databaseName of
-- render.yaml; @handyhub/db STAGING_DATABASE_NAME), and a local or ci reset only when the server's DATABASE_URL
-- names a loopback host or a local socket (checked by the server, as the database cannot see the URL).
-- - environment_marks: every environment a server or migration run identified itself as on this database (written
--   at boot and after migrating). Append-only. Once a production mark exists no other mark is accepted, and the
--   database can never be reset (staging.database_identified() is false for good).
-- - reusable_test_accounts: the customer accounts the Owner designated as reusable test accounts; a reset keeps them
--   (and their customer and contact records) so they can sign in again.
-- - reset_runs: the protected staging audit trail of resets. A run is written as 'running' at the start of the reset
--   transaction (only on an identified database, and for staging only on the staging database), names that
--   transaction (txid) and becomes 'completed' in the same transaction; a failed attempt is a separate 'failed' row.
--   Never deleted, never changed after its transaction. A run names the idempotency scope of the request that asked
--   for it (a digest of the caller, the operation and the Idempotency-Key, never the key itself), so a retry after a
--   committed reset is answered with that run instead of resetting again; the reset's audit event commits with it.
-- - test_data_seedings: what "Reset & Create Fresh Test Data" created after a completed reset. Append-only.
-- - staging.reset_permitted(): true only inside the transaction that wrote the running run named in the setting
--   handyhub.staging_reset, on an identified database. Only then do the TRUNCATE guards below stand aside, and only
--   then may a customer account row be deleted. In production (a production mark) it is always false, so every guard
--   behaves exactly as before; tables that had no TRUNCATE guard now refuse TRUNCATE outright there.
-- - No row-level DELETE or UPDATE guard of an append-only table changes: the reset clears tables with TRUNCATE, except
--   platform.jobs and platform.outbox_events (no row guards), whose rows it deletes: the stored-file removal and
--   retention jobs are kept, and with them the outbox events those jobs name.
-- - Every staging.* function runs with search_path = pg_catalog, pg_temp (every other name is schema-qualified).
--   The two tables whose TRUNCATE privilege is revoked from their owner (privacy.deletions, privacy.retention_reviews)
--   are granted it back inside the permitted transaction only (staging.reset_unlock / staging.reset_relock), so the
--   committed privileges never change. platform.audit_events is never cleared: the reset is recorded there too.
CREATE SCHEMA staging;
COMMENT ON SCHEMA staging IS 'Staging-only test data management (TSK-0141): environment marks, reusable test accounts and the reset trail.';

CREATE TABLE staging.environment_marks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  environment text NOT NULL CHECK (environment IN ('local', 'ci', 'staging', 'production')),
  -- What wrote it: the server at boot or the migration command.
  source      text NOT NULL CHECK (source IN ('server_boot', 'migration')),
  marked_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE staging.environment_marks IS
  'Environments that identified themselves on this database (TSK-0141); a production mark forbids every reset for good.';

CREATE FUNCTION staging.environment_mark_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.environment <> 'production'
     AND EXISTS (SELECT 1 FROM staging.environment_marks WHERE environment = 'production') THEN
    RAISE EXCEPTION 'this database has served production; it is never marked as a test environment'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER environment_marks_guard BEFORE INSERT ON staging.environment_marks
  FOR EACH ROW EXECUTE FUNCTION staging.environment_mark_guard();
CREATE TRIGGER environment_marks_append_only BEFORE UPDATE OR DELETE ON staging.environment_marks
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER environment_marks_no_truncate BEFORE TRUNCATE ON staging.environment_marks
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

-- Positively identified as a test environment: at least one staging, local or ci mark, and never a production mark.
CREATE FUNCTION staging.database_identified() RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM staging.environment_marks WHERE environment = 'production')
     AND EXISTS (SELECT 1 FROM staging.environment_marks WHERE environment IN ('staging', 'local', 'ci'))
$$;
COMMENT ON FUNCTION staging.database_identified() IS
  'True only for a database marked as staging, local or ci that has never been marked production (TSK-0141).';

-- A staging reset runs only on the staging database (render.yaml databaseName; @handyhub/db STAGING_DATABASE_NAME);
-- local and ci are confined to a loopback or socket connection by the server (the database cannot see the URL).
CREATE FUNCTION staging.environment_database_ok(environment text) RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp AS $$
  SELECT environment IN ('local', 'ci') OR (environment = 'staging' AND current_database() = 'handyhub_staging_db')
$$;
COMMENT ON FUNCTION staging.environment_database_ok(text) IS
  'False for a staging run on any database but handyhub_staging_db (TSK-0141).';

CREATE TABLE staging.reusable_test_accounts (
  account_id    uuid PRIMARY KEY REFERENCES identity.customer_accounts (id),
  designated_by uuid NOT NULL REFERENCES identity.staff_users (id),
  designated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE staging.reusable_test_accounts IS
  'Customer accounts the Owner designated as reusable test accounts (TSK-0141): a reset keeps them signing in.';

CREATE TABLE staging.reset_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  mode         text NOT NULL CHECK (mode IN ('reset', 'reset_and_seed')),
  state        text NOT NULL CHECK (state IN ('running', 'completed', 'failed')),
  requested_by uuid NOT NULL REFERENCES identity.staff_users (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  environment  text NOT NULL CHECK (environment IN ('local', 'ci', 'staging')),
  -- The transaction that runs the reset: only it may clear the tables (staging.reset_permitted).
  txid         bigint NOT NULL DEFAULT txid_current(),
  request_id   text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  -- SHA-256 of the caller, the operation and the Idempotency-Key of the request, and of what it asked (its body);
  -- null on a failed attempt. A retry of a completed run is answered with the run (no second reset).
  idempotency_scope text CHECK (idempotency_scope ~ '^[0-9a-f]{64}$'),
  request_hash      text CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  -- Counts only, never content: {"crm.projects": 4, ...}, the preserved counts before and after, the checks run and
  -- the error codes of a failed attempt.
  removed      jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(removed) = 'object'),
  preserved    jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preserved) = 'object'),
  checks       jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checks) = 'array'),
  errors       jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(errors) = 'array'),
  CHECK ((state = 'running') = (finished_at IS NULL))
);
-- At most one reset is running (an uncommitted one); a second waits on this index or is refused by the lock first.
CREATE UNIQUE INDEX reset_runs_one_running ON staging.reset_runs ((true)) WHERE state = 'running';
CREATE UNIQUE INDEX reset_runs_idempotency ON staging.reset_runs (idempotency_scope)
  WHERE idempotency_scope IS NOT NULL AND state <> 'failed';
COMMENT ON TABLE staging.reset_runs IS
  'The protected staging audit trail of Reset Test Data (TSK-0141): who, when, what was removed and kept, checks, errors.';

CREATE FUNCTION staging.reset_run_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'APPEND_ONLY: the staging reset trail is never deleted' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT staging.database_identified() THEN
      RAISE EXCEPTION 'STAGING_NOT_IDENTIFIED: this database is not a positively identified test database'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NOT staging.environment_database_ok(NEW.environment) THEN
      RAISE EXCEPTION 'STAGING_NOT_IDENTIFIED: a staging reset runs only on the staging database'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.state = 'running' AND (NEW.txid <> txid_current() OR NEW.removed <> '{}' OR NEW.errors <> '[]') THEN
      RAISE EXCEPTION 'a reset starts running in its own transaction, with nothing recorded yet'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.state = 'completed' THEN
      RAISE EXCEPTION 'a reset completes only from its running row' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: only the running row's own transaction finishes it, once; what it names never changes.
  IF OLD.state <> 'running' OR OLD.txid <> txid_current() OR NEW.state = 'running' THEN
    RAISE EXCEPTION 'APPEND_ONLY: a reset run is final once its transaction ends' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.id, NEW.seq, NEW.mode, NEW.requested_by, NEW.requested_at, NEW.environment, NEW.txid, NEW.request_id,
      NEW.idempotency_scope, NEW.request_hash)
     IS DISTINCT FROM
     (OLD.id, OLD.seq, OLD.mode, OLD.requested_by, OLD.requested_at, OLD.environment, OLD.txid, OLD.request_id,
      OLD.idempotency_scope, OLD.request_hash) THEN
    RAISE EXCEPTION 'a reset run keeps who asked, when and how' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reset_runs_guard BEFORE INSERT OR UPDATE OR DELETE ON staging.reset_runs
  FOR EACH ROW EXECUTE FUNCTION staging.reset_run_guard();
CREATE TRIGGER reset_runs_no_truncate BEFORE TRUNCATE ON staging.reset_runs
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

CREATE TABLE staging.test_data_seedings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  run_id      uuid NOT NULL UNIQUE REFERENCES staging.reset_runs (id),
  state       text NOT NULL CHECK (state IN ('completed', 'partial', 'failed')),
  -- Per scenario: created, blocked (with the refusal codes) or not available yet (with the task that builds it).
  outcomes    jsonb NOT NULL CHECK (jsonb_typeof(outcomes) = 'array'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  request_id  text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100)
);
CREATE FUNCTION staging.test_data_seeding_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT staging.database_identified() THEN
    RAISE EXCEPTION 'STAGING_NOT_IDENTIFIED: fresh test data is written only on an identified test database'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staging.reset_runs r WHERE r.id = NEW.run_id AND r.state = 'completed') THEN
    RAISE EXCEPTION 'fresh test data follows a completed reset' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_data_seedings_guard BEFORE INSERT ON staging.test_data_seedings
  FOR EACH ROW EXECUTE FUNCTION staging.test_data_seeding_guard();
CREATE TRIGGER test_data_seedings_append_only BEFORE UPDATE OR DELETE ON staging.test_data_seedings
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER test_data_seedings_no_truncate BEFORE TRUNCATE ON staging.test_data_seedings
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE staging.test_data_seedings IS
  'What Reset & Create Fresh Test Data created after a reset (TSK-0141): scenario outcomes, never personal content.';

REVOKE UPDATE, DELETE, TRUNCATE ON staging.environment_marks, staging.reset_runs, staging.test_data_seedings
  FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE DELETE, TRUNCATE ON staging.environment_marks, staging.reset_runs, staging.test_data_seedings FROM %I',
    current_user);
  EXECUTE format('REVOKE UPDATE ON staging.environment_marks, staging.test_data_seedings FROM %I', current_user);
END;
$$;

-- True only inside the reset transaction named in handyhub.staging_reset, on an identified database.
CREATE FUNCTION staging.reset_permitted() RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp AS $$
  SELECT staging.database_identified() AND EXISTS (
    SELECT 1 FROM staging.reset_runs r
     WHERE r.id::text = nullif(current_setting('handyhub.staging_reset', true), '')
       AND r.state = 'running'
       AND r.txid = txid_current()
       AND staging.environment_database_ok(r.environment)
  )
$$;
COMMENT ON FUNCTION staging.reset_permitted() IS
  'True only inside the running staging reset transaction named in handyhub.staging_reset, on its database (TSK-0141).';

-- The TRUNCATE guard of the tables a reset clears that had none: refused unless a staging reset is permitted.
CREATE FUNCTION staging.reject_truncate() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE of %.% is refused: only a staging test-data reset may clear it', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;

-- The two tables whose TRUNCATE privilege their owner gave up: granted back only inside the permitted transaction and
-- revoked again before it commits (a rolled-back grant never existed).
CREATE FUNCTION staging.reset_unlock() RETURNS void LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT staging.reset_permitted() THEN
    RAISE EXCEPTION 'STAGING_RESET_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  EXECUTE format('GRANT TRUNCATE ON privacy.deletions, privacy.retention_reviews TO %I', current_user);
END;
$$;
CREATE FUNCTION staging.reset_relock() RETURNS void LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  EXECUTE format('REVOKE TRUNCATE ON privacy.deletions, privacy.retention_reviews FROM %I', current_user);
END;
$$;

-- Existing TRUNCATE guards of cleared tables: the same refusal, unless a staging reset is permitted.
DROP TRIGGER approval_receipts_no_truncate ON estimating.approval_receipts;
CREATE TRIGGER approval_receipts_no_truncate BEFORE TRUNCATE ON estimating.approval_receipts
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER approvals_no_truncate ON estimating.approvals;
CREATE TRIGGER approvals_no_truncate BEFORE TRUNCATE ON estimating.approvals
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER estimate_lines_no_truncate ON estimating.estimate_lines;
CREATE TRIGGER estimate_lines_no_truncate BEFORE TRUNCATE ON estimating.estimate_lines
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER estimate_versions_no_truncate ON estimating.estimate_versions;
CREATE TRIGGER estimate_versions_no_truncate BEFORE TRUNCATE ON estimating.estimate_versions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER deletions_no_truncate ON privacy.deletions;
CREATE TRIGGER deletions_no_truncate BEFORE TRUNCATE ON privacy.deletions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER retention_decisions_no_truncate ON privacy.retention_decisions;
CREATE TRIGGER retention_decisions_no_truncate BEFORE TRUNCATE ON privacy.retention_decisions
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER retention_reviews_no_truncate ON privacy.retention_reviews;
CREATE TRIGGER retention_reviews_no_truncate BEFORE TRUNCATE ON privacy.retention_reviews
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER job_scope_snapshots_no_truncate ON work.job_scope_snapshots;
CREATE TRIGGER job_scope_snapshots_no_truncate BEFORE TRUNCATE ON work.job_scope_snapshots
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER job_packet_acknowledgments_no_truncate ON work.job_packet_acknowledgments;
CREATE TRIGGER job_packet_acknowledgments_no_truncate BEFORE TRUNCATE ON work.job_packet_acknowledgments
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER job_packet_ack_invalidations_no_truncate ON work.job_packet_acknowledgment_invalidations;
CREATE TRIGGER job_packet_ack_invalidations_no_truncate BEFORE TRUNCATE ON work.job_packet_acknowledgment_invalidations
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();
DROP TRIGGER jobs_no_truncate ON work.jobs;
CREATE TRIGGER jobs_no_truncate BEFORE TRUNCATE ON work.jobs
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION platform.reject_append_only_change();

-- Every other table a reset clears: TRUNCATE refused unless a staging reset is permitted (new: refused in production).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comms.conversations', 'comms.message_links', 'comms.messages', 'comms.project_reply_tokens',
    'crm.access_code_reveals', 'crm.access_instruction_secrets', 'crm.candidate_match_events', 'crm.candidate_matches',
    'crm.customer_notes', 'crm.customer_properties', 'crm.projects', 'crm.properties', 'crm.property_addresses',
    'crm.property_changes', 'crm.property_details', 'crm.record_changes', 'crm.record_links',
    'estimating.approval_selections', 'estimating.customer_responses', 'estimating.estimate_documents',
    'estimating.estimate_line_costs', 'estimating.estimate_version_internals', 'estimating.estimates',
    'finance.deposit_requirements', 'finance.deposit_waivers', 'finance.payment_allocations', 'finance.payments',
    'identity.customer_account_changes', 'identity.customer_identity_links', 'identity.customer_sessions',
    'identity.project_access_grants', 'identity.verification_attempts', 'identity.verification_codes',
    'intake.photos', 'intake.question_replies', 'intake.question_reply_photos', 'intake.questions',
    'intake.receipt_capabilities', 'intake.request_answers', 'intake.request_assignments',
    'intake.request_conversations', 'intake.request_decisions', 'intake.request_notes', 'intake.request_qualifications',
    'intake.request_services', 'intake.requests', 'intake.response_clocks', 'intake.response_events',
    'intake.upload_capabilities',
    'ops.queue_items',
    'platform.consent_records', 'platform.jobs', 'platform.message_deliveries', 'platform.message_delivery_events',
    'platform.outbox_events', 'platform.webhook_receipts',
    'privacy.privacy_requests',
    'work.holds', 'work.job_packet_exports', 'work.job_packet_views', 'work.job_packets', 'work.reservation_flags',
    'work.reservations', 'work.scheduling_tasks', 'work.visit_change_requests', 'work.visit_changes',
    'work.visit_windows', 'work.visits', 'work.window_offer_options', 'work.window_offers',
    'work.work_package_sop_pins', 'work.work_packages',
    'work.visit_departures', 'work.time_stamps', 'work.time_stamp_corrections', 'work.work_package_loadouts',
    'work.loadout_checks'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) '
      'EXECUTE FUNCTION staging.reject_truncate()',
      split_part(t, '.', 2) || '_reset_only_truncate', t);
  END LOOP;
END;
$$;

-- Customer accounts: updates guarded exactly as before; a delete refused except a test account inside a permitted
-- staging reset (designated reusable accounts are kept by the reset itself).
DROP TRIGGER customer_accounts_guard ON identity.customer_accounts;
CREATE TRIGGER customer_accounts_guard BEFORE UPDATE ON identity.customer_accounts
  FOR EACH ROW EXECUTE FUNCTION identity.customer_account_guard();
CREATE TRIGGER customer_accounts_no_delete BEFORE DELETE ON identity.customer_accounts
  FOR EACH ROW WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION identity.customer_account_guard();
