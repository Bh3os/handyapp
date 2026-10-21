-- 0054 Staff management: account status history, at least one active Owner, and the action-queue items of flagged
-- appointments (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, HH-OPS-01, T27, ENT-StaffUser, ENT-RoleGrant,
-- ENT-QueueItem, OWN-DEC-114, OWN-DEC-123).
-- - identity.staff_status_changes keeps every disabling and re-enabling of an account (who, when, from and to, the
--   reason), append-only: the account row keeps only its current state (its disabled time is cleared when the Owner
--   re-enables it), so this is the account's history next to the audit log.
-- - At least one active Owner always remains once there is one: disabling the last active Owner, or ending the last
--   active Owner's Owner grant, is refused at commit (a deferred constraint trigger, after the same advisory lock the
--   server takes, so two concurrent changes cannot both pass). A database without an active Owner (before the first
--   Owner sets a password) is unaffected.
-- - Appointments flagged by an availability change (work.reservation_flags, migration 0052: recorded time off, new
--   working hours, a disabled account, a retired item) get one action-queue item per visit (type visit_flagged,
--   apps/server/src/modules/queue/registry.ts), opened in the same transaction as the flag whatever path wrote it, and
--   updated or resolved in the same transaction as anything that changes it: the flagged reservation ended (reassigned,
--   rescheduled or released, TSK-0066), the visit no longer upcoming, the account re-enabled or the time off withdrawn.
--   Nothing is cancelled (OWN-DEC-123). The reason shown is the most pressing cause (a disabled assignee first).
--   PROPOSED: a working-hours or equipment flag stays until its reservation ends; the item is due when the visit's
--   reserved range starts; an item of a visit on today's local date is in the today_change band.

CREATE TABLE identity.staff_status_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES identity.staff_users (id),
  from_status   text NOT NULL CHECK (from_status IN ('invited', 'active', 'disabled')),
  to_status     text NOT NULL CHECK (to_status IN ('invited', 'active', 'disabled')),
  changed_by    uuid NOT NULL REFERENCES identity.staff_users (id),
  reason        text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (from_status <> to_status),
  -- Only disabling and re-enabling are recorded here; activation is the person setting their password.
  CHECK ((to_status = 'disabled') <> (from_status = 'disabled'))
);
CREATE INDEX staff_status_changes_user ON identity.staff_status_changes (staff_user_id, changed_at);
CREATE TRIGGER staff_status_changes_append_only BEFORE UPDATE OR DELETE ON identity.staff_status_changes
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE identity.staff_status_changes IS
  'Disabling and re-enabling of staff accounts (HH-STAFF-02, OWN-DEC-123): append-only history.';

-- The advisory lock the server takes before changing an Owner grant or disabling an account (staff module).
CREATE FUNCTION identity.lock_owners() RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('identity.owners', 0))
$$;

CREATE FUNCTION identity.active_owner_exists() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.role_grants g JOIN identity.staff_users u ON u.id = g.staff_user_id
     WHERE g.kind = 'role' AND g.name = 'owner' AND g.ended_at IS NULL AND u.status = 'active'
       AND g.effective_from <= now())
$$;

-- Fires for a change that may remove an active Owner; checks at commit that one remains.
CREATE FUNCTION identity.keep_an_active_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected boolean;
BEGIN
  IF TG_TABLE_NAME = 'staff_users' THEN
    -- An active account left 'active' and held (or held until this transaction) an Owner grant.
    affected := OLD.status = 'active' AND NEW.status <> 'active' AND EXISTS (
      SELECT 1 FROM identity.role_grants g
       WHERE g.staff_user_id = NEW.id AND g.kind = 'role' AND g.name = 'owner'
         AND (g.ended_at IS NULL OR g.xmin = pg_current_xact_id()::xid));
  ELSE
    -- An Owner grant ended, of an account that is (or was until this transaction) active.
    affected := OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND NEW.kind = 'role' AND NEW.name = 'owner'
      AND EXISTS (SELECT 1 FROM identity.staff_users u
                   WHERE u.id = NEW.staff_user_id AND (u.status = 'active' OR u.xmin = pg_current_xact_id()::xid));
  END IF;
  IF affected THEN
    PERFORM identity.lock_owners();
    IF NOT identity.active_owner_exists() THEN
      RAISE EXCEPTION 'at least one active Owner account remains' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER staff_users_keep_an_owner AFTER UPDATE OF status ON identity.staff_users
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.keep_an_active_owner();
CREATE CONSTRAINT TRIGGER role_grants_keep_an_owner AFTER UPDATE OF ended_at ON identity.role_grants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.keep_an_active_owner();

-- The causes that still apply to a visit's upcoming active reservations, most pressing first.
CREATE FUNCTION work.visit_open_flag_causes(p_visit uuid) RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(c ORDER BY array_position(
           ARRAY['account_disabled', 'time_off_recorded', 'working_hours_changed', 'equipment_retired'], c)), '{}')
    FROM (
      SELECT DISTINCT f.cause AS c
        FROM work.reservation_flags f
        JOIN work.reservations r ON r.id = f.reservation_id
        LEFT JOIN identity.staff_users u ON u.id = r.staff_user_id
        LEFT JOIN work.time_off o ON f.cause = 'time_off_recorded' AND o.id::text = f.cause_ref
       WHERE f.visit_id = p_visit AND r.ended_at IS NULL AND r.ends_at > now()
         AND (f.cause <> 'account_disabled' OR u.status = 'disabled')
         AND (f.cause <> 'time_off_recorded' OR (o.id IS NOT NULL AND o.withdrawn_at IS NULL))
    ) causes
$$;

-- Opens, updates or resolves the one visit_flagged queue item of a visit, as the visit and its flags are now.
CREATE FUNCTION ops.sync_visit_flagged_item(p_visit uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v record;
  causes text[];
  item_reason text;
  item_band text;
  due timestamptz;
BEGIN
  SELECT vi.id, vi.state, vi.project_id, vi.local_date, vi.time_zone, vi.starts_at, vi.travel_buffer_minutes,
         p.reference
    INTO v
    FROM work.visits vi JOIN crm.projects p ON p.id = vi.project_id
   WHERE vi.id = p_visit;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  causes := work.visit_open_flag_causes(p_visit);
  IF v.state NOT IN ('tentative', 'confirmed') OR cardinality(causes) = 0 THEN
    UPDATE ops.queue_items
       SET resolved_at = now(), updated_at = now(),
           resolution = CASE WHEN v.state IN ('tentative', 'confirmed') THEN 'flags_cleared' ELSE 'visit_' || v.state END
     WHERE type = 'visit_flagged' AND subject_type = 'visit' AND subject_id = p_visit::text AND resolved_at IS NULL;
    RETURN;
  END IF;
  item_reason := CASE causes[1]
    WHEN 'account_disabled' THEN 'assignee_disabled'
    WHEN 'equipment_retired' THEN 'equipment_retired'
    ELSE 'availability_changed' END;
  item_band := CASE WHEN v.local_date = (now() AT TIME ZONE v.time_zone)::date THEN 'today_change'
                    ELSE 'time_sensitive' END;
  due := v.starts_at - make_interval(mins => coalesce(v.travel_buffer_minutes, 0));
  INSERT INTO ops.queue_items (type, subject_type, subject_id, band, project_id, reference, subject_status, reason,
                               due_at)
  VALUES ('visit_flagged', 'visit', p_visit::text, item_band, v.project_id, v.reference, v.state, item_reason, due)
  ON CONFLICT (type, subject_type, subject_id) WHERE resolved_at IS NULL DO UPDATE
     SET band = excluded.band, subject_status = excluded.subject_status, reason = excluded.reason,
         due_at = excluded.due_at, updated_at = now(), version = ops.queue_items.version + 1
   WHERE (ops.queue_items.band, ops.queue_items.subject_status, ops.queue_items.reason, ops.queue_items.due_at)
         IS DISTINCT FROM (excluded.band, excluded.subject_status, excluded.reason, excluded.due_at);
END $$;

CREATE FUNCTION work.flag_opens_queue_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ops.sync_visit_flagged_item(NEW.visit_id);
  RETURN NULL;
END $$;
CREATE TRIGGER reservation_flags_queue AFTER INSERT ON work.reservation_flags
  FOR EACH ROW EXECUTE FUNCTION work.flag_opens_queue_item();

CREATE FUNCTION work.ended_reservation_syncs_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM work.reservation_flags WHERE reservation_id = NEW.id) THEN
    PERFORM ops.sync_visit_flagged_item(NEW.visit_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER reservations_flag_queue AFTER UPDATE OF ended_at ON work.reservations
  FOR EACH ROW EXECUTE FUNCTION work.ended_reservation_syncs_item();

CREATE FUNCTION work.visit_state_syncs_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state
     AND EXISTS (SELECT 1 FROM work.reservation_flags WHERE visit_id = NEW.id) THEN
    PERFORM ops.sync_visit_flagged_item(NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER visits_flag_queue AFTER UPDATE OF state ON work.visits
  FOR EACH ROW EXECUTE FUNCTION work.visit_state_syncs_item();

-- A re-enabled account, or withdrawn time off, no longer flags the visits it flagged.
CREATE FUNCTION work.cleared_cause_syncs_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  visit uuid;
BEGIN
  FOR visit IN
    SELECT DISTINCT f.visit_id FROM work.reservation_flags f
     WHERE (TG_TABLE_NAME = 'staff_users' AND f.cause = 'account_disabled'
            AND f.reservation_id IN (SELECT id FROM work.reservations WHERE staff_user_id = NEW.id))
        OR (TG_TABLE_NAME = 'time_off' AND f.cause = 'time_off_recorded' AND f.cause_ref = NEW.id::text)
  LOOP
    PERFORM ops.sync_visit_flagged_item(visit);
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER staff_users_enabled_queue AFTER UPDATE OF status ON identity.staff_users
  FOR EACH ROW WHEN (OLD.status = 'disabled' AND NEW.status <> 'disabled')
  EXECUTE FUNCTION work.cleared_cause_syncs_items();
CREATE TRIGGER time_off_withdrawn_queue AFTER UPDATE OF withdrawn_at ON work.time_off
  FOR EACH ROW WHEN (OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL)
  EXECUTE FUNCTION work.cleared_cause_syncs_items();
