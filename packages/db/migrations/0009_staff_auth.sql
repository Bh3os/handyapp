-- 0009 Staff accounts and sign-in (TSK-0014; HH-STAFF-01, HH-SEC-02, OWN-DEC-114, ENT-StaffUser, ENT-AuthIdentity,
-- ENT-RoleGrant). Invite-only staff accounts, email-and-password identities hashed with argon2id, role grants,
-- single-use invite and reset links, and server-side sessions.
-- - The password hash lives only in identity.auth_identities, so no staff query returns it by accident.
-- - Link tokens and session tokens are random 256-bit values; only their SHA-256 is stored.
-- - A role grant is ended by recording when it ended, never edited otherwise; links and sessions only ever move
--   forward (consumed, invalidated, revoked).
CREATE SCHEMA IF NOT EXISTS identity;
COMMENT ON SCHEMA identity IS 'Staff accounts, sign-in identities, role grants, links and sessions (OWN-DEC-114).';

CREATE TABLE identity.staff_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   text CHECK (char_length(display_name) BETWEEN 1 AND 120),
  email          text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND char_length(email) <= 254),
  locale         text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  status         text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  invited_at     timestamptz NOT NULL DEFAULT now(),
  activated_at   timestamptz,
  disabled_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((status = 'active') <= (activated_at IS NOT NULL)),
  CHECK ((status = 'disabled') = (disabled_at IS NOT NULL))
);

-- One email-and-password identity per staff user. A customer identity never lives here (ENT-AuthIdentity).
CREATE TABLE identity.auth_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id    uuid NOT NULL UNIQUE REFERENCES identity.staff_users (id),
  kind             text NOT NULL DEFAULT 'staff_password' CHECK (kind = 'staff_password'),
  password_hash    text CHECK (password_hash LIKE '$argon2id$%'),
  password_set_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((password_hash IS NULL) = (password_set_at IS NULL))
);

CREATE TABLE identity.role_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id  uuid NOT NULL REFERENCES identity.staff_users (id),
  kind           text NOT NULL CHECK (kind IN ('role', 'capability')),
  name           text NOT NULL CHECK (
    (kind = 'role' AND name IN ('owner', 'office', 'estimator', 'worker')) OR (kind = 'capability' AND name IN ('collect'))
  ),
  issued_by      text NOT NULL CHECK (char_length(issued_by) BETWEEN 1 AND 100),
  reason         text CHECK (char_length(reason) <= 2000),
  effective_from timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  ended_by       text CHECK (char_length(ended_by) <= 100),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX role_grants_one_live ON identity.role_grants (staff_user_id, kind, name) WHERE ended_at IS NULL;

CREATE FUNCTION identity.role_grants_end_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.ended_at IS NOT NULL
     OR (to_jsonb(NEW) - 'ended_at' - 'ended_by') IS DISTINCT FROM (to_jsonb(OLD) - 'ended_at' - 'ended_by') THEN
    RAISE EXCEPTION 'role grants are ended once, never edited or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER role_grants_end_only BEFORE UPDATE OR DELETE ON identity.role_grants
  FOR EACH ROW EXECUTE FUNCTION identity.role_grants_end_only();

-- Invite and reset links. The token hash is written when the link is delivered (by the send job or the operations
-- command), so the plain token never sits in the outbox or the database.
CREATE TABLE identity.staff_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  purpose         text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  token_hash      text UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_by       text NOT NULL CHECK (char_length(issued_by) BETWEEN 1 AND 100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  delivered_at    timestamptz,
  consumed_at     timestamptz,
  invalidated_at  timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((token_hash IS NULL) = (delivered_at IS NULL))
);
CREATE INDEX staff_links_open ON identity.staff_links (staff_user_id) WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE identity.staff_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id   uuid NOT NULL REFERENCES identity.staff_users (id),
  token_hash      text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  -- The last password entry (sign-in or re-authentication): fresh authentication for sensitive actions.
  authenticated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  revoke_reason   text CHECK (revoke_reason IN ('sign_out', 'idle_expired', 'password_set', 'disabled', 'revoked_by_owner')),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX staff_sessions_live ON identity.staff_sessions (staff_user_id) WHERE revoked_at IS NULL;

-- Fixed-window counters for sign-in, reset and link rate limits. Keys are SHA-256 hashes, never raw addresses.
CREATE TABLE identity.rate_limits (
  bucket        text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 60),
  key_hash      text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL CHECK (hits >= 0),
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX rate_limits_window ON identity.rate_limits (window_start);
