-- 0017 The staff action queue (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06, HH-API-05, ENT-QueueItem, OWN-DEC-115).
-- One row per open item and subject: module providers (outbox consumers) open, update and resolve items; nobody
-- edits them by hand. The item type decides the section (the queue or Owner Decisions), the matrix action whose
-- holders may see it and its one action (apps/server/src/modules/queue/registry.ts), so visibility follows the
-- permission matrix at read time and never a role list copied into the row.
-- - Idempotent per subject: at most one open item per type and subject (queue_items_one_open). A resolved item keeps
--   its history; the subject needing action again opens a new item.
-- - No restricted field is ever stored here: no access codes, incident details, financial details or internal notes
--   (HH-OPS-02). The reason is a code; a reason that would reveal restricted detail is shown only to the roles that
--   may see it, and the generic reason to everyone else.
-- - Items are never deleted.
CREATE SCHEMA IF NOT EXISTS ops;
COMMENT ON SCHEMA ops IS 'Staff operations: the action queue (OWN-DEC-115).';

CREATE TABLE ops.queue_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]*$' AND char_length(type) <= 60),
  subject_type      text NOT NULL CHECK (subject_type ~ '^[a-z][a-z0-9_]*$' AND char_length(subject_type) <= 60),
  subject_id        text NOT NULL CHECK (char_length(subject_id) BETWEEN 1 AND 100),
  -- Urgency band (OWN-DEC-115): safety, today's appointment changes, time-sensitive, everything else. An item past
  -- its due time is read as time-sensitive (overdue) whatever band it was opened in.
  band              text NOT NULL CHECK (band IN ('safety', 'today_change', 'time_sensitive', 'other')),
  -- The project or customer reference shown on the item, and the project for record-scope checks.
  project_id        uuid REFERENCES crm.projects (id),
  reference         text CHECK (reference ~ '^HH-[0-9A-HJKMNP-TV-Z]{8}$'),
  -- The subject's current status as a code, labelled at render time.
  subject_status    text CHECK (subject_status ~ '^[a-z][a-z0-9_]*$' AND char_length(subject_status) <= 60),
  reason            text NOT NULL CHECK (reason ~ '^[a-z][a-z0-9_]*$' AND char_length(reason) <= 60),
  assigned_staff_id uuid REFERENCES identity.staff_users (id),
  -- Set by the provider that owns the deadline (for a new request, the first-response clock, HH-LEAD-05).
  due_at            timestamptz,
  opened_at         timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolution        text CHECK (resolution ~ '^[a-z][a-z0-9_]*$' AND char_length(resolution) <= 60),
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);
CREATE UNIQUE INDEX queue_items_one_open ON ops.queue_items (type, subject_type, subject_id) WHERE resolved_at IS NULL;
-- HH-API-05 index plan: open items by type in urgency order, by assignee and by reference.
CREATE INDEX queue_items_open_order ON ops.queue_items (type, band, due_at, opened_at, id) WHERE resolved_at IS NULL;
CREATE INDEX queue_items_open_assignee ON ops.queue_items (assigned_staff_id, due_at) WHERE resolved_at IS NULL;
CREATE INDEX queue_items_open_reference ON ops.queue_items (reference text_pattern_ops) WHERE resolved_at IS NULL;
CREATE INDEX queue_items_project ON ops.queue_items (project_id);

-- A resolved item is history: it is never reopened or edited, and no item is deleted.
CREATE FUNCTION ops.queue_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'queue items are resolved, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a resolved queue item is history and never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.type, NEW.subject_type, NEW.subject_id, NEW.opened_at) IS DISTINCT FROM
     (OLD.type, OLD.subject_type, OLD.subject_id, OLD.opened_at) THEN
    RAISE EXCEPTION 'a queue item keeps its type, subject and opening time' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER queue_items_guard BEFORE UPDATE OR DELETE ON ops.queue_items
  FOR EACH ROW EXECUTE FUNCTION ops.queue_item_guard();
COMMENT ON TABLE ops.queue_items IS 'Staff action queue items, one open item per type and subject (ENT-QueueItem).';
