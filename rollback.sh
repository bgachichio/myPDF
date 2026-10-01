#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Promote the previous production deployment (DEPLOY.md section 8).
set -euo pipefail
cd "$(dirname "$0")"
npx vercel rollback --yes
echo "Rollback complete. Verify: curl -sI https://mypdf.gachichio.org"
