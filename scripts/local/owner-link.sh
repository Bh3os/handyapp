#!/usr/bin/env bash
# Prints a single-use link to set a staff password (docs/local-mac.md). The first time it creates the Owner account:
#   scripts/local/owner-link.sh you@example.com "Your Name"
# Later, for any existing staff account (an invite or a password reset):
#   scripts/local/owner-link.sh someone@example.com
# Open the link while the server runs; the staff app then sets up the mandatory authenticator.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "No .env: run scripts/local/setup.sh first." >&2; exit 1; }
[ $# -ge 1 ] || { echo "usage: scripts/local/owner-link.sh <email> [display name]" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
email="$1"
shift
owners="$(psql "$DATABASE_URL" -Atc "select count(*) from identity.role_grants where kind = 'role' and name = 'owner' and ended_at is null")"
if [ "$owners" = "0" ]; then
  node apps/server/dist/cli/staff-access.js create-owner "$email" "$@"
else
  node apps/server/dist/cli/staff-access.js password-link "$email"
fi
