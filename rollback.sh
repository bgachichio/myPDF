#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

echo "Listing recent deployments..."
PREV_URL=$(npx vercel ls --yes 2>&1 | grep "https://" | sed -n '2p' | awk '{print $1}')
if [ -z "$PREV_URL" ]; then
  echo "Could not determine previous deployment URL."
  exit 1
fi

echo "Rolling back to: $PREV_URL"
npx vercel promote "$PREV_URL" --yes
echo "Rollback complete."
