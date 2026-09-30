# DEPLOY.md - myPDF

Architect drafted sections 1, 2, 3, 5, 6 and 10 on 30-09-2026. The builder fills 4, 7, 8 and 9 from what actually ran. Path A: static PWA to Vercel (builder section 8.2).

## 1. What this is
myPDF, a browser-only PDF editor served as static files at https://mypdf.gachichio.org. If it stops, users lose the web app. Installed copies keep working offline, and no user data is at risk, because none is held server-side.

## 2. Prerequisites
- Lenovo (Zorin OS 18), Node.js 22 LTS and npm 10: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`
- qpdf 11 or later (used by the corpus check): `sudo apt-get install -y qpdf`
- Python 3 and pre-commit: `sudo apt-get install -y pipx && pipx install pre-commit`
- The Vercel CLI, pinned at install: `npm i -g vercel@latest`, then record the exact version in section 4
- Accounts: GitHub `bgachichio`, and Vercel (Hobby) with project `mypdf` and domain `mypdf.gachichio.org` attached; Porkbun access for the `gachichio.org` DNS zone
- Playwright browsers: `npx playwright install --with-deps chromium`

## 2a. Domain (one-off)
1. `vercel domains add mypdf.gachichio.org mypdf`
2. In Porkbun, add a record on `gachichio.org`: type CNAME, host `mypdf`, answer `cname.vercel-dns.com`, TTL 600.
3. `dig +short mypdf.gachichio.org` returns the Vercel target. `vercel domains inspect mypdf.gachichio.org` shows the domain as valid, with a certificate issued.
4. Hostnames are case-insensitive, so myPDF.gachichio.org and mypdf.gachichio.org are the same site. Links and config always use lowercase.

## 3. Secrets
None. The Paystack link and Bitcoin address in `src/config/support.ts` are public receiving identifiers, not secrets. Deploys run by hand from the Lenovo after an interactive `vercel login`. The login token lives in the Vercel CLI's own config, never in this repository, and CI holds no deploy token. `.env.example` is intentionally empty.

## 4. First run
BUILDER FILLS: clean checkout to a running local app, with every command and its expected output, including `pre-commit install`.

## 5. Build
`npm ci && npm run build` produces `dist/`. The expected size is about 16 MB raw, most of it `mupdf-wasm.wasm` (10.4 MB, 3.6 MB with Brotli) plus the Tesseract core and English data (estimated at about 5 MB; the builder records the measured figure in section 4). The build must take under 60 s.

## 6. Deploy
1. `git pull && npm ci && npm test && npm run build`
2. `npx playwright test` (all green, including R13)
3. `node scripts/corpus-check.mjs` (25 of 25)
4. `./deploy.sh`, which runs:
   - `vercel deploy --prebuilt` to a preview;
   - a health check of the preview (the manifest and the wasm return 200, and the CSP header is present);
   - `vercel promote <preview-url>`.
5. On the Pixel, open https://mypdf.gachichio.org, confirm the update prompt, and run scenario 1 from PRODUCT-SPEC Section 5.

## 7. Verify
BUILDER FILLS: the exact URL, command and response that mean success (for example the `curl -sI` output showing the CSP), plus the Pixel R01 check with its date.

## 8. Rollback
BUILDER FILLS: `./rollback.sh` (runs `vercel rollback` to the previous production deployment), the observed output, and the date of the last test.

## 9. Troubleshooting
BUILDER FILLS: the five failures that actually happened, each with its fix. Expected candidates: a stale service worker, wasm served with the wrong MIME type, OPFS unavailable in private windows, CSP blocking a worker, and a Tesseract path 404.

## 10. Uninstall
1. `vercel domains rm mypdf.gachichio.org`, then delete the `mypdf` CNAME in Porkbun.
2. `vercel remove mypdf --yes`.
3. Archive the GitHub repository (Settings, Archive).
4. There is no VM, secret file, port or registry row to release. Installed PWAs keep their local data until the user uninstalls the app.
