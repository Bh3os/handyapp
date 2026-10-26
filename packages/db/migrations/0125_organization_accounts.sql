-- 0125 Organization accounts with explicit memberships and scopes (TSK-0118; HH-ID-13, HH-ID-03, HH-ID-02, T20,
-- ENT-CustomerAccount, ENT-CustomerIdentityLink, ENT-Property, RULE-SERVER-AUTHZ).
-- The server decides who may see and do what (apps/server/src/modules/accounts/organizations.ts and the policy's
-- organization access); this migration keeps the records true whatever path writes. Everything is granted
-- explicitly: nothing here is ever derived from a matching name, address, email or email domain (HH-ID-02, HH-ID-13).
-- - organizations: a customer-side organization (a property manager, a landlord, a business) set up by a signed-in
--   customer account, its administrator. PROPOSED (OQ-ORGANIZATION-ACCOUNTS-DETAILS): one administrator, the account
--   that set it up; the name is the customer's own words.
-- - organization_projects: the projects the administrator shares with the organization. Only a project the
--   administrator's own account is linked to (an active, code-verified link) can be added; the server reads that link
--   again on every request, so a revoked link or a closed account shares nothing any more. Removing a project removes
--   it from every member's scope (the scope rows cascade).
-- - organization_memberships: one explicit invitation of one exact email address, then its acceptance by the account
--   that signed in with that very address (a code-verified sign-in email): invited -> active -> ended, or invited ->
--   ended (declined or withdrawn). The administrator sets the privileges (approve, pay) and the scope; an ended
--   membership stays ended (a new invitation is a new membership).
-- - organization_scopes: the projects of the organization a membership reaches. A membership never reaches more than
--   its scope, and its scope never more than the organization's projects.
-- - organization_events: the organization's history, append-only: who set it up, every project shared or removed,
--   every invitation, acceptance, change, removal and departure, with the privileges and scope size at that moment.

CREATE TABLE identity.organizations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)),
  administrator_account_id uuid NOT NULL REFERENCES identity.customer_accounts (id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  version                  integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX organizations_administrator ON identity.organizations (administrator_account_id);
COMMENT ON TABLE identity.organizations IS
  'Customer-side organization accounts set up by a signed-in customer account, their administrator (TSK-0118, HH-ID-13).';

-- Set up by an active account; who administers it and when it was set up never change; never deleted.
CREATE FUNCTION identity.organization_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an organization is kept with its history' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.customer_accounts a
                    WHERE a.id = NEW.administrator_account_id AND a.state = 'active') THEN
      RAISE EXCEPTION 'an organization is set up by an active customer account' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.administrator_account_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.administrator_account_id, OLD.created_at) THEN
    RAISE EXCEPTION 'an organization keeps its administrator' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizations_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.organizations
  FOR EACH ROW EXECUTE FUNCTION identity.organization_guard();

CREATE TABLE identity.organization_projects (
  organization_id uuid NOT NULL REFERENCES identity.organizations (id),
  project_id      uuid NOT NULL REFERENCES crm.projects (id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, project_id)
);
CREATE INDEX organization_projects_project ON identity.organization_projects (project_id);
COMMENT ON TABLE identity.organization_projects IS
  'Projects an organization''s administrator shares with it, each one the administrator''s account is linked to (TSK-0118).';

-- Shared only from the administrator's own active link to the project; what a row names never changes.
CREATE FUNCTION identity.organization_project_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a shared project is removed, never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.organizations o
      JOIN identity.customer_accounts a ON a.id = o.administrator_account_id
      JOIN identity.customer_identity_links l ON l.account_id = a.id
     WHERE o.id = NEW.organization_id AND a.state = 'active' AND l.project_id = NEW.project_id AND l.state = 'active'
  ) THEN
    RAISE EXCEPTION 'an organization shares only projects its administrator''s account is linked to'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_projects_guard BEFORE INSERT OR UPDATE ON identity.organization_projects
  FOR EACH ROW EXECUTE FUNCTION identity.organization_project_guard();

CREATE TABLE identity.organization_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES identity.organizations (id),
  -- The exact address the administrator invited; only an account that signed in with it (code-verified) accepts.
  invited_email   text NOT NULL CHECK (invited_email = lower(invited_email)
                    AND invited_email ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$' AND char_length(invited_email) <= 320),
  account_id      uuid REFERENCES identity.customer_accounts (id),
  can_approve     boolean NOT NULL DEFAULT false,
  can_pay         boolean NOT NULL DEFAULT false,
  state           text NOT NULL DEFAULT 'invited' CHECK (state IN ('invited', 'active', 'ended')),
  end_reason      text CHECK (end_reason IN ('declined', 'withdrawn', 'removed', 'left', 'account_closed')),
  invited_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  ended_at        timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (id, organization_id),
  CHECK ((state = 'ended') = (ended_at IS NOT NULL)),
  CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  CHECK ((account_id IS NULL) = (accepted_at IS NULL)),
  CHECK (state <> 'active' OR account_id IS NOT NULL),
  CHECK (state <> 'invited' OR account_id IS NULL),
  CHECK (account_id IS NOT NULL OR end_reason IS NULL OR end_reason IN ('declined', 'withdrawn', 'account_closed'))
);
CREATE UNIQUE INDEX organization_memberships_open_email
  ON identity.organization_memberships (organization_id, invited_email) WHERE state <> 'ended';
CREATE UNIQUE INDEX organization_memberships_active_account
  ON identity.organization_memberships (organization_id, account_id) WHERE state = 'active';
CREATE INDEX organization_memberships_account ON identity.organization_memberships (account_id) WHERE state = 'active';
CREATE INDEX organization_memberships_email ON identity.organization_memberships (invited_email) WHERE state = 'invited';
COMMENT ON TABLE identity.organization_memberships IS
  'Explicit organization memberships: an invitation of one exact email, accepted by the account signed in with it (TSK-0118).';

-- Invited by an organization of an active administrator, never the administrator themself; accepted only by the
-- active account whose verified sign-in email is the invited one; what a membership names never changes; an ended
-- membership stays ended; nothing is deleted.
CREATE FUNCTION identity.organization_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  admin_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a membership ends, it is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT o.administrator_account_id INTO admin_id FROM identity.organizations o WHERE o.id = NEW.organization_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'invited' THEN
      RAISE EXCEPTION 'a membership starts as an invitation' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM identity.customer_accounts a WHERE a.id = admin_id AND a.state = 'active') THEN
      RAISE EXCEPTION 'only an active administrator invites' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM identity.customer_accounts a WHERE a.id = admin_id AND a.sign_in_email = NEW.invited_email)
    THEN
      RAISE EXCEPTION 'the administrator is not invited to their own organization' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.invited_email, NEW.invited_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.invited_email, OLD.invited_at) THEN
    RAISE EXCEPTION 'a membership keeps what it names' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'ended' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'an ended membership stays ended' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.account_id IS NOT NULL AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'a membership keeps the account that accepted it' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'active' AND NEW.state = 'invited' THEN
    RAISE EXCEPTION 'an accepted membership is not an invitation again' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'invited' AND NEW.state = 'active' THEN
    IF NEW.account_id = admin_id OR NOT EXISTS (
      SELECT 1 FROM identity.customer_accounts a
       WHERE a.id = NEW.account_id AND a.state = 'active' AND a.sign_in_email = NEW.invited_email
    ) THEN
      RAISE EXCEPTION 'an invitation is accepted only by the account signed in with the invited email'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_memberships_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION identity.organization_membership_guard();

CREATE TABLE identity.organization_scopes (
  membership_id   uuid NOT NULL,
  organization_id uuid NOT NULL,
  project_id      uuid NOT NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, project_id),
  FOREIGN KEY (membership_id, organization_id) REFERENCES identity.organization_memberships (id, organization_id),
  -- A project the organization no longer shares leaves every scope with it.
  FOREIGN KEY (organization_id, project_id) REFERENCES identity.organization_projects (organization_id, project_id)
    ON DELETE CASCADE
);
CREATE INDEX organization_scopes_project ON identity.organization_scopes (organization_id, project_id);
COMMENT ON TABLE identity.organization_scopes IS
  'The organization projects each membership reaches (TSK-0118): never more than its scope, never more than the organization shares.';

-- Scope changes only while the membership is open; a scope row names one project and never changes.
CREATE FUNCTION identity.organization_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a scope row is removed, never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.organization_memberships m WHERE m.id = NEW.membership_id AND m.state <> 'ended')
  THEN
    RAISE EXCEPTION 'an ended membership''s scope stays as it ended' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_scopes_guard BEFORE INSERT OR UPDATE ON identity.organization_scopes
  FOR EACH ROW EXECUTE FUNCTION identity.organization_scope_guard();

CREATE TABLE identity.organization_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES identity.organizations (id),
  membership_id   uuid REFERENCES identity.organization_memberships (id),
  project_id      uuid REFERENCES crm.projects (id),
  kind            text NOT NULL CHECK (kind IN ('created', 'project_added', 'project_removed', 'member_invited',
                    'invitation_withdrawn', 'invitation_accepted', 'invitation_declined', 'member_changed',
                    'member_removed', 'member_left', 'membership_ended_account_closed')),
  -- Who did it: the administrator, the member, or HandyHub (a login account closed by the Owner).
  actor           text NOT NULL CHECK (actor IN ('administrator', 'member', 'handyhub')),
  -- The membership's privileges and the size of its scope after the change (membership events only).
  can_approve     boolean,
  can_pay         boolean,
  scope_projects  integer CHECK (scope_projects >= 0),
  at              timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('project_added', 'project_removed')) = (project_id IS NOT NULL)),
  CHECK ((kind IN ('created', 'project_added', 'project_removed')) = (membership_id IS NULL)),
  CHECK ((can_approve IS NULL) = (can_pay IS NULL) AND (can_approve IS NULL) = (scope_projects IS NULL))
);
CREATE INDEX organization_events_organization ON identity.organization_events (organization_id, at DESC);
CREATE INDEX organization_events_project ON identity.organization_events (project_id) WHERE project_id IS NOT NULL;
COMMENT ON TABLE identity.organization_events IS
  'The append-only history of each organization: projects shared, invitations, memberships and their changes (TSK-0118).';

-- Append-only. Only the Owner's request erasure (0112) removes the events that name an erased project.
CREATE FUNCTION identity.organization_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'organization history is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER organization_events_append_only BEFORE UPDATE ON identity.organization_events
  FOR EACH ROW EXECUTE FUNCTION identity.organization_event_guard();
CREATE TRIGGER organization_events_guard_erasure BEFORE DELETE ON identity.organization_events
  FOR EACH ROW WHEN (NOT privacy.request_erasure_permitted()) EXECUTE FUNCTION identity.organization_event_guard();

-- A staging test-data reset (TSK-0141) clears all five; outside a permitted reset TRUNCATE is refused.
CREATE TRIGGER organizations_reset_only_truncate BEFORE TRUNCATE ON identity.organizations
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER organization_projects_reset_only_truncate BEFORE TRUNCATE ON identity.organization_projects
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER organization_memberships_reset_only_truncate BEFORE TRUNCATE ON identity.organization_memberships
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER organization_scopes_reset_only_truncate BEFORE TRUNCATE ON identity.organization_scopes
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
CREATE TRIGGER organization_events_reset_only_truncate BEFORE TRUNCATE ON identity.organization_events
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
