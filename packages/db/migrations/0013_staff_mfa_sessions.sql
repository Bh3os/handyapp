-- 0013 Staff session lifecycle and optional MFA (TSK-0015; HH-SEC-02, HH-STAFF-01, OWN-DEC-114, OWN-DEC-141).
-- - staff_sessions gains a state: 'mfa_pending' after a correct password while an authenticator is enrolled, until
--   the TOTP or recovery code is given; only a 'complete' session acts for its user. Rotation (new token, old row
--   revoked as 'rotated') happens on re-authentication and on every MFA step.
-- - staff_mfa holds one optional TOTP authenticator per staff user. The shared secret is sealed with AES-256-GCM under
--   the host key MFA_ENCRYPTION_KEY and never returned after enrolment; last_used_step stops a code being replayed.
-- - staff_recovery_codes holds single-use recovery codes, SHA-256 only, shown once when MFA is confirmed.
ALTER TABLE identity.staff_sessions
  ADD COLUMN state text NOT NULL DEFAULT 'complete' CHECK (state IN ('mfa_pending', 'complete'));
ALTER TABLE identity.staff_sessions DROP CONSTRAINT staff_sessions_revoke_reason_check;
ALTER TABLE identity.staff_sessions ADD CONSTRAINT staff_sessions_revoke_reason_check CHECK (
  revoke_reason IN ('sign_out', 'idle_expired', 'password_set', 'disabled', 'revoked_by_owner', 'rotated',
                    'revoked_all', 'mfa_changed', 'mfa_pending_expired')
);

CREATE TABLE identity.staff_mfa (
  staff_user_id   uuid PRIMARY KEY REFERENCES identity.staff_users (id),
  kind            text NOT NULL DEFAULT 'totp' CHECK (kind = 'totp'),
  secret_sealed   text NOT NULL CHECK (secret_sealed ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  last_used_step  bigint
);

CREATE TABLE identity.staff_recovery_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id  uuid NOT NULL REFERENCES identity.staff_users (id),
  code_hash      text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  used_at        timestamptz
);
CREATE INDEX staff_recovery_codes_open ON identity.staff_recovery_codes (staff_user_id) WHERE used_at IS NULL;
