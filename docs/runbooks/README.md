# Runbooks

Operations procedures for HandyApp on Render (one web service, Render PostgreSQL), Resend, Bird and Cloudflare R2. Built by TSK-0106 (HH-NFR-03, T71, T72) and TSK-0111. Production releases and every launch phase stay with the owner (OWN-DEC-22, OWN-DEC-191).

| Runbook | Use it when |
| --- | --- |
| [release.md](release.md) | Deploying, migrating, verifying and rolling back a release; the release record; the staging database expiry |
| [outages.md](outages.md) | A provider or dependency is down: what the system shows, what staff do, and the test that proves it |
| [restore.md](restore.md) | Data must be restored from a backup: isolated restore, integrity checks, deletion and suppression replay, controlled resume |
| [go-checklist.md](go-checklist.md) | The owner's checklist for the three launch phases, and the readiness report |
| [rehearsals.md](rehearsals.md) | What was actually rehearsed, where, and the exact results |

Related: [docs/owner-acceptance-testing.md](../owner-acceptance-testing.md) (TSK-0142, phase 1 checklist and launch-phase switches), [docs/review-packets/](../review-packets/README.md) (attorney, CPA, insurance, safety), [docs/data-inventory.md](../data-inventory.md) (retention and backups).

Rules: nothing in these files is a legal, tax, insurance or safety conclusion (RULE-HUMAN-REVIEW); no Render plan detail is stated that the graph does not record (unknowns are OWNER ITEMs); no secret value appears anywhere (RULE-SYNTHETIC-DATA).
