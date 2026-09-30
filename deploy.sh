#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

echo "Building..."
npm run build

echo "Deploying preview to Vercel..."
PREVIEW_URL=$(npx vercel --yes 2>&1 | tail -1)
echo "Preview: $PREVIEW_URL"

echo "Verifying preview (basic health check)..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL" || true)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "Preview health check failed: HTTP $HTTP_STATUS"
  exit 1
fi

echo "Promoting to production..."
npx vercel promote "$PREVIEW_URL" --yes

echo "Done. Production: https://mypdf.gachichio.org"
