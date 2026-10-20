---
id: OWN-DEC-90
type: decision
title: Choosing services: four category cards, up to 5 services, or "Not sure"
status: active
area: intake
links:
  related: ["[[OWN-DEC-87]]", "[[OWN-DEC-91]]", "[[HH-CUS-01]]", "[[HH-SVC-03]]", "[[HH-INT-01]]", "[[HH-INT-08]]"]
source: "owner-answers-verbatim 2026-10-12T18:31:16.913Z [2.1 Services]; decision-briefs 2026-10-12T18:31:38"
---
Owner, 2026-10-12, journey Step 2.1, choosing services.

Question asked:
> Step 2.1 - Choosing services: after 'Continue as Guest' (or sign-in), the form opens with the service from the page already selected. The customer can add up to 5 services, or pick 'Not sure' and describe the job instead (staff then choose the service). OK?

Owner wording:
> Yes. After Continue as Guest, account creation, or sign-in, open the request form with the service from the page already selected.
>
> Simplify the selector while preserving the premium design:
>
> **Choose a category**
> Show four clear cards:
> - **Home Improvement:** Repairs and installations
> - **Drywall:** Wall repairs and drywall projects
> - **Painting:** Painting and surface finishes
> - **Cleaning:** Home and property cleaning
>
> **Select services**
> Show only the opened category’s services, using consistent checkbox rows with clear selected states instead of differently sized buttons.
>
> Allow up to 5 services without duplicates. Show “Selected services — 0 of 5” and a visible selection summary with Remove actions. Switching categories must preserve previous selections. When arriving from a service page, automatically open its category and preselect the service.
>
> Keep **“Not sure what service I need”** clearly visible as an alternative. Let customers describe the project so staff can classify it during review.
>
> Ask only questions relevant to the selected services, and avoid repeating shared questions. Preserve selections and entered details when navigating back, creating an account, or signing in.
>
> Explain that multiple services form one project request, with scope, pricing, and scheduling confirmed after review. If more than 5 services are needed, allow additional work to be described without blocking submission.
>
> On phones, stack the category cards and use full-width checkbox rows.
>
> Implement, test, and publish this complete flow on private staging so I can review it directly.

Effect:
- After Continue as Guest, account creation or sign-in ([[OWN-DEC-87]]) the form opens with the service from the originating page preselected and its category open.
- Step "Choose a category" shows four cards with the exact labels above; "Select services" lists only the open category's services as uniform checkbox rows.
- At most 5 distinct services; the counter reads "Selected services — 0 of 5" and a summary lists the selections with Remove. Switching categories keeps earlier selections. More work beyond 5 is described in free text and never blocks submission.
- "Not sure what service I need" stays visible; the customer describes the project and staff classify it during review.
- Only questions for the selected services are asked, shared questions once ([[OWN-DEC-91]]). The page explains that several services form one project request, with scope, pricing and scheduling confirmed after review.
- Selections and entered details survive Back, account creation and sign-in. On phones the cards stack and rows are full width.
