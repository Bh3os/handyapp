---
id: RULE-SYNTHETIC-DATA
type: rule
title: Secrets, test data and staging
status: active
area: platform
source: "vault CLAUDE.md rule 10; owner directions"
---
- Never commit secrets, personal data or `.env` files. The owner sets every secret in Render; secrets are never pasted in chat or files.
- Test data is synthetic. Secret-looking test values are built at runtime (for example `['a','b'].join('-')`) so the secret scanner does not flag them.
- Staging uses approved test destinations only: no real charges and no real messages.
- Staging stays behind the access gate and hidden from search engines. Production changes only on the owner's go decision.
