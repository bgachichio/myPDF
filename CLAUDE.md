# CLAUDE.md - builder's contract for myPDF

You are the **builder**. Claude Chat was the architect. Every decision is already made in `BUILD-BRIEF.md` and `PRODUCT-SPEC.md`. You execute; you do not choose.

## Load order
1. This file.
2. `BUILD-BRIEF.md` (how it is built).
3. `PRODUCT-SPEC.md` (what and why; cite requirement ids such as R07, never restate them).
4. `DEPLOY.md` (fill sections 4, 7, 8 and 9 from what you observe; do not touch the others).

## Identity
- App slug: `mypdf` (repository `bgachichio/mypdf`, Vercel project `mypdf`, domain `mypdf.gachichio.org`, DNS at Porkbun).
- Licence: AGPL-3.0-or-later. Every new source file starts with `// SPDX-License-Identifier: AGPL-3.0-or-later`.
- Shape: static PWA, no server, no VM footprint. The companion (M5) gets its own packet later.

## The four defaults (builder section 6), all required
1. Font-size toggle, four steps (`compact`, `default`, `large`, `xlarge` per designer §12.2), persisted to `ui.fontScale`.
2. Auto / Light / Dark theme, defaulting to the device, persisted to `ui.theme` as `system`, `light` or `dark` (designer §12.1).
3. Settings panel in `localStorage`, one tap from every screen.
4. Installable PWA, offline-capable, mobile first.

Use the house `useAppearance` hook and the no-flash head script from the designer skill (copy `assets/appearance-hooks.jsx` and `assets/globals.css` from the aiOS vault skill folder verbatim). Do not write a second version.

## The five commands (and no sixth)
| Command | Does | Budget |
|---|---|---|
| `npm run dev` | Local app, hot reload | - |
| `npm run build` | Production bundle in `dist/` | < 60 s |
| `npm test` | Vitest unit and engine tests | < 2 min |
| `./deploy.sh` | Vercel preview, verify, promote | < 90 s |
| `./rollback.sh` | Promote the previous production deployment | < 60 s |

Playwright end-to-end tests run in CI and locally with `npx playwright test`; they are not a sixth npm script.

## Hard rules
- **Support and sign-off are house standard (builder §6.1; F15, R15). No copy may suggest a gift size.** Values live only in `src/config/support.ts`. Never hard-code a payment link or address anywhere else. A production build must fail if `LIGHTNING_ADDRESS` or `BTC_ADDRESS` is empty, and a unit test must verify the on-chain address checksum.
- **Nothing leaves the device.** No CDN, no analytics, no fonts or models from third-party hosts. Tesseract worker, core and `eng.traineddata` are self-hosted under `public/`. The R13 egress test must stay green.
- **No real documents in git.** `tests/corpus/` holds only public or synthetic files listed in `tests/corpus/MANIFEST.md` with source and licence. Anything else is a stop-the-line event.
- **No secrets anywhere.** There are none in this project; if you think you need one, hand back.
- **All PDF work runs in the engine worker**, through the `PdfEngine` interface in `BUILD-BRIEF.md`. The UI thread never imports `mupdf`.
- **Redaction is never faked.** A drawn box is an annotation, never labelled "redaction". Only `applyRedactions` plus the R07 verification counts.
- UK English in all copy. No em dashes in any interface text.
- Push to GitHub in small commits through the session, never one batch at the end.

## Token routing
- Reads over 350 lines are blocked by `.claude/hooks/guard-read.py` unless you pass an offset and limit.
- Route bulk reads and predictable boilerplate through `scripts/bulk-read` and `scripts/code-write`, copied from the aiOS standard project template before the first session. If they are absent, apply the same 350-line rule by hand and say so in the commit message.
- Never read `LICENSE`, `node_modules/`, `dist/` or `public/tesseract/` into context.

## Handback rule (builder section 0.1)
Stop and return to Claude Chat on: a dependency not in `BUILD-BRIEF.md`; a change to the `PdfEngine` interface or a storage schema; any network origin not in the CSP; a deviation from `src/styles/tokens.css`; any requirement you cannot make pass as written.
