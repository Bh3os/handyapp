#!/usr/bin/env bash
# Starts HandyApp on this computer (docs/local-mac.md): applies new migrations, loads the services, SOPs and loadouts
# (repeat-safe), then serves the public site (http://localhost:3000), the customer portal (/portal) and the staff app
# (/staff) until you press Ctrl-C. Emails appear in this terminal.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "No .env: run scripts/local/setup.sh first." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
node packages/db/dist/cli/migrate.js
node packages/db/dist/cli/services.js
node packages/db/dist/cli/sops.js
node packages/db/dist/cli/loadouts.js
echo "HandyApp on http://localhost:${PORT:-3000}  (portal: /portal, staff app: /staff)"
exec node apps/server/dist/main.js
