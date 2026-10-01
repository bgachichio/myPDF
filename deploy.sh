#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Preview, verify, promote (BUILD-BRIEF section 7, DEPLOY.md section 6). Run after `vercel login`.
set -euo pipefail
cd "$(dirname "$0")"

echo "Building..."
npx vercel build --prod --yes >/dev/null

echo "Deploying staged production build (not yet on the domain)..."
PREVIEW_URL=$(npx vercel deploy --prebuilt --prod --skip-domain 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["deployment"]["url"])')
echo "Preview: $PREVIEW_URL"

echo "Verifying preview..."
check() { # $1 = path, $2 = expected status
  code=$(npx vercel curl "$1" --deployment "$PREVIEW_URL" -- -s -o /dev/null -w '%{http_code}')
  [ "$code" = "$2" ] || { echo "FAIL $1 returned $code, expected $2"; exit 1; }
  echo "ok   $1 $code"
}
check / 200
check /manifest.webmanifest 200
WASM=$(ls dist/assets/mupdf-wasm-*.wasm | head -1 | xargs basename)
check "/assets/$WASM" 200
npx vercel curl / --deployment "$PREVIEW_URL" -- -sI | grep -qi '^content-security-policy:' || { echo "FAIL no CSP header"; exit 1; }
echo "ok   CSP header present"

echo "Promoting..."
npx vercel promote "$PREVIEW_URL" --yes
echo "Done. Production: https://mypdf.gachichio.org"
