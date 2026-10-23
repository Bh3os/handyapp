#!/usr/bin/env bash
# Optional (docs/local-mac.md): copies the Render staging database into this computer's database, replacing what is
# there. Pass the database's External Database URL from the Render dashboard (it is a secret: it is not saved).
#   scripts/local/import-render.sh "postgres://...render.com/..."
# Staff sign-ins keep working only with Render's MFA_ENCRYPTION_KEY and ACCESS_CODE_ENCRYPTION_KEY in .env.
# Photos and documents stay in Render's storage settings and are not copied.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "No .env: run scripts/local/setup.sh first." >&2; exit 1; }
[ $# -eq 1 ] || { echo "usage: scripts/local/import-render.sh <External Database URL>" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1 (brew install postgresql@16)." >&2; exit 1; }; }
need pg_dump
need pg_restore
set -a
# shellcheck disable=SC1091
. ./.env
set +a
printf 'This replaces everything in %s with the Render database. Type yes to continue: ' "$DATABASE_URL"
read -r answer
[ "$answer" = "yes" ] || { echo "Nothing changed."; exit 1; }
dump="$(mktemp "${TMPDIR:-/tmp}/handyhub-render.XXXXXX")"
trap 'rm -f "$dump"' EXIT
pg_dump --format=custom --no-owner --no-privileges --file="$dump" "$1"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$dump"
echo "Imported. Start it with scripts/local/start.sh"
