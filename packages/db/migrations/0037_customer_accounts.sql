-- 0037 Optional customer accounts with passwordless sign-in (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, HH-INT-14,
-- ENT-CustomerAccount, ENT-CustomerIdentityLink, ENT-AuthIdentity, OWN-DEC-63, OWN-DEC-71, OWN-DEC-87, OWN-DEC-97,
-- OWN-DEC-141, RULE-SERVER-AUTHZ).
-- - customer_accounts: an optional login. The account is its own sign-in subject (ENT-AuthIdentity: stable unique
--   subject, credential type one-time code; there is no customer password and no identity provider, OWN-DEC-63). It
--   signs in with a one-time code sent to its verified email or its verified phone; each sign-in value names the
--   exact value a code proved and when. One active account per sign-in value. The customer and contact it was enrolled
--   from are kept. States active -> closed: closing ends sign-in (the sign-in values are cleared), its sessions and its
--   project links, and never touches a business record (OWN-DEC-71).
-- - customer_identity_links: the evidenced link between an account and one project of a customer and contact. It is
--   created only after a one-time code to that request's own contact value (never from a matching name, email or
--   phone, HH-ID-03); the evidence (how, which channel, which code) is recorded with it. One active link per account
--   and project, so a second enrollment never duplicates anything; the requests, projects and every other record keep
--   their IDs. A revocation is final.
-- - customer_account_changes: each change of a sign-in value, with what proved authority over the account (a fresh
--   sign-in through the old value, or through the account's other verified contact: the documented recovery path,
--   HH-ID-11). The old value is kept so the notice to it can be sent (HH-ID-11), and cleared when the account closes.
-- - customer_sessions: an account session names its account and the contact it signed in with. Which projects it
--   opens is read from the active links on every request, so a revoked link closes access at once.
CREATE TABLE identity.customer_accounts (
  id                uuid PRIMARY KEY,
  credential_type   text NOT NULL DEFAULT 'one_time_code' CHECK (credential_type = 'one_time_code'),
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'closed')),
  sign_in_email     text CHECK (sign_in_email = lower(sign_in_email) AND sign_in_email ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$'
                      AND char_length(sign_in_email) <= 320),
  email_verified_at timestamptz,
  sign_in_phone     text CHECK (sign_in_phone ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  -- The records the account was enrolled from (business records; never changed by the account).
  customer_id       uuid NOT NULL REFERENCES crm.customers (id),
  contact_id        uuid NOT NULL REFERENCES crm.contacts (id),
  enrolled_via      text NOT NULL CHECK (enrolled_via IN ('receipt_offer', 'project_link')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz,
  close_reason      text CHECK (close_reason IN ('owner_deleted')),
  closed_by         text CHECK (char_length(closed_by) BETWEEN 1 AND 200),
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((sign_in_email IS NULL) = (email_verified_at IS NULL)),
  CHECK ((sign_in_phone IS NULL) = (phone_verified_at IS NULL)),
  CHECK (state = 'closed' OR sign_in_email IS NOT NULL OR sign_in_phone IS NOT NULL),
  CHECK (state = 'active' OR (sign_in_email IS NULL AND sign_in_phone IS NULL)),
  CHECK ((state = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((closed_at IS NULL) = (close_reason IS NULL)),
  CHECK ((closed_at IS NULL) = (closed_by IS NULL))
);
CREATE UNIQUE INDEX customer_accounts_email ON identity.customer_accounts (sign_in_email) WHERE state = 'active';
CREATE UNIQUE INDEX customer_accounts_phone ON identity.customer_accounts (sign_in_phone) WHERE state = 'active';
COMMENT ON TABLE identity.customer_accounts IS
  'Optional customer accounts (TSK-0036, ENT-CustomerAccount): one-time-code sign-in to a verified email or phone.';

-- A closed account stays closed; what it was enrolled from never changes.
CREATE FUNCTION identity.customer_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a customer account is closed, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.credential_type, NEW.customer_id, NEW.contact_id, NEW.enrolled_via, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.credential_type, OLD.customer_id, OLD.contact_id, OLD.enrolled_via, OLD.created_at) THEN
    RAISE EXCEPTION 'a customer account keeps what it was enrolled from' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'closed' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'a closed customer account stays closed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_accounts_guard BEFORE UPDATE OR DELETE ON identity.customer_accounts
  FOR EACH ROW EXECUTE FUNCTION identity.customer_account_guard();

CREATE TABLE identity.customer_identity_links (
  id               uuid PRIMARY KEY,
  account_id       uuid NOT NULL REFERENCES identity.customer_accounts (id),
  customer_id      uuid NOT NULL REFERENCES crm.customers (id),
  contact_id       uuid NOT NULL REFERENCES crm.contacts (id),
  project_id       uuid NOT NULL REFERENCES crm.projects (id),
  request_id       uuid NOT NULL REFERENCES intake.requests (id),
  -- ENT-CustomerIdentityLink authority: the requester themselves (representatives and organizations are P2, HH-ID-13).
  authority        text NOT NULL CHECK (authority IN ('owner')),
  -- The evidence: a one-time code to the request's own contact value, entered on the receipt (under that tab's
  -- receipt capability) or in a guest-link session for that project.
  evidence         text NOT NULL CHECK (evidence IN ('receipt_code', 'project_link_code')),
  evidence_channel text NOT NULL CHECK (evidence_channel IN ('email', 'phone')),
  evidence_code_id uuid NOT NULL REFERENCES identity.verification_codes (id),
  state            text NOT NULL CHECK (state IN ('pending_review', 'active', 'revoked')),
  decided_by       text NOT NULL CHECK (char_length(decided_by) BETWEEN 1 AND 200),
  decided_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  revoke_reason    text CHECK (revoke_reason IN ('account_closed', 'corrected_link')),
  revoked_by       text CHECK (char_length(revoked_by) BETWEEN 1 AND 200),
  CHECK ((state = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX customer_identity_links_one_active
  ON identity.customer_identity_links (account_id, project_id) WHERE state <> 'revoked';
CREATE INDEX customer_identity_links_project ON identity.customer_identity_links (project_id);
COMMENT ON TABLE identity.customer_identity_links IS
  'Evidenced account-to-project links (TSK-0036, ENT-CustomerIdentityLink): code-verified, never by matching details.';

-- Record relationships in the data layer (HH-DATA-01): the contact belongs to the project's customer and the request
-- to the project; what a link names and its evidence never change; a revocation is final; nothing is deleted.
CREATE FUNCTION identity.customer_identity_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a customer identity link is revoked, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM crm.projects p
        JOIN crm.contacts c ON c.customer_id = p.customer_id
        JOIN intake.requests r ON r.project_id = p.id
       WHERE p.id = NEW.project_id AND p.customer_id = NEW.customer_id AND c.id = NEW.contact_id
         AND r.id = NEW.request_id
    ) THEN
      RAISE EXCEPTION 'a link names a contact of its project''s customer and a request of that project'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.account_id, NEW.customer_id, NEW.contact_id, NEW.project_id, NEW.request_id, NEW.authority,
      NEW.evidence, NEW.evidence_channel, NEW.evidence_code_id, NEW.decided_by, NEW.decided_at)
     IS DISTINCT FROM (OLD.id, OLD.account_id, OLD.customer_id, OLD.contact_id, OLD.project_id, OLD.request_id,
      OLD.authority, OLD.evidence, OLD.evidence_channel, OLD.evidence_code_id, OLD.decided_by, OLD.decided_at) THEN
    RAISE EXCEPTION 'a customer identity link keeps what it names' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'revoked' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'a revoked link stays revoked' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_identity_links_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.customer_identity_links
  FOR EACH ROW EXECUTE FUNCTION identity.customer_identity_link_guard();

CREATE TABLE identity.customer_account_changes (
  id          uuid PRIMARY KEY,
  account_id  uuid NOT NULL REFERENCES identity.customer_accounts (id),
  kind        text NOT NULL CHECK (kind IN ('email_changed')),
  -- What proved authority over the account: a fresh sign-in through the value being changed, or through the account's
  -- other verified contact (the recovery path).
  authority   text NOT NULL CHECK (authority IN ('old_contact', 'other_contact')),
  -- The value before the change, for the notice to it; cleared when the account closes.
  old_value   text CHECK (char_length(old_value) BETWEEN 3 AND 320),
  session_id  uuid NOT NULL REFERENCES identity.customer_sessions (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_account_changes_account ON identity.customer_account_changes (account_id, created_at DESC);
COMMENT ON TABLE identity.customer_account_changes IS
  'Sign-in value changes of customer accounts (TSK-0036, HH-ID-11): authority proven and the old value for its notice.';

CREATE FUNCTION identity.customer_account_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.old_value IS NOT NULL
     OR (to_jsonb(NEW) - 'old_value') IS DISTINCT FROM (to_jsonb(OLD) - 'old_value') THEN
    RAISE EXCEPTION 'account changes are kept as recorded; only the old value is ever cleared'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_account_changes_guard BEFORE UPDATE OR DELETE ON identity.customer_account_changes
  FOR EACH ROW EXECUTE FUNCTION identity.customer_account_change_guard();

ALTER TABLE identity.customer_sessions
  ADD COLUMN account_id uuid REFERENCES identity.customer_accounts (id),
  ADD COLUMN sign_in_channel text CHECK (sign_in_channel IN ('email', 'phone')),
  ADD CONSTRAINT customer_sessions_account CHECK ((via = 'account') = (account_id IS NOT NULL)),
  ADD CONSTRAINT customer_sessions_account_channel CHECK ((account_id IS NULL) = (sign_in_channel IS NULL));
CREATE INDEX customer_sessions_account ON identity.customer_sessions (account_id) WHERE revoked_at IS NULL;
COMMENT ON COLUMN identity.customer_sessions.account_id IS 'The customer account an account session signed in to.';

-- The notice to the old value after a sign-in value change (HH-ID-11) is the message account.contact_changed. It is
-- not on the owner's automatic-message list (FACT-AUTOMATIC-MESSAGES) and has no approved wording, so nothing is seeded
-- here: until the owner decides (OQ-ACCOUNT-CONTACT-NOTICE), changing a sign-in email answers NOT CONFIGURED.
