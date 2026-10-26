-- 0110 Question amendments (TSK-0148; OWN-DEC-197 E2, E4, E5, OWN-DEC-208 reading 3, HH-LEAD-03, HH-LEAD-06,
-- ENT-Question, ENT-Request, FACT-REOPEN-PERIOD, RULE-SERVER-AUTHZ).
-- 1. intake.questions.not_sure_allowed (E2): staff mark, when publishing, whether the customer may answer "I'm not
--    sure" / "I don't know"; any question may allow it, not only a measurement. A measurement always allows it
--    (PROPOSED, OQ-QUESTION-AMENDMENT-DETAILS): the questions published before this migration keep exactly what the
--    customer was offered (measurements yes, other questions no). Like the text, kind and author, it never changes
--    once published (questions_guard).
-- 2. intake.request_decisions admits the staff decision 'reopen' (E5): an authorized staff member reopens a
--    "Closed—no response" request with a written reason, also after the reopen period; the decision keeps who, when
--    and why in the project history. Nothing here holds a business value.

-- 1. "I'm not sure" offered per question. The guard of 0051 lets a new version through while the columns it protects
--    stay the same, so the backfill is a new version of each measurement question.
ALTER TABLE intake.questions ADD COLUMN not_sure_allowed boolean NOT NULL DEFAULT false;
UPDATE intake.questions SET not_sure_allowed = true, version = version + 1 WHERE kind = 'measurement';
ALTER TABLE intake.questions
  ADD CONSTRAINT questions_measurement_not_sure CHECK (kind <> 'measurement' OR not_sure_allowed);
COMMENT ON COLUMN intake.questions.not_sure_allowed IS
  'TSK-0148 (OWN-DEC-197 E2): the customer may answer "I''m not sure"; set when publishing, never changed.';

CREATE OR REPLACE FUNCTION intake.question_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QUESTION_KEPT: questions are kept, never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.request_id, NEW.project_id, NEW.kind, NEW.body, NEW.author_staff_id, NEW.published_at,
      NEW.not_sure_allowed)
     IS DISTINCT FROM (OLD.id, OLD.request_id, OLD.project_id, OLD.kind, OLD.body, OLD.author_staff_id,
                       OLD.published_at, OLD.not_sure_allowed) THEN
    RAISE EXCEPTION 'QUESTION_IMMUTABLE: a published question never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'answered' AND NEW.state <> 'answered' THEN
    RAISE EXCEPTION 'QUESTION_ANSWERED: an answered question stays answered' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (OLD.answered_at IS NOT NULL AND NEW.answered_at IS DISTINCT FROM OLD.answered_at)
     OR (OLD.notice_sent_at IS NOT NULL AND NEW.notice_sent_at IS DISTINCT FROM OLD.notice_sent_at)
     OR (OLD.first_reminder_sent_at IS NOT NULL AND NEW.first_reminder_sent_at IS DISTINCT FROM OLD.first_reminder_sent_at)
     OR (OLD.final_reminder_sent_at IS NOT NULL AND NEW.final_reminder_sent_at IS DISTINCT FROM OLD.final_reminder_sent_at)
  THEN
    RAISE EXCEPTION 'QUESTION_HISTORY: a recorded time never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'QUESTION_VERSION: every change is a new version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

-- 2. The staff reopening of a "Closed—no response" request.
ALTER TABLE intake.request_decisions DROP CONSTRAINT request_decisions_action_check;
ALTER TABLE intake.request_decisions ADD CONSTRAINT request_decisions_action_check CHECK (action IN (
  'ask_question', 'prepare_online_estimate', 'arrange_estimate_visit', 'not_a_fit', 'not_a_fit_owner_review',
  'close_no_response', 'reopen'));
ALTER TABLE intake.request_decisions
  ADD CONSTRAINT request_decisions_reopen_reason CHECK (action <> 'reopen' OR internal_note IS NOT NULL);
