-- 0041 Human-reviewed merges and relinks with Owner reversal (TSK-0046; HH-CRM-04, HH-ID-02, HH-SEC-06, T21, T29,
-- ENT-Customer, ENT-CustomerIdentityLink, ENT-ProjectAccessGrant, ENT-AuditEvent, OWN-DEC-116, OWN-DEC-117).
--
-- A merge or a relink is a link, never a move (OWN-DEC-117 "Merging links to a survivor and keeps original IDs,
-- history, approvals and financial evidence"):
-- - Merge: a duplicate customer is marked merged into a survivor (crm.customers.status / merged_into_id, which 0011
--   already has). Its contacts, properties, projects, requests, notes and every record hanging off them keep their
--   IDs and their customer; the survivor's staff record shows them through the link.
-- - Relink: a request (with its project) that belongs with another customer, or was linked to the wrong one, is
--   linked to that customer. The request keeps its original customer (its submission is never edited, 0011); the
--   project keeps the customer it was created for. The link says where staff now see it.
-- - Nothing re-parents a row: a project and a contact keep the customer they were created for (guards below), so
--   every invoice, payment, approval or document that later hangs off a project or customer stays exactly where it
--   is, and the Owner's reversal of a link restores the earlier picture without erasing anything recorded since.
-- - Access never follows a link. A guest link stays single-project and names a contact of the project's own customer
--   (0033); a link adds no project to any grant or session. Every merge, relink and reversal rechecks the access to
--   the affected projects, and a correction revokes what may have relied on the mistaken link (the server's
--   recheck, recorded on the row and in the audit event).
--
-- crm.record_links: one row per merge or relink, never deleted. The only later change is the Owner's reversal,
-- written once (who, when, why and its own access recheck).

-- 1. The link changes.
CREATE TABLE crm.record_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Order of the changes (a request's current link is its latest one not reversed).
  seq                bigserial NOT NULL UNIQUE,
  kind               text NOT NULL CHECK (kind IN ('merge', 'request_relink')),
  -- merge: the duplicate merged into the survivor. request_relink: the customer the request was linked to before
  -- (its current customer when the change was made).
  source_customer_id uuid NOT NULL REFERENCES crm.customers (id),
  -- merge: the survivor. request_relink: the customer the request is linked to by this change.
  target_customer_id uuid NOT NULL REFERENCES crm.customers (id),
  -- merge: the duplicate's status before the merge, restored by a reversal.
  source_status      text CHECK (source_status IN ('active', 'inactive')),
  request_id         uuid REFERENCES intake.requests (id),
  project_id         uuid REFERENCES crm.projects (id),
  -- The duplicate suggestion the merge was reviewed from, when there was one (HH-ID-02).
  candidate_match_id uuid REFERENCES crm.candidate_matches (id),
  reason             text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  -- What staff saw before confirming (HH-CRM-04 preview): record IDs and versions only, and the preview digest.
  preview            jsonb NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
  -- The change corrected an earlier link: access issued since that link was revoked.
  correction         boolean NOT NULL,
  -- The access recheck of the change: what was checked and what was revoked (IDs and counts only).
  access_recheck     jsonb NOT NULL CHECK (jsonb_typeof(access_recheck) = 'object'),
  performed_by       uuid NOT NULL REFERENCES identity.staff_users (id),
  performed_at       timestamptz NOT NULL DEFAULT now(),
  -- The Owner's reversal (customer.reverse_link_change), written once.
  reversed_at        timestamptz,
  reversed_by        uuid REFERENCES identity.staff_users (id),
  reverse_reason     text CHECK (char_length(btrim(reverse_reason)) BETWEEN 1 AND 1000),
  reversal_recheck   jsonb CHECK (jsonb_typeof(reversal_recheck) = 'object'),
  CHECK (source_customer_id <> target_customer_id),
  CHECK ((kind = 'request_relink') = (request_id IS NOT NULL)),
  CHECK ((kind = 'request_relink') = (project_id IS NOT NULL)),
  CHECK ((kind = 'merge') = (source_status IS NOT NULL)),
  CHECK (kind = 'merge' OR candidate_match_id IS NULL),
  CHECK (
    (reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL AND reversal_recheck IS NULL)
    OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reverse_reason IS NOT NULL
        AND reversal_recheck IS NOT NULL)
  )
);
CREATE INDEX record_links_source ON crm.record_links (source_customer_id, seq);
CREATE INDEX record_links_target ON crm.record_links (target_customer_id, seq);
CREATE INDEX record_links_project ON crm.record_links (project_id, seq) WHERE kind = 'request_relink';
COMMENT ON TABLE crm.record_links IS
  'Human-reviewed merges and relinks with the Owner''s reversal (HH-CRM-04): links, never moves; never deleted.';

-- A link names its records for good; the reversal is written once; a relink names a request of its project.
CREATE FUNCTION crm.record_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a record link is reversed, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'request_relink' AND NOT EXISTS (
      SELECT 1 FROM intake.requests r WHERE r.id = NEW.request_id AND r.project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'a relink names a request and its own project' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a record link starts unreversed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['reversed_at', 'reversed_by', 'reverse_reason', 'reversal_recheck'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['reversed_at', 'reversed_by', 'reverse_reason', 'reversal_recheck']) THEN
    RAISE EXCEPTION 'a record link keeps what it records' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a reversed record link stays reversed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER record_links_guard BEFORE INSERT OR UPDATE OR DELETE ON crm.record_links
  FOR EACH ROW EXECUTE FUNCTION crm.record_link_guard();

-- 2. Links, never moves: a project and a contact keep the customer they were created for, and a customer is merged
-- only into a survivor that is itself not merged (so a chain of merges always ends, and never loops).
CREATE FUNCTION crm.keep_customer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'RECORD_LINKED_NOT_MOVED: % keeps the customer it was created for; merges and relinks are links',
      TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projects_keep_customer BEFORE UPDATE ON crm.projects
  FOR EACH ROW EXECUTE FUNCTION crm.keep_customer_guard();
CREATE TRIGGER contacts_keep_customer BEFORE UPDATE ON crm.contacts
  FOR EACH ROW EXECUTE FUNCTION crm.keep_customer_guard();

CREATE FUNCTION crm.customer_merge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.merged_into_id IS NOT NULL AND NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id THEN
    IF OLD.merged_into_id IS NOT NULL THEN
      RAISE EXCEPTION 'a merged customer is reversed before it is merged again' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM crm.customers s WHERE s.id = NEW.merged_into_id AND s.merged_into_id IS NULL) THEN
      RAISE EXCEPTION 'a customer is merged only into a survivor that is not merged' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customers_merge_guard BEFORE UPDATE ON crm.customers
  FOR EACH ROW EXECUTE FUNCTION crm.customer_merge_guard();
CREATE INDEX customers_merged_into ON crm.customers (merged_into_id) WHERE merged_into_id IS NOT NULL;

-- 3. Where staff see a record now. These resolve links for staff views only; access never uses them.
-- The survivor at the end of a customer's merges (the customer itself when it is not merged).
CREATE FUNCTION crm.customer_root(customer uuid) RETURNS uuid STABLE LANGUAGE sql AS $$
  WITH RECURSIVE up (id, merged_into_id, depth) AS (
    SELECT c.id, c.merged_into_id, 0 FROM crm.customers c WHERE c.id = customer
    UNION ALL
    SELECT c.id, c.merged_into_id, up.depth + 1 FROM crm.customers c JOIN up ON c.id = up.merged_into_id
     WHERE up.depth < 100
  )
  SELECT id FROM up WHERE merged_into_id IS NULL LIMIT 1
$$;

-- A survivor and every customer merged into it, directly or through another merged customer.
CREATE FUNCTION crm.customer_group(root uuid) RETURNS SETOF uuid STABLE LANGUAGE sql AS $$
  WITH RECURSIVE down (id, depth) AS (
    SELECT c.id, 0 FROM crm.customers c WHERE c.id = root
    UNION ALL
    SELECT c.id, down.depth + 1 FROM crm.customers c JOIN down ON c.merged_into_id = down.id WHERE down.depth < 100
  )
  SELECT id FROM down
$$;

-- The customer a project is linked to: its request's latest relink not reversed, otherwise its own customer.
CREATE FUNCTION crm.project_linked_customer(project uuid) RETURNS uuid STABLE LANGUAGE sql AS $$
  SELECT coalesce(
    (SELECT l.target_customer_id FROM crm.record_links l
      WHERE l.kind = 'request_relink' AND l.project_id = project AND l.reversed_at IS NULL
      ORDER BY l.seq DESC LIMIT 1),
    (SELECT p.customer_id FROM crm.projects p WHERE p.id = project)
  )
$$;

-- The customer record staff see a project under: the survivor of the customer it is linked to.
CREATE FUNCTION crm.project_customer(project uuid) RETURNS uuid STABLE LANGUAGE sql AS $$
  SELECT crm.customer_root(crm.project_linked_customer(project))
$$;

-- 4. A duplicate suggestion that staff merged (HH-ID-02, T21): the merge keeps the suggestion; the Owner's reversal
-- of the merge closes it as reviewed and not the same customer.
ALTER TABLE crm.candidate_matches DROP CONSTRAINT candidate_matches_status_check;
ALTER TABLE crm.candidate_matches
  ADD CONSTRAINT candidate_matches_status_check CHECK (status IN ('open', 'dismissed', 'merged'));
ALTER TABLE crm.candidate_match_events DROP CONSTRAINT candidate_match_events_event_check;
ALTER TABLE crm.candidate_match_events DROP CONSTRAINT candidate_match_events_check;
ALTER TABLE crm.candidate_match_events
  ADD CONSTRAINT candidate_match_events_event_check
    CHECK (event IN ('detected', 'reasons_added', 'reopened', 'dismissed', 'merged', 'merge_reversed')),
  ADD CONSTRAINT candidate_match_events_check
    CHECK (event NOT IN ('dismissed', 'merged', 'merge_reversed') OR (reason IS NOT NULL AND staff_id IS NOT NULL));
