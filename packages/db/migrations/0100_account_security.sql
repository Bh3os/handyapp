-- 0100 Customer account security amendments (TSK-0149; OWN-DEC-198 F2, F4, F5, F6; HH-ID-11, HH-ID-09, HH-ID-03,
-- ENT-CustomerAccount, ENT-ProjectAccessGrant, ENT-AuditEvent, RULE-SERVER-AUTHZ). The server decides who may do what
-- (apps/server/src/modules/accounts/security.ts, apps/server/src/modules/access/help.ts); this migration keeps the
-- records true whatever path writes.
-- - identity.access_help_requests: the secure alternative of F4 and F5. A visitor who cannot sign in (texts are not
--   available, or the contact is lost) or cannot get a new project link (the reissue limits, a link staff revoked)
--   asks HandyHub for help with the email or mobile phone they used, and the request reference when they have it.
--   Every request gets the same answer, so nothing here says whether an account or a project exists (F6); the Owner
--   reads it, verifies the person's identity through the contact details on file, and closes it once with an outcome.
--   What the visitor typed never changes and is never a destination: links and codes go only to verified contacts.
-- - identity.customer_account_recoveries: the Owner's staff-assisted recovery of an account after identity
--   verification (the documented, audited recovery process of HH-ID-11). Starting it ends every session of the account
--   (F2) and names the new sign-in email; it completes only when a code sent to that email is entered at sign-in, so
--   the new address is verified by the customer (F3), and the old address is told (MESSAGE 21). One pending recovery
--   per account and per new email; it expires, or the Owner cancels it.
-- - customer_account_changes.authority 'staff_assisted': the email change a completed recovery made.
-- - project_access_grants.issued_reason 'staff_reissue': a new link the Owner sent to the contact on file after
--   verifying identity (F5: staff restore access; a customer's own request never restores a link staff revoked).
-- Customer sessions keep their free-text revoke_reason; a security-triggered revocation records 'security_revoked'.

CREATE TABLE identity.access_help_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the visitor needs: to sign in to their account, or a new link to a project.
  kind          text NOT NULL CHECK (kind IN ('sign_in', 'project_link')),
  -- The email or mobile phone they typed, as stored for comparison (email lower-cased, a US phone in E.164).
  channel       text NOT NULL CHECK (channel IN ('email', 'phone')),
  contact_value text NOT NULL CHECK (char_length(contact_value) BETWEEN 3 AND 320),
  -- The request reference from their receipt, when they gave one (upper-cased).
  reference     text CHECK (char_length(reference) BETWEEN 1 AND 40 AND reference = upper(btrim(reference))),
  created_at    timestamptz NOT NULL DEFAULT now(),
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  outcome       text CHECK (outcome IN ('access_restored', 'identity_not_verified', 'no_match', 'no_action')),
  -- What the Owner did and how identity was verified, in their words.
  note          text CHECK (char_length(note) BETWEEN 1 AND 2000 AND note = btrim(note)),
  closed_by     uuid REFERENCES identity.staff_users (id),
  closed_at     timestamptz,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT access_help_requests_contact CHECK (
    (channel = 'email' AND contact_value = lower(contact_value) AND contact_value ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$')
    OR (channel = 'phone' AND contact_value ~ '^\+[1-9][0-9]{7,14}$')),
  CONSTRAINT access_help_requests_closed CHECK (
    (state = 'closed') = (outcome IS NOT NULL) AND (outcome IS NULL) = (note IS NULL)
    AND (outcome IS NULL) = (closed_by IS NULL) AND (closed_by IS NULL) = (closed_at IS NULL))
);
CREATE INDEX access_help_requests_open ON identity.access_help_requests (created_at) WHERE state = 'open';
CREATE INDEX access_help_requests_contact ON identity.access_help_requests (contact_value, kind) WHERE state = 'open';
COMMENT ON TABLE identity.access_help_requests IS
  'Requests for help signing in or getting a project link (TSK-0149, OWN-DEC-198 F4/F5): one neutral answer each.';

-- Asked open; closed once by the Owner with an outcome and a note; what was asked never changes; never deleted.
CREATE FUNCTION identity.access_help_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'access help requests are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.outcome IS NOT NULL THEN
      RAISE EXCEPTION 'an access help request is asked open' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'open' THEN
    RAISE EXCEPTION 'a closed access help request never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'outcome' - 'note' - 'closed_by' - 'closed_at' - 'version')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'outcome' - 'note' - 'closed_by' - 'closed_at' - 'version') THEN
    RAISE EXCEPTION 'an access help request keeps what was asked' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state <> 'closed' THEN
    RAISE EXCEPTION 'this access help change is not available' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT finance.has_live_role(NEW.closed_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only the Owner closes an access help request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.closed_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER access_help_requests_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.access_help_requests
  FOR EACH ROW EXECUTE FUNCTION identity.access_help_request_guard();

-- What proved authority over the account: the old value, the other verified contact, or the Owner's assisted recovery.
ALTER TABLE identity.customer_account_changes DROP CONSTRAINT customer_account_changes_authority_check;
ALTER TABLE identity.customer_account_changes ADD CONSTRAINT customer_account_changes_authority_check
  CHECK (authority IN ('old_contact', 'other_contact', 'staff_assisted'));

CREATE TABLE identity.customer_account_recoveries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES identity.customer_accounts (id),
  -- The help request it answers, when it came from one.
  help_request_id    uuid REFERENCES identity.access_help_requests (id),
  -- The sign-in email it sets once a code to it is entered.
  new_email          text NOT NULL CHECK (new_email = lower(new_email) AND new_email ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$'
                       AND char_length(new_email) <= 320),
  -- How the Owner verified the person's identity, in their words.
  identity_evidence  text NOT NULL CHECK (char_length(identity_evidence) BETWEEN 1 AND 2000
                       AND identity_evidence = btrim(identity_evidence)),
  started_by         uuid NOT NULL REFERENCES identity.staff_users (id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  state              text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed', 'cancelled')),
  completed_at       timestamptz,
  -- The email change it made (identity.customer_account_changes, authority staff_assisted).
  completed_change_id uuid REFERENCES identity.customer_account_changes (id),
  cancelled_by       uuid REFERENCES identity.staff_users (id),
  cancelled_at       timestamptz,
  CHECK (expires_at > started_at),
  CONSTRAINT customer_account_recoveries_completed CHECK (
    (state = 'completed') = (completed_at IS NOT NULL) AND (completed_at IS NULL) = (completed_change_id IS NULL)),
  CONSTRAINT customer_account_recoveries_cancelled CHECK (
    (state = 'cancelled') = (cancelled_at IS NOT NULL) AND (cancelled_at IS NULL) = (cancelled_by IS NULL))
);
CREATE UNIQUE INDEX customer_account_recoveries_one_pending
  ON identity.customer_account_recoveries (account_id) WHERE state = 'pending';
CREATE UNIQUE INDEX customer_account_recoveries_one_email
  ON identity.customer_account_recoveries (new_email) WHERE state = 'pending';
COMMENT ON TABLE identity.customer_account_recoveries IS
  'Staff-assisted account recoveries (TSK-0149, OWN-DEC-198 F4): identity verified by the Owner, new email by code.';

-- Started pending by the Owner for an active account; completed once (by the code to the new email) or cancelled once
-- by the Owner; what it names and the evidence never change; never deleted.
CREATE FUNCTION identity.customer_account_recovery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'account recoveries are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' THEN
      RAISE EXCEPTION 'an account recovery is started pending' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT finance.has_live_role(NEW.started_by, ARRAY['owner']) THEN
      RAISE EXCEPTION 'only the Owner starts an account recovery' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM identity.customer_accounts a WHERE a.id = NEW.account_id AND a.state = 'active') THEN
      RAISE EXCEPTION 'an account recovery is for an active account' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'a completed or cancelled account recovery never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'completed_at' - 'completed_change_id' - 'cancelled_by' - 'cancelled_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'completed_at' - 'completed_change_id' - 'cancelled_by'
      - 'cancelled_at') THEN
    RAISE EXCEPTION 'an account recovery keeps what it names' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.state = 'cancelled' AND NOT finance.has_live_role(NEW.cancelled_by, ARRAY['owner']) THEN
    RAISE EXCEPTION 'only the Owner cancels an account recovery' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.state = 'completed' AND NOT EXISTS (
    SELECT 1 FROM identity.customer_account_changes ch
     WHERE ch.id = NEW.completed_change_id AND ch.account_id = NEW.account_id AND ch.authority = 'staff_assisted') THEN
    RAISE EXCEPTION 'a completed recovery names its staff-assisted change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_account_recoveries_guard BEFORE INSERT OR UPDATE OR DELETE
  ON identity.customer_account_recoveries
  FOR EACH ROW EXECUTE FUNCTION identity.customer_account_recovery_guard();

-- A new link the Owner sent to the contact on file after verifying identity (F5).
ALTER TABLE identity.project_access_grants DROP CONSTRAINT project_access_grants_issued_reason_check;
ALTER TABLE identity.project_access_grants ADD CONSTRAINT project_access_grants_issued_reason_check
  CHECK (issued_reason IN ('submission', 'contact_change', 'reissue', 'staff_reissue'));

-- A staging reset is the only path that empties these tables (TSK-0141).
CREATE TRIGGER access_help_requests_reset_only_truncate BEFORE TRUNCATE ON identity.access_help_requests
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER customer_account_recoveries_reset_only_truncate BEFORE TRUNCATE ON identity.customer_account_recoveries
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
