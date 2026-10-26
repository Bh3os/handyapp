-- 0112 Erasure of a request that never became a job, with a reference-and-dates remainder (TSK-0137; HH-PRIV-08,
-- HH-PRIV-05, T72, OWN-DEC-176, OWN-DEC-177, OWN-DEC-70, ENT-Request, ENT-ConsentPreference, ENT-RetentionReview,
-- RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW). The server decides what goes (apps/server/src/modules/privacy/
-- request-erasure.ts); this migration lets only the Owner's erasure transaction remove the rows and keeps what stays.
-- - privacy.deletions names a request now: record_type 'request', with the project whose rows it erases. The log and
--   the review queue keep the project's ID after the project is gone (the request's own project is erased with it), so
--   their foreign keys to crm.projects go; both keep references only, never content.
-- - privacy.request_remainders: what remains of an erased request (OWN-DEC-176 "Keep only"): its non-identifying
--   reference, creation date, closure date and final status, and the deletion log entry that erased it (the
--   non-identifying retention metadata). Kept apart from the customer records; append-only.
-- - privacy.consent_evidence: the restricted compliance record (OWN-DEC-176 "consent records"): the consent records of
--   the erased contact's email and phone, moved out of platform.consent_records when nothing else on file uses that
--   destination, each with its own review date. No route reads it. Append-only.
-- - The DELETE guards of the tables the erasure clears stand aside inside the one transaction that wrote a request's
--   deletion log entry and names it in handyhub.erasure (privacy.request_erasure_permitted); updates and inserts are
--   guarded exactly as before. Nothing else may delete those rows.

ALTER TABLE privacy.deletions DROP CONSTRAINT deletions_project_id_fkey;
ALTER TABLE privacy.deletions DROP CONSTRAINT deletions_record_type_check;
ALTER TABLE privacy.deletions
  ADD CONSTRAINT deletions_record_type_check CHECK (record_type IN ('estimate', 'customer_account', 'request'));
ALTER TABLE privacy.deletions DROP CONSTRAINT deletions_check4;
ALTER TABLE privacy.deletions
  ADD CONSTRAINT deletions_project_named CHECK ((record_type IN ('estimate', 'request')) = (project_id IS NOT NULL));
COMMENT ON COLUMN privacy.deletions.project_id IS
  'The project whose rows the erasure removed (an estimate''s, or the request''s own); kept after the project is gone.';

ALTER TABLE privacy.retention_reviews DROP CONSTRAINT retention_reviews_project_id_fkey;
COMMENT ON COLUMN privacy.retention_reviews.project_id IS
  'The project of the record, for the hold checks; kept after an erased request''s project is gone (TSK-0137).';

CREATE TABLE privacy.request_remainders (
  -- The erased request's ID and reference (random, never a sequence: ENT-Request), so a restore can re-apply it.
  request_id   uuid PRIMARY KEY,
  reference    text NOT NULL UNIQUE CHECK (reference ~ '^HH-[0-9A-HJKMNP-TV-Z]{8}$'),
  created_at   timestamptz NOT NULL,
  closed_at    timestamptz NOT NULL,
  final_state  text NOT NULL
                 CHECK (final_state IN ('declined', 'outside_scope', 'not_served', 'withdrawn', 'closed_no_response')),
  deletion_id  uuid NOT NULL REFERENCES privacy.deletions (id),
  erased_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_at >= created_at)
);
CREATE INDEX request_remainders_closed ON privacy.request_remainders (closed_at);
CREATE TRIGGER request_remainders_append_only BEFORE UPDATE OR DELETE ON privacy.request_remainders
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER request_remainders_reset_only_truncate BEFORE TRUNCATE ON privacy.request_remainders
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
COMMENT ON TABLE privacy.request_remainders IS
  'What remains of an erased request that never became a job (HH-PRIV-08, OWN-DEC-176): reference, dates, status.';

CREATE TABLE privacy.consent_evidence (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- The consent record as it was (platform.consent_records), its ID and sequence kept for the evidence trail.
  consent_id         uuid NOT NULL UNIQUE,
  consent_seq        bigint NOT NULL,
  purpose            text NOT NULL CHECK (purpose IN ('service_communication', 'transactional_sms', 'marketing')),
  channel            text NOT NULL CHECK (channel IN ('email', 'sms')),
  destination        text NOT NULL CHECK (char_length(destination) BETWEEN 3 AND 320),
  granted            boolean NOT NULL,
  disclosure_version text CHECK (char_length(disclosure_version) <= 100),
  source             text NOT NULL,
  evidence           jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_by        text NOT NULL,
  recorded_at        timestamptz NOT NULL,
  -- Its own deadline (OWN-DEC-176): the last relevant use of the destination and the review date it sets, a calendar
  -- date in the business time zone (null while the zone is NOT CONFIGURED). Nothing is deleted at that date.
  last_used_at       timestamptz NOT NULL,
  review_on          date,
  deletion_id        uuid NOT NULL REFERENCES privacy.deletions (id),
  moved_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_evidence_review ON privacy.consent_evidence (review_on);
CREATE TRIGGER consent_evidence_append_only BEFORE UPDATE OR DELETE ON privacy.consent_evidence
  FOR EACH ROW EXECUTE FUNCTION platform.reject_append_only_change();
CREATE TRIGGER consent_evidence_reset_only_truncate BEFORE TRUNCATE ON privacy.consent_evidence
  FOR EACH STATEMENT WHEN (NOT staging.reset_permitted()) EXECUTE FUNCTION staging.reject_truncate();
COMMENT ON TABLE privacy.consent_evidence IS
  'Restricted compliance record (OWN-DEC-176): consent evidence of an erased contact, kept with its own review date.';

-- Whether this transaction wrote the request deletion log entry it names in handyhub.erasure.
CREATE FUNCTION privacy.request_erasure_permitted() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM privacy.deletions d
     WHERE d.id = nullif(current_setting('handyhub.erasure', true), '')::uuid
       AND d.erasure_txid = txid_current()
       AND d.record_type = 'request'
  )
$$;
COMMENT ON FUNCTION privacy.request_erasure_permitted() IS
  'True only inside the transaction that wrote the request deletion log entry named in handyhub.erasure (TSK-0137).';

-- Each guard that refuses a DELETE: split into the same guard for its other events and a DELETE guard that stands
-- aside for a permitted request erasure. The list is checked: a missing or changed trigger fails the migration.
DO $$
DECLARE
  wanted text[] := ARRAY[
    'comms.message_links:message_links_append_only',
    'comms.messages:messages_original_unchanged',
    'comms.project_reply_tokens:project_reply_tokens_append_only',
    'crm.access_code_reveals:access_code_reveals_append_only',
    'crm.access_instruction_secrets:access_instruction_secrets_guard',
    'crm.candidate_match_events:candidate_match_events_append_only',
    'crm.candidate_matches:candidate_matches_guard',
    'crm.customer_notes:customer_notes_append_only',
    'crm.project_coverage_acceptances:project_coverage_acceptances_guard',
    'crm.project_site_contacts:project_site_contacts_guard',
    'crm.property_addresses:property_addresses_append_only',
    'crm.property_changes:property_changes_append_only',
    'crm.property_county_verifications:property_county_verifications_append_only',
    'crm.property_details:property_details_no_delete',
    'crm.property_time_zones:property_time_zones_append_only',
    'crm.record_changes:record_changes_append_only',
    'estimating.discount_requests:discount_requests_guard',
    'estimating.discount_verifications:discount_verifications_guard',
    'estimating.publication_approvals:publication_approvals_guard',
    'identity.access_help_requests:access_help_requests_guard',
    'identity.customer_identity_links:customer_identity_links_guard',
    'identity.project_access_grants:project_access_grants_guard',
    'intake.photos:photos_original_unchanged',
    'intake.question_replies:question_replies_append_only',
    'intake.question_reply_photos:question_reply_photos_append_only',
    'intake.questions:questions_guard',
    'intake.request_answers:request_answers_append_only',
    'intake.request_assignments:request_assignments_append_only',
    'intake.request_conversations:request_conversations_append_only',
    'intake.request_decisions:request_decisions_append_only',
    'intake.request_notes:request_notes_append_only',
    'intake.request_qualifications:request_qualifications_append_only',
    'intake.request_services:request_services_append_only',
    'intake.requests:requests_no_delete',
    'intake.response_clocks:response_clocks_guard',
    'intake.response_events:response_events_append_only',
    'ops.queue_items:queue_items_guard',
    'platform.consent_records:consent_records_append_only',
    'platform.message_delivery_attempts:message_delivery_attempts_append_only',
    'work.holds:holds_guard',
    'work.work_package_loadouts:work_package_loadouts_append_only',
    'work.work_package_sop_pins:work_package_sop_pins_append_only',
    'work.work_packages:work_packages_guard'
  ];
  r record;
  events text;
  done integer := 0;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS tbl, t.tgname, t.tgtype, t.tgnargs, t.tgqual IS NOT NULL AS has_when,
           format('%I.%I', n.nspname, p.proname) AS fn
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND (c.oid::regclass::text || ':' || t.tgname) = ANY (wanted)
  LOOP
    -- Row-level BEFORE triggers with a DELETE event, no arguments and no WHEN condition only.
    IF r.tgtype & 1 = 0 OR r.tgtype & 2 = 0 OR r.tgtype & 8 = 0 OR r.tgnargs <> 0 OR r.has_when THEN
      RAISE EXCEPTION 'unexpected trigger %.% (%)', r.tbl, r.tgname, r.tgtype;
    END IF;
    events := concat_ws(' OR ', CASE WHEN r.tgtype & 4 = 4 THEN 'INSERT' END, CASE WHEN r.tgtype & 16 = 16 THEN 'UPDATE' END);
    EXECUTE format('DROP TRIGGER %I ON %s', r.tgname, r.tbl);
    IF events <> '' THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE %s ON %s FOR EACH ROW EXECUTE FUNCTION %s()', r.tgname, events, r.tbl, r.fn);
    END IF;
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %s FOR EACH ROW WHEN (NOT privacy.request_erasure_permitted()) '
      'EXECUTE FUNCTION %s()', r.tgname || '_erasure', r.tbl, r.fn);
    done := done + 1;
  END LOOP;
  IF done <> cardinality(wanted) THEN
    RAISE EXCEPTION 'expected % delete guards, found %', cardinality(wanted), done;
  END IF;
END;
$$;
