-- 0003 Transactional outbox and Postgres job queue (TSK-0012; HH-ARC-08, HH-ARC-09, HH-AUTO-01, ENT-OutboxEvent).
-- An outbox event is written in the same transaction as the business change it announces (outbox.add inside withTx).
-- The in-process worker dispatches each pending event into one job per declared automation (job_key makes this
-- idempotent), claims runnable jobs with FOR UPDATE SKIP LOCKED, retries with bounded exponential backoff and ends
-- in 'failed', which the staff exceptions queue shows. Payloads hold identifiers only, never secrets or message text.
-- A critical hold never goes through this path: it is written with the hazard report under the job lock.
CREATE TABLE platform.outbox_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  type              text NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND char_length(type) <= 120),
  aggregate_type    text NOT NULL CHECK (aggregate_type ~ '^[a-z][a-z0-9_]*$' AND char_length(aggregate_type) <= 60),
  aggregate_id      text CHECK (char_length(aggregate_id) <= 100),
  aggregate_version integer CHECK (aggregate_version >= 0),
  payload           jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  idempotency_key   text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_id        text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  state             text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'dispatched')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  dispatched_at     timestamptz,
  jobs_created      integer CHECK (jobs_created >= 0),
  CHECK ((state = 'dispatched') = (dispatched_at IS NOT NULL AND jobs_created IS NOT NULL))
);
CREATE INDEX outbox_events_pending ON platform.outbox_events (seq) WHERE state = 'pending';
CREATE INDEX outbox_events_aggregate ON platform.outbox_events (aggregate_type, aggregate_id, seq);

CREATE TABLE platform.jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  automation        text NOT NULL CHECK (automation ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' AND char_length(automation) <= 120),
  job_key           text NOT NULL UNIQUE CHECK (char_length(job_key) BETWEEN 1 AND 300),
  outbox_event_id   uuid REFERENCES platform.outbox_events (id),
  event_type        text,
  target_type       text CHECK (target_type ~ '^[a-z][a-z0-9_]*$'),
  target_id         text CHECK (char_length(target_id) <= 100),
  payload           jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  request_id        text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  state             text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  run_at            timestamptz NOT NULL DEFAULT now(),
  attempts          integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts      integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 100),
  -- The previous attempt ended without a known outcome (its lease expired); reconcile before running it again.
  interrupted       boolean NOT NULL DEFAULT false,
  locked_by         text,
  locked_until      timestamptz,
  last_error_class  text CHECK (char_length(last_error_class) <= 120),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  CHECK (attempts <= max_attempts),
  CHECK ((state = 'running') = (locked_by IS NOT NULL AND locked_until IS NOT NULL)),
  CHECK ((state IN ('succeeded', 'failed', 'cancelled')) = (finished_at IS NOT NULL)),
  CHECK ((outbox_event_id IS NULL) = (event_type IS NULL))
);
CREATE INDEX jobs_runnable ON platform.jobs (run_at, seq) WHERE state = 'queued';
CREATE INDEX jobs_running ON platform.jobs (locked_until) WHERE state = 'running';
CREATE INDEX jobs_failed ON platform.jobs (updated_at) WHERE state = 'failed';
