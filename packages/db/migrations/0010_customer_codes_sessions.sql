-- 0010 Customer one-time codes and customer sessions (TSK-0016; HH-INT-13, HH-ID-06, HH-SEC-02, HH-ARC-06,
-- OWN-DEC-96, OWN-DEC-141, FACT-SESSION-TIMINGS).
-- - verification_codes: one row per issued code. The code itself is never stored: the row keeps a random nonce, from
--   which the delivery job derives the code with the server's code key, and a keyed digest the verifier compares in
--   constant time. Expiry and the attempt limit are copied from configuration when the code is issued. Delivery is
--   the automatic message contact.verification_code (TSK-0047): its state is in platform.message_deliveries. Its
--   templates are not seeded here: only owner-worded templates are (T74); until a version is released the message
--   is NOT CONFIGURED and no code is sent.
-- - verification_attempts: every verification attempt with its keyed client-address digest, for the per-address limit.
--   No code and no raw address is stored.
-- - customer_sessions: server-side customer sessions; the cookie holds a random token, the row only its SHA-256.
--   Idle and maximum lifetimes are copied from configuration when the session starts; a session can be revoked.
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.verification_codes (
  id               uuid PRIMARY KEY,
  purpose          text NOT NULL CHECK (purpose IN ('contact_verification', 'project_access', 'account_sign_in')),
  channel          text NOT NULL CHECK (channel IN ('email', 'sms')),
  -- The normalised destination (lower-case e-mail or E.164 number) the code is sent to.
  destination      text NOT NULL CHECK (char_length(destination) BETWEEN 3 AND 320),
  -- What the code proves ownership for, as the calling feature names it (for example `contact:<id>`).
  subject_ref      text NOT NULL CHECK (char_length(subject_ref) BETWEEN 1 AND 200),
  nonce            text NOT NULL CHECK (nonce ~ '^[0-9a-f]{32}$'),
  code_digest      text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  client_key       text CHECK (client_key IS NULL OR client_key ~ '^[0-9a-f]{64}$'),
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts     integer NOT NULL CHECK (max_attempts >= 1),
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz,
  superseded_at    timestamptz,
  request_id       text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (attempts <= max_attempts)
);
CREATE INDEX verification_codes_destination ON identity.verification_codes (destination, created_at DESC);
CREATE INDEX verification_codes_target ON identity.verification_codes (purpose, destination, subject_ref, created_at DESC);
CREATE INDEX verification_codes_client ON identity.verification_codes (client_key, created_at DESC);
COMMENT ON TABLE identity.verification_codes IS
  'Issued one-time codes (TSK-0016): nonce and keyed digest only, never the code itself.';

CREATE TABLE identity.verification_attempts (
  id          bigserial PRIMARY KEY,
  code_id     uuid REFERENCES identity.verification_codes (id),
  client_key  text CHECK (client_key IS NULL OR client_key ~ '^[0-9a-f]{64}$'),
  succeeded   boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_attempts_client ON identity.verification_attempts (client_key, created_at DESC);
COMMENT ON TABLE identity.verification_attempts IS 'Verification attempts per client-address digest (TSK-0016).';

CREATE TABLE identity.customer_sessions (
  id               uuid PRIMARY KEY,
  token_hash       text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- The verified contact the session belongs to, as the calling feature names it.
  contact_ref      text NOT NULL CHECK (char_length(contact_ref) BETWEEN 1 AND 200),
  via              text NOT NULL CHECK (via IN ('grant', 'account')),
  project_ids      text[] NOT NULL DEFAULT '{}',
  verified_at      timestamptz NOT NULL,
  fresh_until      timestamptz NOT NULL,
  idle_minutes     integer NOT NULL CHECK (idle_minutes >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  revoke_reason    text,
  CHECK (expires_at > created_at),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX customer_sessions_contact ON identity.customer_sessions (contact_ref) WHERE revoked_at IS NULL;
COMMENT ON TABLE identity.customer_sessions IS 'Customer sessions (TSK-0016): SHA-256 of the cookie token only.';

-- Attempt, resend and per-address limits (HH-ID-06 "a bounded number of attempts and resends", HH-INT-11). The owner
-- has not set the numbers, so these engineering values are PROPOSED (proposed = true) until the owner confirms them;
-- the fresh-verification window is the 15 minutes HH-ID-07 proposes. Code lifetime and session timings are the
-- decided session.timings (OWN-DEC-141).
INSERT INTO platform.policy_version (key, version, state, value, proposed, source_ids, changed_by) VALUES
  ('verification.limits', 1, 'configured',
   '{"codeDigits": 6, "maxAttemptsPerCode": 5, "resendCooldownSeconds": 30, "maxCodesPerDestinationPerHour": 5, "maxCodesPerClientPerHour": 20, "maxFailedAttemptsPerClientPerHour": 30, "freshVerificationMinutes": 15}',
   true, ARRAY['HH-ID-06', 'HH-INT-11', 'HH-ID-07', 'OWN-DEC-96'], 'migration:0010');
