#!/usr/bin/env bash
# One-time setup of HandyApp on this computer (docs/local-mac.md): checks the tools, writes .env with fresh keys,
# creates the local database, installs, builds, migrates and loads the services, SOPs and loadouts.
# Safe to run again: an existing .env and an existing database are kept.
#   scripts/local/setup.sh you@example.com
# Your email is the one address emails are written out for (the server's terminal); add others in .env later.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. $2" >&2; exit 1; }; }
need node "Install Node 24: brew install node@24 (see docs/local-mac.md)."
need psql "Install PostgreSQL 16: brew install postgresql@16 (see docs/local-mac.md)."
need createdb "Install PostgreSQL 16: brew install postgresql@16 (see docs/local-mac.md)."
need openssl "openssl is part of macOS."
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" != "24" ]; then
  echo "Node $major found; HandyApp needs Node 24 (brew install node@24, then follow the PATH hint brew prints)." >&2
  exit 1
fi
command -v pnpm >/dev/null 2>&1 || corepack enable
need pnpm "Run: corepack enable"

DB_NAME="${DB_NAME:-handyhub_local}"
if [ ! -f .env ]; then
  [ $# -ge 1 ] || { echo "usage: scripts/local/setup.sh <your email>" >&2; exit 1; }
  OWNER_EMAIL="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  key() { openssl rand -hex 32; }
  cat > .env <<ENV
# HandyApp on this computer (docs/local-mac.md). Never commit this file: it holds keys.
HANDYHUB_ENV=local
HOST=127.0.0.1
PORT=3000
STAFF_APP_URL=http://localhost:3000/staff
DATABASE_URL=postgres://$(whoami)@localhost:5432/${DB_NAME}
# Keys: keep them. Changing MFA_ENCRYPTION_KEY locks every staff authenticator out.
MFA_ENCRYPTION_KEY=$(key)
ACCESS_CODE_ENCRYPTION_KEY=$(key)
CODE_HASH_KEY=$(key)
# Emails are written to the server's terminal output, never sent. Only these addresses get one (comma separated):
# add the test customers' addresses to read their links and codes there.
EMAIL_PROVIDER=log
TEST_EMAIL_DESTINATIONS=${OWNER_EMAIL}
# Photos and documents are kept in this folder.
STORAGE_PROVIDER=disk
LOCAL_STORAGE_DIR=${ROOT}/.local-data/files
# Reset Test Data in the Owner Dashboard (this computer's database only).
STAGING_TOOLS=on
# warn: the terminal shows the emails (STAGING_EMAIL_LOGGED lines with their links and codes) and problems only.
LOG_LEVEL=warn
ENV
  echo "Wrote .env with new keys."
else
  echo "Keeping the existing .env."
fi
mkdir -p .local-data/files

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if psql "$DATABASE_URL" -Atc 'select 1' >/dev/null 2>&1; then
  echo "Database reachable: keeping it."
else
  echo "Creating database ${DB_NAME}..."
  createdb "$DB_NAME"
fi

pnpm install --frozen-lockfile
pnpm build
node packages/db/dist/cli/migrate.js
node packages/db/dist/cli/services.js
node packages/db/dist/cli/sops.js
node packages/db/dist/cli/loadouts.js
echo
echo "Setup done. Next:"
echo "  scripts/local/owner-link.sh you@example.com \"Your Name\"   (the first time: your Owner account)"
echo "  scripts/local/start.sh                                    (then open http://localhost:3000)"
