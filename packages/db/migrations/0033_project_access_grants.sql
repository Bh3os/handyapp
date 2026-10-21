-- 0033 Project access grants (TSK-0034; HH-ID-04, HH-ID-05, HH-INT-21, HH-ID-03, HH-DATA-01, ENT-ProjectAccessGrant,
-- OWN-DEC-96, OWN-DEC-97, RULE-SERVER-AUTHZ).
-- - project_access_grants: the single-project guest link. One grant names exactly one project and the contact it was
--   issued for (a contact of that project's customer, checked below), with its permitted actions (scope), creation,
--   expiry, revocation (time, reason, actor) and the last time it was exchanged after a verified code. The link's
--   secret is never stored: the row keeps a random nonce, from which the server derives the token with its code key
--   (HMAC-SHA-256, as for one-time codes, TSK-0016), and the token's SHA-256, by which a presented link is found. A
--   retried send therefore carries the same link, and the database alone cannot rebuild one. A reference (HH-XXXX), a
--   database ID or a storage key is never a credential.
-- - The grant is useless on its own: opening it sends a one-time code to the grant's own contact, and only that code,
--   entered by POST, starts a customer session for that one project (HH-ID-05).
-- - customer_sessions.grant_id: the grant a guest session was started from, so revoking a grant ends its sessions.
CREATE TABLE identity.project_access_grants (
  id               uuid PRIMARY KEY,
  project_id       uuid NOT NULL REFERENCES crm.projects (id),
  contact_id       uuid NOT NULL REFERENCES crm.contacts (id),
  -- The request it was issued for (the submission, or a later contact change on its receipt).
  request_id       uuid NOT NULL REFERENCES intake.requests (id),
  -- The permitted actions: the Customer column of ROLE-MATRIX ("V own verified project only") for this one project.
  scope            text NOT NULL CHECK (scope IN ('guest_project')),
  issued_reason    text NOT NULL CHECK (issued_reason IN ('submission', 'contact_change')),
  nonce            text NOT NULL CHECK (nonce ~ '^[0-9a-f]{32}$'),
  token_hash       text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  last_verified_at timestamptz,
  revoked_at       timestamptz,
  revoke_reason    text CHECK (revoke_reason IN ('contact_changed', 'staff_revoked', 'account_deleted', 'corrected_link')),
  revoked_by       text CHECK (char_length(revoked_by) BETWEEN 1 AND 200),
  CHECK (expires_at > created_at),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE INDEX project_access_grants_project ON identity.project_access_grants (project_id, created_at DESC);
CREATE INDEX project_access_grants_request ON identity.project_access_grants (request_id);
COMMENT ON TABLE identity.project_access_grants IS
  'Single-project guest links (TSK-0034, ENT-ProjectAccessGrant): nonce and token hash only, never the token.';

-- Record relationships in the data layer (HH-DATA-01): the contact belongs to the project's customer and the request
-- to the project; what a grant names never changes. Only the exchange time and the revocation are ever written later,
-- and a revocation is final.
CREATE FUNCTION identity.project_access_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a project access grant is revoked, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM crm.projects p
        JOIN crm.contacts c ON c.customer_id = p.customer_id
        JOIN intake.requests r ON r.project_id = p.id
       WHERE p.id = NEW.project_id AND c.id = NEW.contact_id AND r.id = NEW.request_id
    ) THEN
      RAISE EXCEPTION 'a grant names a contact of its project''s customer and a request of that project'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.project_id, NEW.contact_id, NEW.request_id, NEW.scope, NEW.issued_reason, NEW.nonce,
      NEW.token_hash, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.contact_id, OLD.request_id, OLD.scope, OLD.issued_reason, OLD.nonce,
      OLD.token_hash, OLD.created_at, OLD.expires_at) THEN
    RAISE EXCEPTION 'a project access grant keeps what it names' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at, NEW.revoke_reason, NEW.revoked_by)
     IS DISTINCT FROM (OLD.revoked_at, OLD.revoke_reason, OLD.revoked_by) THEN
    RAISE EXCEPTION 'a revoked grant stays revoked' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_access_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.project_access_grants
  FOR EACH ROW EXECUTE FUNCTION identity.project_access_grant_guard();

ALTER TABLE identity.customer_sessions
  ADD COLUMN grant_id uuid REFERENCES identity.project_access_grants (id);
CREATE INDEX customer_sessions_grant ON identity.customer_sessions (grant_id) WHERE revoked_at IS NULL;
COMMENT ON COLUMN identity.customer_sessions.grant_id IS 'The project access grant a guest session was started from.';

-- How long a guest link works (HH-ID-06: "a project access invitation expires after 24 hours (configurable engineering
-- default)"). The owner accepted 24 hours for staff invite links (OWN-DEC-141), not for customer links, so the value is
-- PROPOSED (proposed = true) until the owner confirms it (OQ-ACCESS-LINK-LIFETIME).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('access.grants', 1, 'configured', '{"linkHours": 24}', true, ARRAY['HH-ID-06', 'HH-ID-04', 'ENT-ProjectAccessGrant'],
   'migration:0033');
