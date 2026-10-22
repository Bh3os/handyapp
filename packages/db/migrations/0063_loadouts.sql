-- 0063 Loadouts: what each work package needs loaded, what workers confirmed or reported missing, and the task blocks
-- a critical shortage raises (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-01, HH-WORK-02, T43, T45, ENT-WorkPackage,
-- ENT-Hold, ENT-JobPacket, ENT-ChangeOrder, OQ-LOADOUT-DETAILS, RULE-SAFETY-GATES, RULE-NO-INVENTED-FACTS).
-- - catalog.loadout_versions: one version of a service's loadout, imported verbatim from its FACT-INVENTORY-* node
--   (tools/import-loadouts.mjs -> seed/loadouts.json -> syncLoadouts): the vault inventory file's own groups, its
--   checklist items (each with its key, its bold name, its lines and its vault line), its review notes and its
--   "Proposed additions" paragraph (shown as not approved, never an item). No quantity, vendor or stock level is
--   added. PROPOSED (OQ-LOADOUT-DETAILS): every item is required (the files do not say which are nice to have) and
--   not classified into the HH-PKT-05 categories. One version per service is current; a version's content never
--   changes, and a version is superseded once, by a later import of changed content.
-- - work.work_package_loadouts: the loadout version pinned on a work package of a job, set once (the first time the
--   job's loadout or packet is read after the version exists) and never changed: the confirmations of a job always
--   name the exact list they were made against. A package of a service with no version has no row: NOT CONFIGURED.
-- - work.loadout_checks: append-only, one row per worker statement about one item: loaded (loaded and available),
--   missing or damaged, with an optional note; and the Owner's approved substitute, written only by the resolution of
--   a task block. An item's state is its latest row. Nothing ever marks an item equivalent silently (HH-PKT-06).
-- - work.holds gains the task block (ENT-Hold "task blocks for critical resource shortages"): kind task_block, scope
--   work_package, category critical_resource, source loadout. A missing or damaged required item raises one in the
--   same transaction as the worker's report, under the job's lock; at most one blocking block per item. It blocks only
--   its own work package (HH-PKT-06 "Start Work stays blocked for the affected tasks"): never a visit confirmation
--   (0057 does not count it) and never another package. It is released only by a recorded resolution (the item
--   confirmed loaded after the block, or an approved substitute) or a cancellation as entered in error (hold_guard).
-- - The database's own backstop for Start Work: whatever code path writes it, a work package never moves to
--   in_progress while one of its task blocks is open or under review. No role, flag, setting or AI can bypass it.

-- Loadout versions -----------------------------------------------------------------------------------------------------
CREATE TABLE catalog.loadout_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id   text NOT NULL CHECK (inventory_id ~ '^FACT-INVENTORY-[A-Z]{2}-[0-9]{2}$'),
  service_id     text NOT NULL REFERENCES catalog.services (id),
  version        integer NOT NULL CHECK (version >= 1),
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- The vault inventory file the node's list comes from (sources/vault/), and its SHA-256 at import.
  source_file    text NOT NULL CHECK (char_length(source_file) BETWEEN 1 AND 300),
  source_sha256  text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  content        jsonb NOT NULL CHECK (
                   jsonb_typeof(content) = 'object'
                   AND jsonb_typeof(content -> 'groups') = 'array'
                   AND jsonb_array_length(content -> 'groups') >= 1),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  superseded_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, version),
  UNIQUE (id, service_id),
  CONSTRAINT loadout_versions_service CHECK (inventory_id = 'FACT-INVENTORY-' || substring(service_id FROM 5))
);
CREATE UNIQUE INDEX loadout_versions_current ON catalog.loadout_versions (service_id) WHERE superseded_at IS NULL;
COMMENT ON TABLE catalog.loadout_versions IS
  'Verbatim loadout lists per service from the FACT-INVENTORY nodes (HH-PKT-05); every item PROPOSED required.';

-- An import inserts a current version; the content never changes; a version is superseded once; nothing is deleted.
CREATE FUNCTION catalog.loadout_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'loadout versions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'a loadout version is imported current' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.inventory_id, NEW.service_id, NEW.version, NEW.title, NEW.source_file, NEW.source_sha256,
      NEW.content, NEW.content_sha256, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.inventory_id, OLD.service_id, OLD.version, OLD.title, OLD.source_file,
                       OLD.source_sha256, OLD.content, OLD.content_sha256, OLD.created_at) THEN
    RAISE EXCEPTION 'loadout versions are immutable: import a new version' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'a superseded loadout version is final' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loadout_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON catalog.loadout_versions
  FOR EACH ROW EXECUTE FUNCTION catalog.loadout_version_guard();

-- Whether a loadout version lists an item with this key.
CREATE FUNCTION catalog.loadout_has_item(p_version uuid, p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM catalog.loadout_versions v,
         jsonb_array_elements(v.content -> 'groups') g,
         jsonb_array_elements(g -> 'items') i
    WHERE v.id = p_version AND i ->> 'key' = p_key)
$$;

-- The pinned loadout of a work package ---------------------------------------------------------------------------------
CREATE TABLE work.work_package_loadouts (
  work_package_id    uuid PRIMARY KEY,
  project_id         uuid NOT NULL,
  job_id             uuid NOT NULL,
  service_id         text NOT NULL,
  loadout_version_id uuid NOT NULL,
  pinned_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, loadout_version_id),
  CONSTRAINT work_package_loadouts_package FOREIGN KEY (work_package_id, project_id)
    REFERENCES work.work_packages (id, project_id),
  CONSTRAINT work_package_loadouts_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT work_package_loadouts_version FOREIGN KEY (loadout_version_id, service_id)
    REFERENCES catalog.loadout_versions (id, service_id)
);
CREATE INDEX work_package_loadouts_job ON work.work_package_loadouts (job_id);
CREATE TRIGGER work_package_loadouts_append_only BEFORE UPDATE OR DELETE ON work.work_package_loadouts
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.work_package_loadouts IS
  'The loadout version pinned on each work package of a job (HH-PKT-05): set once, never changed.';

-- A pin belongs to a package of that job and of that service.
CREATE FUNCTION work.work_package_loadout_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work.work_packages
                 WHERE id = NEW.work_package_id AND job_id = NEW.job_id AND service_id = NEW.service_id) THEN
    RAISE EXCEPTION 'a loadout is pinned on a work package of its job and service' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_package_loadouts_check BEFORE INSERT ON work.work_package_loadouts
  FOR EACH ROW EXECUTE FUNCTION work.work_package_loadout_check();

-- Task blocks on work.holds --------------------------------------------------------------------------------------------
ALTER TABLE work.holds DROP CONSTRAINT holds_kind_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_kind_check CHECK (kind IN ('review', 'task_block'));
ALTER TABLE work.holds DROP CONSTRAINT holds_scope_type_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_scope_type_check CHECK (scope_type IN ('request', 'work_package'));
ALTER TABLE work.holds DROP CONSTRAINT holds_category_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_category_check CHECK (category IN ('hazardous_material', 'licensed_trade',
  'structural', 'permit_licensing', 'other', 'critical_resource'));
ALTER TABLE work.holds DROP CONSTRAINT holds_source_check;
ALTER TABLE work.holds ADD CONSTRAINT holds_source_check CHECK (source IN ('qualification', 'loadout'));
-- A task block is a critical-resource block on one work package, raised from the loadout; nothing else is.
ALTER TABLE work.holds ADD CONSTRAINT holds_task_block CHECK (
  (kind = 'task_block') = (scope_type = 'work_package')
  AND (kind = 'task_block') = (category = 'critical_resource')
  AND (kind = 'task_block') = (source = 'loadout')
  AND (kind <> 'task_block' OR (request_id IS NULL AND source_ref ~ '^item:[0-9]{1,4}$')));
-- At most one blocking task block per item of a work package.
CREATE UNIQUE INDEX holds_task_block_item ON work.holds (scope_id, source_ref)
  WHERE kind = 'task_block' AND state IN ('open', 'under_review');

-- A task block names a work package of its own project.
CREATE FUNCTION work.task_block_scope_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'task_block' AND NOT EXISTS (
       SELECT 1 FROM work.work_packages WHERE id = NEW.scope_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'a task block names a work package of its project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER holds_task_block_scope BEFORE INSERT ON work.holds
  FOR EACH ROW EXECUTE FUNCTION work.task_block_scope_check();

-- Loadout checks -------------------------------------------------------------------------------------------------------
CREATE TABLE work.loadout_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id    uuid NOT NULL,
  project_id         uuid NOT NULL,
  job_id             uuid NOT NULL,
  loadout_version_id uuid NOT NULL,
  item_key           text NOT NULL CHECK (item_key ~ '^[0-9]{1,4}$'),
  -- loaded: loaded and available; missing; damaged; substitute_approved: the Owner's resolution of a task block.
  status             text NOT NULL CHECK (status IN ('loaded', 'missing', 'damaged', 'substitute_approved')),
  -- What the worker saw, or the approval's note, as staff wrote it. Staff only.
  note               text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  -- The approved substitute, named (never "equivalent"); only on substitute_approved.
  substitute         text CHECK (char_length(btrim(substitute)) BETWEEN 1 AND 300),
  -- What the approved substitute affects (HH-PKT-06), as the approver recorded it; only on substitute_approved. A
  -- substitute that affects the customer is a change order (HH-CHG-02) and is never recorded here.
  impacts            text[] CHECK (impacts <@ ARRAY['safety', 'appearance', 'specification', 'price', 'warranty']),
  -- The task block this statement raised (missing or damaged) or resolved (substitute_approved).
  hold_id            uuid REFERENCES work.holds (id),
  recorded_by        uuid NOT NULL REFERENCES identity.staff_users (id),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loadout_checks_pin FOREIGN KEY (work_package_id, loadout_version_id)
    REFERENCES work.work_package_loadouts (work_package_id, loadout_version_id),
  CONSTRAINT loadout_checks_job FOREIGN KEY (job_id, project_id) REFERENCES work.jobs (id, project_id),
  CONSTRAINT loadout_checks_substitute CHECK (
    (status = 'substitute_approved') = (substitute IS NOT NULL)
    AND (status = 'substitute_approved') = (impacts IS NOT NULL)
    AND (status <> 'substitute_approved' OR (hold_id IS NOT NULL AND note IS NOT NULL))
    AND (status <> 'loaded' OR hold_id IS NULL))
);
CREATE INDEX loadout_checks_item ON work.loadout_checks (work_package_id, item_key, recorded_at);
CREATE INDEX loadout_checks_job ON work.loadout_checks (job_id, recorded_at);
CREATE TRIGGER loadout_checks_append_only BEFORE UPDATE OR DELETE ON work.loadout_checks
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
COMMENT ON TABLE work.loadout_checks IS
  'Append-only loadout statements per item (HH-PKT-05): loaded, missing, damaged, or an approved substitute.';

-- A check names an item of the pinned version, on a package of its job; a block it names is that package's.
CREATE FUNCTION work.loadout_check_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT catalog.loadout_has_item(NEW.loadout_version_id, NEW.item_key) THEN
    RAISE EXCEPTION 'loadout item % is not on the pinned loadout', NEW.item_key USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM work.work_package_loadouts
                 WHERE work_package_id = NEW.work_package_id AND job_id = NEW.job_id AND project_id = NEW.project_id)
  THEN
    RAISE EXCEPTION 'a loadout check belongs to its job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.hold_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work.holds WHERE id = NEW.hold_id AND kind = 'task_block' AND scope_id = NEW.work_package_id
         AND source_ref = 'item:' || NEW.item_key) THEN
    RAISE EXCEPTION 'a loadout check names a task block of its own item' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loadout_checks_check BEFORE INSERT ON work.loadout_checks
  FOR EACH ROW EXECUTE FUNCTION work.loadout_check_check();

-- Start Work backstop: a work package never starts while one of its task blocks blocks ---------------------------------
CREATE FUNCTION work.work_package_task_block_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM work.holds
             WHERE kind = 'task_block' AND scope_type = 'work_package' AND scope_id = NEW.id
               AND state IN ('open', 'under_review')) THEN
    RAISE EXCEPTION 'work package % cannot start while a task block is open on it', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_packages_task_block_guard BEFORE UPDATE OF state ON work.work_packages
  FOR EACH ROW WHEN (NEW.state = 'in_progress' AND OLD.state IS DISTINCT FROM 'in_progress')
  EXECUTE FUNCTION work.work_package_task_block_guard();
