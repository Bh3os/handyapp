---
id: HH-LEAD-08
type: requirement
title: Not a Fit decision with a reason category and owner routing when work or money exists
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-100]]", "[[OWN-DEC-70]]", "[[OWN-DEC-51]]"]
  depends_on: ["[[HH-LEAD-02]]", "[[HH-COM-06]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Project]]", "[[FACT-RETENTION-SCHEDULE]]"]
  part_of: ["[[C04]]", "[[S02]]"]
source: "OWN-DEC-100"
---
- Staff, not the ZIP checker, decide whether an outside-area request can be accepted.
- Staff assess the actual work before declining. A whole service category is never rejected automatically; some repairs may fit the approved scope while more complex work does not.
- **Not a Fit** requires a reason category: coverage, work outside our scope, specialist assessment needed, or another documented reason (free text required). Internal risk notes stay staff-only.
- The customer sees: "Thank you for considering HandyHub. We're unable to take on this project because [plain-language reason]." No named companies are recommended.
- Staff publish the decision; a brief automatic notice points the customer to the project ([[HH-COM-06]]).
- Closing keeps the summary, the decision and the shared history visible through authorized customer access. Retention follows the schedule; nothing is deleted automatically.
- If work was already accepted, an appointment exists, or money was received, the request is routed to the owner for cancellation and financial review (owner-only) instead of being closed.
