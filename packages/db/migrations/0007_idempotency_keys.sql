-- 0007 Idempotency keys (TSK-0010; HH-API-04). One row per (actor, operation, key), written in the same transaction
-- as the write it protects, together with the stored response: a retry with the same key and body returns that
-- response, the same key with a different body is a conflict, and a crash after commit is recoverable because the
-- row only exists once the write committed. Rows expire after their retention period (PROPOSED 24 hours) and are
-- removed by a later cleanup job; an expired key may be reused.
CREATE TABLE platform.idempotency_keys (
  actor_key        text NOT NULL CHECK (char_length(actor_key) BETWEEN 1 AND 120),
  operation        text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 120),
  idempotency_key  text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  body_hash        text NOT NULL CHECK (body_hash ~ '^[0-9a-f]{64}$'),
  response_status  integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_body    jsonb NOT NULL,
  request_id       text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  PRIMARY KEY (actor_key, operation, idempotency_key),
  CHECK (expires_at > created_at)
);
CREATE INDEX idempotency_keys_expires ON platform.idempotency_keys (expires_at);
COMMENT ON TABLE platform.idempotency_keys IS 'Scoped idempotency keys with the stored response (HH-API-04).';
