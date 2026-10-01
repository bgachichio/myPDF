# DEPLOY.md - myPDF

Architect drafted sections 1, 2, 3, 5, 6 and 10 on 30-09-2026. The builder fills 4, 7, 8 and 9 from what actually ran. Path A: static PWA to Vercel (builder section 8.2).

## 1. What this is
myPDF, a browser-only PDF editor served as static files at https://mypdf.gachichio.org. If it stops, users lose the web app. Installed copies keep working offline, and no user data is at risk, because none is held server-side.

## 2. Prerequisites
- Lenovo (Zorin OS 18), Node.js 22 LTS and npm 10: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`
- qpdf 11 or later (used by the corpus check): `sudo apt-get install -y qpdf`
- Python 3 and pre-commit: `sudo apt-get install -y pipx && pipx install pre-commit`
- The Vercel CLI, pinned at install: `npm i -g vercel@latest`, then record the exact version in section 4
- Accounts: GitHub `bgachichio`, and Vercel (Hobby) with project `mypdf` and domain `mypdf.gachichio.org` attached; DNS access for the `gachichio.org` zone (Cloudflare, see section 2a)
- Playwright browsers: `npx playwright install --with-deps chromium`

## 2a. Domain (one-off)
1. `vercel domains add mypdf.gachichio.org mypdf`
2. At the authoritative DNS host for `gachichio.org`, add: type CNAME, name `mypdf`, target `cname.vercel-dns.com`, TTL 600, proxy off (DNS only). Observed 01-10-2026: `dig NS gachichio.org` answers `lochlan.ns.cloudflare.com` and `luciana.ns.cloudflare.com`, so the record goes in Cloudflare, although `vercel domains inspect` still lists Porkbun nameservers. Vercel's own suggested alternative is `A mypdf 76.76.21.21`.
3. `dig +short mypdf.gachichio.org` returns the Vercel target. `vercel domains inspect mypdf.gachichio.org` shows the domain as valid, with a certificate issued.
4. Hostnames are case-insensitive, so myPDF.gachichio.org and mypdf.gachichio.org are the same site. Links and config always use lowercase.

## 3. Secrets
None. The Paystack link and Bitcoin address in `src/config/support.ts` are public receiving identifiers, not secrets. Deploys run by hand from the Lenovo after an interactive `vercel login`. The login token lives in the Vercel CLI's own config, never in this repository, and CI holds no deploy token. `.env.example` is intentionally empty.

## 4. First run
Verified 01-10-2026 on the Lenovo (Node 22.23.2, npm 10.9.8), clean `npm ci`, no flags.
```
git clone https://github.com/bgachichio/myPDF.git mypdf && cd mypdf
npm ci                              # 0 vulnerabilities; no --legacy-peer-deps needed
pre-commit install                  # hooks: gitleaks, private keys, large files, em dashes
npm run dev                         # http://localhost:5173, tap Open PDF, choose any PDF from tests/corpus/
npm test                            # 3 files, 11 tests, about 2 s
npx playwright install chromium     # one-off, about 114 MB
npx playwright test                 # 2 tests, about 10 s, runs against dist/ served with the vercel.json headers
```
One-off asset step for OCR (already committed under `public/tesseract/`, repeat only to upgrade): `worker.min.js` from `node_modules/tesseract.js/dist/`, `tesseract-core-relaxedsimd-lstm.wasm.js` and `tesseract-core-simd-lstm.wasm.js` from `node_modules/tesseract.js-core/`, and `eng.traineddata.gz` from `https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/eng.traineddata.gz` (tessdata_fast, Apache-2.0, 1.9 MB). Browsers without SIMD are not supported for OCR.

Also needed for `node scripts/corpus-check.mjs`: `sudo apt-get install -y qpdf`. Without it the script exits 2 with a clear message and does not guess. CI installs qpdf and ran the corpus check green on 01-10-2026.

## 5. Build
`npm ci && npm run build` produces `dist/`. The expected size is about 16 MB raw, most of it `mupdf-wasm.wasm` (10.4 MB, 3.6 MB with Brotli) plus the Tesseract core and English data (not yet bundled; added at M3, measured then). Measured 01-10-2026 at M3: `npm run build` takes about 1.5 s; the service worker precaches 24 files, 20.6 MB: MuPDF wasm 10.4 MB (4.8 MB gzip on the wire), Tesseract worker, two core variants and `eng.traineddata.gz` about 8 MB, the app about 0.4 MB. Budget is under 60 s.

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
`./deploy.sh` runs these against the staged deployment before promoting; run them by hand against production once DNS resolves:
```
curl -sI https://mypdf.gachichio.org | grep -iE 'HTTP/|content-security-policy'      # HTTP/2 200 and the CSP header
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://mypdf.gachichio.org/manifest.webmanifest   # 200 application/manifest+json
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://mypdf.gachichio.org/assets/mupdf-wasm-<hash>.wasm   # 200 application/wasm
```
Observed 01-10-2026 on staged deployment `mypdf-n6nkbdzcq-gachichio.vercel.app`: `/` 200 text/html, manifest 200 application/manifest+json, wasm 200 application/wasm, `/sw.js` 200, CSP, Referrer-Policy, X-Content-Type-Options and Permissions-Policy all present. Pixel R01 share-sheet check (manual, Brian): install the app on the Pixel 9 Pro (Chrome, menu, Install app), open Gmail, open a message with a PDF attachment, tap Share, choose myPDF. Pass: the file opens in myPDF with its pages shown. Date and result: NOT YET RECORDED. The automated half (`tests/e2e/r01-share-open.spec.ts`) passes.

**Production run, 01-10-2026.** `BASE_URL=https://mypdf.gachichio.org npx playwright test` against the live site: 32 of 32 passed (R01 to R13, R15, the stage 4 and 5 specs) and R12 offline passed separately. The same suite runs against a local build in CI.

**Frontend verification, six stages, 01-10-2026** (production bundle for stage 6):
| Stage | Result | What it caught |
|---|---|---|
| 1 Static | `oxlint` (react, hooks, a11y rules) and ESLint and `tsc` clean | Dock buttons built as a component inside render (the remount class), setState inside effects, hooks misnamed `use...`, effect dependencies, a ref read during render. All fixed. |
| 2 Build | `npm run build` clean, 1.2 s | None. |
| 3 Render | 6 jsdom tests, output dumped and read | None. Home, Settings, Support and Receipt text is free of NaN, undefined and gift-size wording. |
| 4 Interaction | 3 specs, every field typed character by character | None. Focus held and values equal typed values, including `21.36`, `1,234.5`, `1-3, 5, 8-`. |
| 5 Edges | 5 specs: empty, corrupt storage, one page, both themes, four text sizes, 390 px, 44 px targets, corrupt file, wrong password | Four app tokens (`--paper`, `--redact-mark`, `--r-lg`, `--r-xl`) were never loaded, so sheet corners were square and the page paper was transparent: this had shipped in the M1 to M3 deploy. Touch targets shrank below 44 px at the Compact size (rem sizing). The Canvas header and Redact bar overflowed at 390 px on Extra large. All fixed. |
| 6 Parity | Stages 3 to 5 specs run against the minified production bundle, locally and against https://mypdf.gachichio.org | Identical results. |
Defects that reached a deployed build: 1 (the missing tokens), caught at stage 5 on the next pass.

**Public page check (seo section 8), 01-10-2026, production, Lighthouse mobile (slow 4G, 4x CPU):** Performance 98 to 99, Accessibility 100, Best Practices 100, SEO 100. FCP 1.2 to 1.8 s, LCP 1.4 to 2.0 s, TBT 0 to 40 ms, CLS 0. (A first measurement scored 71 to 86; the cause was a 352 KB font and an unsplit bundle. Fixed by subsetting Inter to Latin, 90 KB, and lazy-loading the editor screens and OCR.) Content visible without JavaScript: yes, a static first paint in `index.html`. Title, description, canonical, Open Graph, `SoftwareApplication` JSON-LD, `robots.txt` and `sitemap.xml` present. Baseline: title "myPDF: edit, sign, redact and compress PDFs privately", canonical https://mypdf.gachichio.org/, 1 indexable page.

**Crawler choice (assumed, Brian to confirm):** search crawlers allowed (Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot); training crawlers blocked (GPTBot, ClaudeBot, CCBot, Google-Extended). This was the builder's default. To allow them, delete those four blocks from `public/robots.txt` and redeploy.

**Known deviations:** the engine worker is not recycled after 60 s idle (BUILD-BRIEF section 2): open documents live in the worker, and recycling would need a save and reopen cycle. A 310-page file opens and scrolls within the 200 ms limit. Revisit if memory complaints arrive.

## 8. Rollback
`./rollback.sh [deployment-url]` runs `vercel rollback --yes`, then fails loudly if production did not move. Pass a target from `npx vercel ls` (staged deployments make "previous" ambiguous: with no argument Vercel reported success while staying on the same deployment, observed 01-10-2026). Tested 01-10-2026: `./rollback.sh https://mypdf-n6nkbdzcq-gachichio.vercel.app` moved production from `mypdf-ot3x69qba` to `mypdf-n6nkbdzcq` in 18 s (limit 60 s); `vercel promote <url>` restored it.

## 9. Troubleshooting
Nine failures that actually happened building M0 to M3 (01-10-2026):
1. **CI red at `npx eslint .`: "typescript-eslint does not support TS 7.0".** BUILD-BRIEF pins TypeScript 7.0.2. Fix: ESLint lints JS only (`eslint.config.js`); `tsc -b` is the TypeScript gate; `typescript-eslint` removed.
2. **Render threw "Failed to construct ImageData: input data length is not equal to 4 * width * height".** MuPDF returns 3 bytes per pixel when alpha is off. Fix: expand RGB to RGBA in `engine.worker.ts` before `createImageBitmap`.
3. **`corpus-check` reported 0 of 25 on a machine without qpdf.** The check swallowed the missing binary as a failure. Fix: it now exits 2 with "qpdf is not installed". Real result is from CI, where qpdf is installed.
4. **`vercel deploy --prebuilt` refused: output built for production, deploying to preview.** Fix: `vercel build --prod`, then `vercel deploy --prebuilt --prod --skip-domain` (staged, off the domain), verify, then `vercel promote`.
5. **`vercel deploy` failed with "fetch failed ... AbortError" while uploading.** The 10.4 MB wasm upload timed out once; an immediate retry succeeded. Re-run the deploy; nothing is half-applied.
6. **`./rollback.sh` with no argument returned success but changed nothing.** Fix: the script compares production before and after and fails; pass an explicit target.
7. **Every engine call hung after M1 added a static `import 'mupdf'` to the worker.** The mupdf module has a top-level await; a worker still evaluating drops its first messages. Fix: import lazily and make every engine method await a `ready` promise (`engine.worker.ts`).
8. **Playwright clicked the wrong place after switching Canvas tools.** The header height changes with the tool, so a box measured before the switch is stale. Measure after the tool bar settles.
9. **Lint failed on `public/share-target-sw.js`.** Service-worker globals (`self`, `Response`, `File`) are declared for that file in `eslint.config.js`.
Also seen: `vercel.app` aliases return 302 (Vercel deployment protection), so health checks use `vercel curl`, which carries the bypass. Candidates not yet hit: a stale service worker after an update, OPFS in private windows (M1), a Tesseract path 404 (M3).

## 10. Uninstall
1. `vercel domains rm mypdf.gachichio.org`, then delete the `mypdf` CNAME at the DNS host.
2. `vercel remove mypdf --yes`.
3. Archive the GitHub repository (Settings, Archive).
4. There is no VM, secret file, port or registry row to release. Installed PWAs keep their local data until the user uninstalls the app.
