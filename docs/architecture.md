# Architecture: two origins, one server

Source of truth: the knowledge graph (ARCH-STACK, OWN-DEC-133, HH-ARC-06, HH-ARC-07, FACT-DOMAIN). This page records how the server implements them (TSK-0017).

## Hosts

One Fastify server answers two hosts. Their names come from the environment, never from the code:

| Variable | Example | Serves |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | `https://handyhub247.com` | The Astro site, `/portal/*` (customer portal), `/api/v1/public/*`, `/api/v1/customer/*`, `/webhooks/*` |
| `STAFF_ORIGIN` | `https://staff.handyhub247.com` | The staff app at the root (`/sign-in`, `/invite/:token`, `/reset/:token`), `/api/v1/staff/*` |

- The two variables are set together or not at all. With both unset (local, ci and the single Render URL until the domains are set up) one host serves every surface, with the staff app under `/staff` and the portal under `/portal`.
- Every API surface answers `404 NOT_FOUND` on the other host, before any session is read. A host that is neither answers 404 to everything except `/healthz`, `/readyz` and `/robots.txt`.
- Every API route path starts with its surface (`/public/`, `/customer/` or `/staff/`); route registration refuses any other path (`routeProblems`).
- Code: `apps/server/src/hosts.ts`, `apps/server/src/app.ts`, `apps/server/src/api/register.ts`.

## Sessions and cookies

- Cookies are host-only: no `Domain` attribute, `__Host-` prefix with `Secure` in staging and production. A browser never sends the staff cookie to the public host, or the customer cookie to the staff host.
- Each surface reads only its own session, on a single host too. The staff API reads only the staff session (`hh_staff` / `__Host-hh_staff`, SameSite=Strict). The public and customer APIs read only the customer session (`__Host-hh_customer`, SameSite=Lax). So a staff sign-in is never inherited by the portal, and a customer session never reaches a staff route.
- The staging access gate stays in front of both hosts, separate from both sessions (OWN-DEC-73).

## No cross-origin API, no CORS

Each frontend calls the API on its own origin (a same-origin gateway). No cross-origin API exists, so the rules for a dedicated cross-origin API (HH-ARC-07) do not apply:

- No CORS plugin is installed and no `Access-Control-*` header is ever sent. A preflight request gets a 404 with no allowance.
- Cross-site writes are refused by the CSRF guard (`Origin` / `Sec-Fetch-Site`) and the session's `X-CSRF-Token` (HH-SEC-02).
- If a cross-origin API is ever proposed, it needs an architecture decision first, and HH-ARC-07 then applies in full.

## Security headers

On every response:

- `Content-Security-Policy`: same origin only. Inline scripts and styles of the built pages are allowed by their SHA-256 hashes, computed at start from the built HTML; `frame-ancestors 'none'`, `object-src 'none'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`.
- `Strict-Transport-Security: max-age=31536000` in staging and production. PROPOSED: no `includeSubDomains` and no `preload` until the owner controls the DNS (OQ-DOMAIN-OWNERSHIP).
- `Referrer-Policy: no-referrer` on private routes: the whole staff host, `/portal`, `/api`, `/access`, `/project`, `/account` and the request form `/request` (it holds the visitor's draft; TSK-0023). The public pages use `strict-origin-when-cross-origin`.
- `X-Robots-Tag: noindex, nofollow` on the staff host and the private routes in every environment, and on everything outside production. The staff host's `robots.txt` disallows everything, and so does every host outside production.
- Search hygiene (TSK-0023): in production the public host's `robots.txt` keeps crawlers off `/api/` and names `/sitemap.xml`. The sitemap lists only pages that exist, are public and are indexable: the built pages without a robots `noindex` meta and outside the private routes, the service pages the site may show in that environment, and county pages with approved local content (none yet; every `/areas/<county>` URL answers 301 to its anchor on `/areas`). A missing public page answers 404 with the site's not-found page, a failing one 500 (503 while the database is down) with its error page.

## Owner setup (not done by the code)

1. DNS at GoDaddy: point `staff.handyhub247.com` and the apex `handyhub247.com` at the Render service, using the records Render shows when the custom domains are added.
2. Render: add both custom domains to the web service.
3. Render: set `PUBLIC_ORIGIN` and `STAFF_ORIGIN`. `STAFF_APP_URL` is then optional, because staff email links default to `STAFF_ORIGIN`.
4. Production use waits for OQ-GO-DECISION and OQ-DOMAIN-OWNERSHIP.
