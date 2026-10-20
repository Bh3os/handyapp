---
id: OWN-DEC-91
type: decision
title: About the job: service questions, description and up to 10 photos
status: active
area: intake
links:
  related: ["[[OWN-DEC-62]]", "[[OWN-DEC-90]]", "[[HH-SVC-03]]", "[[HH-INT-04]]", "[[HH-INT-05]]", "[[HH-INT-06]]", "[[HH-INT-07]]", "[[HH-SEC-05]]"]
  uses: ["[[INT-R2]]", "[[FACT-UPLOAD-LIMITS]]"]
source: "owner-answers-verbatim 2026-10-12T18:31:16.913Z [2.2 Job]; decision-briefs 2026-10-12T18:31:38"
---
Owner, 2026-10-12, journey Step 2.2, about the job.

Question asked:
> Step 2.2 - About the job: for each chosen service, short service-specific questions (e.g. rooms, square feet, ceiling height) with units and an 'I don't know' option that never counts as zero; a free-text description; up to 10 photos (JPEG/PNG/WebP, 15 MB each, no PDFs) with a warning not to upload cards, IDs or passwords. Each photo shows its own upload status; text is kept if a photo fails. OK?

Owner wording:
> Yes, with these improvements:
>
> - Ask short, service-specific questions for each selected service. Group them clearly and ask shared questions only once.
> - Show units beside measurements and allow approximate values. “I don’t know” means unknown—not zero—and must not block submission.
> - Include one project description, with optional notes for individual services.
> - Allow up to 10 photos total per request: JPEG, PNG, or WebP, up to 15 MB each; no PDFs. Photos remain optional.
> - Show previews with Remove/Retry controls and individual uploading, processing, complete, or failed states.
> - Preserve all text, answers, and successful photos if an upload fails or the customer navigates back. Allow submission with failed photos excluded and a clear notice.
> - Show: “Please don’t upload payment cards, IDs, passwords, or unrelated personal information.”
> - Validate file types and limits on the server. Test phone-camera uploads and clearly explain unsupported formats.
>
> Implement, test, and publish this on private staging.

Effect:
- Short service-specific questions are grouped per selected service; shared questions are asked once. Measurements show units and accept approximate values.
- "I don't know" is stored as unknown, never as zero, and never blocks submission.
- One project description, plus optional notes per service.
- Photos are optional: at most 10 per request in total, JPEG, PNG or WebP, at most 15 MB each, no PDFs ([[FACT-UPLOAD-LIMITS]]: implemented as 15 MiB per [[OWN-DEC-62]]). File type and size are validated on the server; unsupported formats get a clear explanation; phone-camera uploads are tested.
- Each photo shows a preview with Remove/Retry and its own state: uploading, processing, complete or failed. Text, answers and successful photos are kept when an upload fails or the customer goes back; the request can be sent with failed photos excluded and a clear notice.
- The form shows: "Please don't upload payment cards, IDs, passwords, or unrelated personal information."
- Photos are stored privately ([[INT-R2]]).

Links: uses [[INT-R2]], [[FACT-UPLOAD-LIMITS]].
