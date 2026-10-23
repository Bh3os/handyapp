#!/usr/bin/env bash
# Brings this computer's copy up to date with main (docs/local-mac.md): pulls, installs and builds. Then run start.sh,
# which applies any new migration. Stop a running server first (Ctrl-C).
set -euo pipefail
cd "$(dirname "$0")/../.."
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
echo "Updated. Start it with scripts/local/start.sh"
