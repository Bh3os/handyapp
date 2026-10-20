-- 0002 Append-only audit log (TSK-0011; HH-SEC-06, ENT-AuditEvent, RULE-SERVER-AUTHZ, OWN-DEC-123).
-- Written by the server in the same transaction as the action it records. Rows are never changed: UPDATE, DELETE and
-- TRUNCATE are revoked and also rejected by triggers (privileges alone do not bind a superuser or the table owner's
-- re-grant). A correction is a new event. Secrets are redacted before insert (apps/server/src/platform/redact.ts).
-- Retention (7 years, then the owner's deletion review, OWN-DEC-142) is a later, separately audited path (TSK-0099).
CREATE TABLE platform.audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_kind      text NOT NULL CHECK (actor_kind IN ('staff', 'customer', 'guest', 'system')),
  actor_id        text CHECK (char_length(actor_id) <= 100),
  actor_roles     text[] NOT NULL DEFAULT '{}',
  actor_process   text CHECK (char_length(actor_process) <= 100),
  action          text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND char_length(action) <= 120),
  target_type     text NOT NULL CHECK (target_type ~ '^[a-z][a-z0-9_]*$' AND char_length(target_type) <= 60),
  target_id       text CHECK (char_length(target_id) <= 100),
  target_version  integer CHECK (target_version >= 0),
  result          text NOT NULL CHECK (result IN ('succeeded', 'denied', 'failed')),
  reason          text CHECK (char_length(reason) <= 2000),
  summary         jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(summary) = 'object'),
  step_up_used    boolean NOT NULL DEFAULT false,
  request_id      text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  CHECK ((actor_kind IN ('staff', 'customer')) = (actor_id IS NOT NULL)),
  CHECK ((actor_kind = 'system') = (actor_process IS NOT NULL)),
  CHECK (actor_kind = 'staff' OR actor_roles = '{}')
);
CREATE INDEX audit_events_target ON platform.audit_events (target_type, target_id, seq);
CREATE INDEX audit_events_actor ON platform.audit_events (actor_kind, actor_id, seq);
CREATE INDEX audit_events_occurred ON platform.audit_events (occurred_at);
CREATE INDEX audit_events_request ON platform.audit_events (request_id);

CREATE FUNCTION platform.reject_append_only_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % on %.% is not allowed; record a correcting event instead',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER audit_events_no_update_delete BEFORE UPDATE OR DELETE ON platform.audit_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON platform.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_append_only_change();

REVOKE UPDATE, DELETE, TRUNCATE ON platform.audit_events FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON platform.audit_events FROM %I', current_user);
END;
$$;
