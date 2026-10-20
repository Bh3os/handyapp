---
id: HH-INT-15
type: requirement
title: Service selection step with category cards, up to five services and Not sure
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-90]]"]
  depends_on: ["[[HH-SVC-01]]", "[[HH-INT-01]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Request]]", "[[ENT-ServiceDefinition]]"]
  tested_by: ["[[T05]]", "[[T69]]"]
  part_of: ["[[C02]]"]
source: "OWN-DEC-90"
---
**Choose a category** shows four clear cards:
- **Home Improvement:** Repairs and installations
- **Drywall:** Wall repairs and drywall projects
- **Painting:** Painting and surface finishes
- **Cleaning:** Home and property cleaning

**Select services** shows only the opened category's services, as consistent checkbox rows with clear selected states (no differently sized buttons).

Rules:
- Up to 5 services, without duplicates. The step shows "Selected services — 0 of 5" (the current count) and a visible selection summary with **Remove** actions.
- Switching categories keeps earlier selections.
- Arriving from a service page opens that service's category and preselects the service.
- **"Not sure what service I need"** stays clearly visible as an alternative; the customer describes the project and staff classify it during review.
- The step explains that multiple services form one project request, with scope, pricing and scheduling confirmed after review.
- If more than 5 services are needed, the customer can describe the additional work in a free-text field without blocking submission. That text is stored with the request.
- Selections and entered details survive going back, creating an account and signing in.
- On phones the category cards stack and the checkbox rows are full width. The premium design is kept.
