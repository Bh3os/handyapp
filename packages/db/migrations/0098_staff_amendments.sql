-- 0098 Staff management amendments (TSK-0151; OWN-DEC-200 H1, H3, H4, H7, OWN-DEC-202; HH-STAFF-02, HH-STAFF-03,
-- HH-FIN-11, T26, T27, T62, ENT-RoleGrant, ENT-StaffUser, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). The server decides who
-- may do what (apps/server/src/modules/staff/members.ts, apps/server/src/modules/capacity/flags.ts); this migration
-- keeps the records true whatever path writes.
-- - H1/H3 reactivation with a permission review: re-enabling a disabled account ends every role and capability grant
--   it still held (ended by the Owner who re-enables it; the rows stay as history) and opens one permission review
--   (identity.permission_reviews) listing each of those grants (identity.permission_review_items). Nothing is restored
--   by itself: each earlier grant is restored only when the Owner confirms it (a new grant, which names the earlier
--   one) or declined. Backstop: an account leaving 'disabled' must hold no grant issued before that transaction, at
--   commit (a deferred constraint trigger), so no path re-enables outdated access. The reset link of the reactivation
--   and the new authenticator enrolment stay as built (migrations 0054, 0071). Accounts re-enabled before this
--   migration keep what the Owner left them.
-- - H4 cash collection: a `collect` grant records the worker's training (the date it was completed and what it
--   covered), given by the Owner; the Worker role alone never collects. Live collect grants without a training record
--   end here (ended by the system); the Owner grants them again with the training. PROPOSED: the training record is a
--   date and a description of up to 2,000 characters.
-- - H7 owner overrides: the Owner may dismiss a working-hours or equipment flag of an upcoming reservation and keep the
--   appointment as it is, with a reason (work.reservation_flag_dismissals, append-only). A time-off flag (employee
--   protection) or a disabled-account flag (PROPOSED: legal, the person no longer works for HandyHub) is a mandatory
--   restriction and is never dismissed. A dismissed flag no longer flags its visit: the visit's action-queue item
--   (visit_flagged, migration 0054) is updated or resolved in the same transaction. A dismissal never touches the
--   Start Work gate, a hold or any other check (RULE-SAFETY-GATES).

-- H4: the training record of a collect grant.
ALTER TABLE identity.role_grants
  ADD COLUMN trained_on date,
  ADD COLUMN training   text CHECK (char_length(btrim(training)) BETWEEN 1 AND 2000),
  ADD CONSTRAINT role_grants_training_pair CHECK ((trained_on IS NULL) = (training IS NULL)),
  ADD CONSTRAINT role_grants_training_collect_only CHECK (trained_on IS NULL OR (kind = 'capability' AND name = 'collect'));

UPDATE identity.role_grants
   SET ended_at = now(), ended_by = 'system:migration-0098'
 WHERE kind = 'capability' AND name = 'collect' AND ended_at IS NULL AND trained_on IS NULL;

ALTER TABLE identity.role_grants ADD CONSTRAINT role_grants_collect_trained
  CHECK (NOT (kind = 'capability' AND name = 'collect') OR trained_on IS NOT NULL OR ended_at IS NOT NULL);
COMMENT ON COLUMN identity.role_grants.trained_on IS
  'A collect grant: the date the worker completed the training the Owner records (OWN-DEC-200 H4).';

-- H1/H3: the permission review of a reactivated account.
CREATE TABLE identity.permission_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id    uuid NOT NULL REFERENCES identity.staff_users (id),
  -- The re-enabling that opened it.
  status_change_id uuid NOT NULL UNIQUE REFERENCES identity.staff_status_changes (id),
  opened_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  -- reviewed: every earlier grant restored or declined; account_disabled: disabled again before the review ended.
  closed_reason    text CHECK (closed_reason IN ('reviewed', 'account_disabled')),
  CHECK ((closed_at IS NULL) = (closed_reason IS NULL))
);
CREATE UNIQUE INDEX permission_reviews_one_open ON identity.permission_reviews (staff_user_id) WHERE closed_at IS NULL;
COMMENT ON TABLE identity.permission_reviews IS
  'The Owner''s permission review of a reactivated staff account (OWN-DEC-200 H1, H3): closed once, never deleted.';

CREATE TABLE identity.permission_review_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        uuid NOT NULL REFERENCES identity.permission_reviews (id),
  -- The grant the account held when it was re-enabled (ended then, kept as history).
  earlier_grant_id uuid NOT NULL UNIQUE REFERENCES identity.role_grants (id),
  decision         text CHECK (decision IN ('restored', 'declined')),
  decided_by       uuid REFERENCES identity.staff_users (id),
  decided_at       timestamptz,
  reason           text CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  -- The new grant that restored it.
  grant_id         uuid UNIQUE REFERENCES identity.role_grants (id),
  CHECK ((decision IS NULL) = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
  CHECK ((coalesce(decision, '') = 'restored') = (grant_id IS NOT NULL))
);
CREATE INDEX permission_review_items_review ON identity.permission_review_items (review_id);
COMMENT ON TABLE identity.permission_review_items IS
  'Each earlier grant of a permission review, restored by the Owner or declined, once (OWN-DEC-200 H3).';

CREATE FUNCTION identity.permission_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'permission reviews are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a permission review opens open' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL
     OR (to_jsonb(NEW) - 'closed_at' - 'closed_reason') IS DISTINCT FROM (to_jsonb(OLD) - 'closed_at' - 'closed_reason')
  THEN
    RAISE EXCEPTION 'a permission review is closed once and never changed otherwise' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.closed_reason = 'reviewed' AND EXISTS (
    SELECT 1 FROM identity.permission_review_items i WHERE i.review_id = NEW.id AND i.decision IS NULL
  ) THEN
    RAISE EXCEPTION 'a permission review ends when every earlier grant is restored or declined'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permission_reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.permission_reviews
  FOR EACH ROW EXECUTE FUNCTION identity.permission_review_guard();

CREATE FUNCTION identity.permission_review_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  review record;
  earlier record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'permission review items are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT r.staff_user_id, r.closed_at INTO review FROM identity.permission_reviews r WHERE r.id = NEW.review_id;
  SELECT g.staff_user_id, g.kind, g.name, g.ended_at INTO earlier
    FROM identity.role_grants g WHERE g.id = NEW.earlier_grant_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.decision IS NOT NULL OR review.closed_at IS NOT NULL OR earlier.staff_user_id <> review.staff_user_id
       OR earlier.ended_at IS NULL THEN
      RAISE EXCEPTION 'a review item lists an ended grant of the reviewed account, undecided'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.decision IS NOT NULL OR NEW.decision IS NULL OR review.closed_at IS NOT NULL
     OR (to_jsonb(NEW) - 'decision' - 'decided_by' - 'decided_at' - 'reason' - 'grant_id')
        IS DISTINCT FROM (to_jsonb(OLD) - 'decision' - 'decided_by' - 'decided_at' - 'reason' - 'grant_id') THEN
    RAISE EXCEPTION 'an earlier grant is restored or declined once, while its review is open'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.decided_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only the Owner reviews permissions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.decision = 'restored' AND NOT EXISTS (
    SELECT 1 FROM identity.role_grants g
     WHERE g.id = NEW.grant_id AND g.staff_user_id = earlier.staff_user_id AND g.kind = earlier.kind
       AND g.name = earlier.name AND g.ended_at IS NULL AND g.id <> NEW.earlier_grant_id
  ) THEN
    RAISE EXCEPTION 'a restored grant is a new live grant of the same role or capability'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permission_review_items_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.permission_review_items
  FOR EACH ROW EXECUTE FUNCTION identity.permission_review_item_guard();

-- At commit: an account that left 'disabled' holds no grant issued before that transaction (earlier access is never
-- restored by the re-enabling itself).
CREATE FUNCTION identity.reenabled_holds_no_earlier_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM identity.role_grants g
     WHERE g.staff_user_id = NEW.id AND g.ended_at IS NULL AND g.effective_from < now()
  ) THEN
    RAISE EXCEPTION 'a re-enabled account keeps no earlier grant: the Owner restores each one in the permission review'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER staff_users_reenabled_without_grants AFTER UPDATE OF status ON identity.staff_users
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.status = 'disabled' AND NEW.status <> 'disabled')
  EXECUTE FUNCTION identity.reenabled_holds_no_earlier_grant();

-- H7: the Owner's dismissal of a discretionary flag, with a reason.
CREATE TABLE work.reservation_flag_dismissals (
  flag_id      uuid PRIMARY KEY REFERENCES work.reservation_flags (id),
  dismissed_by uuid NOT NULL REFERENCES identity.staff_users (id),
  reason       text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  dismissed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER reservation_flag_dismissals_append_only BEFORE UPDATE OR DELETE ON work.reservation_flag_dismissals
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
-- Test data on staging: cleared with the reservation flags by Reset Test Data only (TSK-0141).
CREATE TRIGGER reservation_flag_dismissals_reset_only_truncate BEFORE TRUNCATE ON work.reservation_flag_dismissals
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
COMMENT ON TABLE work.reservation_flag_dismissals IS
  'The Owner kept an appointment as it is despite a working-hours or equipment flag, with a reason (OWN-DEC-200 H7).';

CREATE FUNCTION work.flag_dismissal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  flag_cause text;
BEGIN
  SELECT f.cause INTO flag_cause FROM work.reservation_flags f WHERE f.id = NEW.flag_id;
  IF flag_cause NOT IN ('working_hours_changed', 'equipment_retired') THEN
    RAISE EXCEPTION 'a mandatory restriction is never waived by an override (%)', flag_cause
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.dismissed_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only the Owner dismisses a flag' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservation_flag_dismissals_guard BEFORE INSERT ON work.reservation_flag_dismissals
  FOR EACH ROW EXECUTE FUNCTION work.flag_dismissal_guard();

CREATE FUNCTION work.dismissal_syncs_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ops.sync_visit_flagged_item((SELECT f.visit_id FROM work.reservation_flags f WHERE f.id = NEW.flag_id));
  RETURN NULL;
END $$;
CREATE TRIGGER reservation_flag_dismissals_queue AFTER INSERT ON work.reservation_flag_dismissals
  FOR EACH ROW EXECUTE FUNCTION work.dismissal_syncs_item();

-- The causes that still apply to a visit's upcoming active reservations, most pressing first (migration 0054), without
-- the flags the Owner dismissed.
CREATE OR REPLACE FUNCTION work.visit_open_flag_causes(p_visit uuid) RETURNS text[] LANGUAGE sql STABLE AS $$
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
         AND NOT EXISTS (SELECT 1 FROM work.reservation_flag_dismissals d WHERE d.flag_id = f.id)
    ) causes
$$;
