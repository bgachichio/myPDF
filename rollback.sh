#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Roll production back (DEPLOY.md section 8). Usage: ./rollback.sh [deployment-url]
# With no argument Vercel picks the previous production deployment. The script fails loudly if production did not move,
# because staged deployments can make "previous" ambiguous; list candidates with `npx vercel ls` and pass one explicitly.
set -euo pipefail
cd "$(dirname "$0")"
current() { npx vercel inspect mypdf-gachichio.vercel.app 2>&1 | awk '/^[[:space:]]+url/ {print $2; exit}'; }
before=$(current)
npx vercel rollback ${1:+"$1"} --yes
after=$(current)
[ "$before" != "$after" ] || { echo "FAIL: production did not change ($after). Pass a deployment URL from: npx vercel ls"; exit 1; }
echo "Rolled back: $before -> $after"
