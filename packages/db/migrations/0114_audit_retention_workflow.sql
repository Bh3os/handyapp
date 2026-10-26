-- 0114 The audit-retention workflow: owner-authorized archive or deletion of audit records after 7 years, with its own
-- protected trail and a hash chain across archive and deletion boundaries (TSK-0135; HH-SEC-08, HH-SEC-06,
-- HH-STAFF-08, ENT-AuditEvent, ENT-RetentionReview, OWN-DEC-164, OWN-DEC-142, OWN-DEC-70, RULE-SERVER-AUTHZ,
-- RULE-HUMAN-REVIEW).
-- - The chain: every audit event has a digest (platform.audit_event_digest: SHA-256 of its fields in a fixed order,
--   with its time in microseconds since the epoch, so no session setting changes it). The chain hash of an event is
--   SHA-256(previous chain hash || its digest), from a fixed genesis value, in seq order. Seqs are never renumbered.
-- - audit_chain_seals: the chain hash recorded at a seq, one seal after the other (each starts at the previous one's
--   hash and seq), written by the retention job and before every retention operation. Verification recomputes the
--   chain from the events and compares it with every seal: an event changed, removed or inserted inside a sealed
--   range no longer matches. Append-only.
-- - audit_retention_operations: the separate, protected retention-operation trail (OWN-DEC-164 point 7). One row per
--   Owner archive or deletion of a seq range: the authorizing Owner and roles, the fresh sign-in time, the reason, the
--   range (first and last seq, how many events, their first and last times), the policy and period applied, the hold
--   checks and the checks the Owner confirmed, and the integrity evidence: the chain hash before the range and at its
--   end, and the seal they were verified against. A deletion keeps no content of the deleted events. Append-only; the
--   database itself checks, on insert, that the transaction is the one writing it, that the authorizer is an active
--   Owner, that every event of the range is past the period in the business time zone (at least 7 years,
--   OWN-DEC-164), that the policy is the active retention.audit_log version, that a seal covers the range, and that a
--   deletion overlaps no earlier deletion (an archive no earlier archive).
-- - Deletion: platform.audit_events still refuses UPDATE for everyone, and DELETE except inside the transaction that
--   wrote a 'delete' operation naming the event's seq in the setting handyhub.audit_retention. The table's owner keeps
--   no DELETE privilege: platform.audit_retention_erase grants it inside that transaction only and revokes it again
--   before returning (a rolled-back grant never existed), and refuses unless the count deleted is the count recorded.
--   TRUNCATE stays refused. Nothing here or in the server deletes automatically; there is no other delete path.
CREATE FUNCTION platform.audit_event_digest(e platform.audit_events) RETURNS bytea LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp AS $$
  SELECT sha256(convert_to(jsonb_build_array(
    e.seq, e.id, (extract(epoch FROM e.occurred_at) * 1000000)::bigint, e.actor_kind, e.actor_id, e.actor_roles,
    e.actor_process, e.action, e.target_type, e.target_id, e.target_version, e.result, e.reason, e.summary,
    e.step_up_used, e.request_id)::text, 'UTF8'))
$$;
COMMENT ON FUNCTION platform.audit_event_digest(platform.audit_events) IS
  'SHA-256 of an audit event''s fields in a fixed order (TSK-0135): the link of the audit hash chain.';

-- The chain's starting value (before the first event).
CREATE FUNCTION platform.audit_chain_genesis() RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to('handyhub.audit_chain.v1', 'UTF8'))
$$;

CREATE TABLE platform.audit_chain_seals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- The seal before this one; null only for the first.
  previous_id uuid UNIQUE REFERENCES platform.audit_chain_seals (id),
  -- The seqs this seal covers: from the previous seal's through_seq + 1 (1 for the first) to through_seq.
  from_seq    bigint NOT NULL CHECK (from_seq >= 1),
  through_seq bigint NOT NULL,
  -- The events chained in the range when it was sealed.
  event_count bigint NOT NULL CHECK (event_count >= 1),
  -- The chain hash before from_seq (the previous seal's, or the genesis value) and at through_seq.
  start_hash  bytea NOT NULL CHECK (octet_length(start_hash) = 32),
  chain_hash  bytea NOT NULL CHECK (octet_length(chain_hash) = 32),
  sealed_by   text NOT NULL CHECK (char_length(sealed_by) BETWEEN 1 AND 100),
  sealed_at   timestamptz NOT NULL DEFAULT now(),
  request_id  text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  CHECK (through_seq >= from_seq)
);
CREATE UNIQUE INDEX audit_chain_seals_one_first ON platform.audit_chain_seals ((previous_id IS NULL))
  WHERE previous_id IS NULL;
COMMENT ON TABLE platform.audit_chain_seals IS
  'Seals of the audit hash chain (TSK-0135, OWN-DEC-164): the chain hash recorded at a seq, one after the other.';

-- A seal continues the latest one exactly, and counts the events of its range as they are.
CREATE FUNCTION platform.audit_chain_seal_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  last platform.audit_chain_seals;
  n bigint;
BEGIN
  SELECT * INTO last FROM platform.audit_chain_seals ORDER BY seq DESC LIMIT 1;
  IF last.id IS NULL THEN
    IF NEW.previous_id IS NOT NULL OR NEW.from_seq <> 1 OR NEW.start_hash <> platform.audit_chain_genesis() THEN
      RAISE EXCEPTION 'the first audit chain seal starts at seq 1 from the genesis value' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.previous_id IS DISTINCT FROM last.id OR NEW.from_seq <> last.through_seq + 1
        OR NEW.start_hash <> last.chain_hash THEN
    RAISE EXCEPTION 'an audit chain seal continues the latest seal' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO n FROM platform.audit_events WHERE seq BETWEEN NEW.from_seq AND NEW.through_seq;
  IF n <> NEW.event_count THEN
    RAISE EXCEPTION 'an audit chain seal counts the events of its range' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_chain_seals_guard BEFORE INSERT ON platform.audit_chain_seals
  FOR EACH ROW EXECUTE FUNCTION platform.audit_chain_seal_guard();
CREATE TRIGGER audit_chain_seals_append_only BEFORE UPDATE OR DELETE ON platform.audit_chain_seals
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER audit_chain_seals_no_truncate BEFORE TRUNCATE ON platform.audit_chain_seals
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

CREATE TABLE platform.audit_retention_operations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind              text NOT NULL CHECK (kind IN ('archive', 'delete')),
  -- The range: its first and last seq (both events when recorded), how many events, their first and last times.
  from_seq          bigint NOT NULL CHECK (from_seq >= 1),
  to_seq            bigint NOT NULL,
  event_count       integer NOT NULL CHECK (event_count >= 1),
  first_occurred_at timestamptz NOT NULL,
  last_occurred_at  timestamptz NOT NULL,
  -- Integrity evidence: the chain hash before from_seq and at to_seq, verified against this seal (at or after to_seq).
  hash_before       bytea NOT NULL CHECK (octet_length(hash_before) = 32),
  hash_after        bytea NOT NULL CHECK (octet_length(hash_after) = 32),
  seal_id           uuid NOT NULL REFERENCES platform.audit_chain_seals (id),
  -- The period applied: the active retention.audit_log version, its years and the business time zone.
  policy_key        text NOT NULL CHECK (policy_key = 'retention.audit_log'),
  policy_version    integer NOT NULL,
  period_years      integer NOT NULL CHECK (period_years >= 7),
  time_zone         text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  -- Each check: {"check": ..., "result": found | none_found | not_applicable | not_recorded, "count": n?}.
  hold_checks       jsonb NOT NULL CHECK (jsonb_typeof(hold_checks) = 'array'),
  -- The checks the software does not record that the Owner confirmed (a deletion confirms every one).
  checks_confirmed  text[] NOT NULL DEFAULT '{}',
  reason            text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  authorized_by     uuid NOT NULL REFERENCES identity.staff_users (id),
  authorized_roles  text[] NOT NULL,
  -- When the Owner last entered a password or second factor (the fresh sign-in the route required).
  fresh_auth_at     timestamptz NOT NULL,
  authorized_at     timestamptz NOT NULL DEFAULT now(),
  request_id        text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  -- The transaction that wrote it: only it may delete the range (platform.audit_deletion_permitted).
  txid              bigint NOT NULL DEFAULT txid_current(),
  FOREIGN KEY (policy_key, policy_version) REFERENCES platform.policy_version (key, version),
  CHECK (to_seq >= from_seq)
);
CREATE INDEX audit_retention_operations_range ON platform.audit_retention_operations (kind, from_seq, to_seq);
COMMENT ON TABLE platform.audit_retention_operations IS
  'The protected retention-operation trail (TSK-0135, OWN-DEC-164): every Owner archive or deletion of audit records.';

CREATE FUNCTION platform.audit_retention_operation_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  n bigint;
  first_at timestamptz;
  last_at timestamptz;
  latest platform.policy_version;
  sealed bigint;
BEGIN
  IF NEW.txid <> txid_current() THEN
    RAISE EXCEPTION 'a retention operation is written by its own transaction' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.staff_users u
                   JOIN identity.role_grants g ON g.staff_user_id = u.id
                  WHERE u.id = NEW.authorized_by AND u.status = 'active'
                    AND g.kind = 'role' AND g.name = 'owner' AND g.ended_at IS NULL) THEN
    RAISE EXCEPTION 'only an active Owner authorizes an audit retention operation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO latest FROM platform.policy_version WHERE key = 'retention.audit_log' ORDER BY version DESC LIMIT 1;
  IF latest.version IS DISTINCT FROM NEW.policy_version OR latest.state <> 'configured'
     OR (latest.value ->> 'years')::int IS DISTINCT FROM NEW.period_years THEN
    RAISE EXCEPTION 'a retention operation applies the active retention.audit_log period' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*), min(occurred_at), max(occurred_at) INTO n, first_at, last_at
    FROM platform.audit_events WHERE seq BETWEEN NEW.from_seq AND NEW.to_seq;
  IF n <> NEW.event_count OR first_at IS DISTINCT FROM NEW.first_occurred_at
     OR last_at IS DISTINCT FROM NEW.last_occurred_at
     OR NOT EXISTS (SELECT 1 FROM platform.audit_events WHERE seq = NEW.from_seq)
     OR NOT EXISTS (SELECT 1 FROM platform.audit_events WHERE seq = NEW.to_seq) THEN
    RAISE EXCEPTION 'a retention operation names its range as it is' USING ERRCODE = 'check_violation';
  END IF;
  -- Every event is past the period: the latest one's local time plus the calendar years, in the business time zone.
  IF ((NEW.last_occurred_at AT TIME ZONE NEW.time_zone) + make_interval(years => NEW.period_years))
       AT TIME ZONE NEW.time_zone > now() THEN
    RAISE EXCEPTION 'an audit record is archived or deleted only after its retention period' USING ERRCODE = 'check_violation';
  END IF;
  SELECT through_seq INTO sealed FROM platform.audit_chain_seals WHERE id = NEW.seal_id;
  IF sealed IS NULL OR sealed < NEW.to_seq THEN
    RAISE EXCEPTION 'a retention operation is verified against a seal covering its range' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM platform.audit_retention_operations o
              WHERE o.kind = NEW.kind AND o.from_seq <= NEW.to_seq AND o.to_seq >= NEW.from_seq) THEN
    RAISE EXCEPTION 'the range overlaps an earlier % operation', NEW.kind USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_retention_operations_guard BEFORE INSERT ON platform.audit_retention_operations
  FOR EACH ROW EXECUTE FUNCTION platform.audit_retention_operation_guard();
CREATE TRIGGER audit_retention_operations_append_only BEFORE UPDATE OR DELETE ON platform.audit_retention_operations
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER audit_retention_operations_no_truncate BEFORE TRUNCATE ON platform.audit_retention_operations
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

REVOKE UPDATE, DELETE, TRUNCATE ON platform.audit_chain_seals, platform.audit_retention_operations FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON platform.audit_chain_seals, platform.audit_retention_operations FROM %I',
    current_user);
END;
$$;

-- True only inside the transaction that wrote the 'delete' operation named in handyhub.audit_retention, for its range.
CREATE FUNCTION platform.audit_deletion_permitted(p_seq bigint) RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.audit_retention_operations o
     WHERE o.id::text = nullif(current_setting('handyhub.audit_retention', true), '')
       AND o.kind = 'delete'
       AND o.txid = txid_current()
       AND p_seq BETWEEN o.from_seq AND o.to_seq
  )
$$;
COMMENT ON FUNCTION platform.audit_deletion_permitted(bigint) IS
  'True only inside the transaction that wrote the audit retention deletion named in handyhub.audit_retention (TSK-0135).';

-- UPDATE stays refused for every row; DELETE only for a permitted retention deletion. TRUNCATE is unchanged (refused).
DROP TRIGGER audit_events_no_update_delete ON platform.audit_events;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON platform.audit_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER audit_events_retention_delete_only BEFORE DELETE ON platform.audit_events
  FOR EACH ROW WHEN (NOT platform.audit_deletion_permitted(OLD.seq))
  EXECUTE FUNCTION platform.reject_append_only_change();

-- The one delete path: the operation's range, inside its own transaction, with the privilege granted for the
-- statement only. Returns how many events were deleted (always the operation's count, or it raises).
CREATE FUNCTION platform.audit_retention_erase(p_operation uuid) RETURNS bigint LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  op platform.audit_retention_operations;
  n bigint;
BEGIN
  SELECT * INTO op FROM platform.audit_retention_operations WHERE id = p_operation;
  IF op.id IS NULL OR op.kind <> 'delete' OR op.txid <> txid_current() THEN
    RAISE EXCEPTION 'AUDIT_RETENTION_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('handyhub.audit_retention', op.id::text, true);
  EXECUTE format('GRANT DELETE ON platform.audit_events TO %I', current_user);
  DELETE FROM platform.audit_events WHERE seq BETWEEN op.from_seq AND op.to_seq;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE format('REVOKE DELETE ON platform.audit_events FROM %I', current_user);
  PERFORM set_config('handyhub.audit_retention', '', true);
  IF n <> op.event_count THEN
    RAISE EXCEPTION 'AUDIT_RETENTION_COUNT_CHANGED: % deleted, % recorded', n, op.event_count USING ERRCODE = 'P0001';
  END IF;
  RETURN n;
END;
$$;
COMMENT ON FUNCTION platform.audit_retention_erase(uuid) IS
  'Deletes the range of the audit retention deletion its own transaction wrote (TSK-0135); the only audit delete path.';
