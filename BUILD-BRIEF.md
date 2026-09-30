# BUILD-BRIEF.md - myPDF, milestones M0 to M4

Architect: Claude Chat, 30-09-2026. Spec: `PRODUCT-SPEC.md` Reviewed v0.3. Design: polished Workbench plus Canvas mock-up, signed off 30-09-2026.

This brief says **how**. Scope is `PRODUCT-SPEC.md` Section 6 (F01 to F14). Acceptance is Section 7 (R01 to R14). Milestones and exit criteria are Section 10. The companion (C01 to C04, M5) is out of this packet.

## 1. Five-line spec

| Line | Content |
|---|---|
| Task | Build the myPDF PWA: Workbench home, Canvas editor, Settings and Privacy Receipt, on MuPDF.js in a worker. |
| Artefact | A static PWA deployed at https://mypdf.gachichio.org, plus the committed repository and a tested `DEPLOY.md`. |
| Binary criteria | R01 to R13 and R15 pass as written; 25 of 25 corpus files pass open, save and `qpdf --check`; CI gate green. |
| Out of scope | Companion features, accounts, sync, telemetry, XFA, paragraph reflow, PDF to Word. |
| Kill condition | M0 corpus spike below 20 of 25, which triggers the EmbedPDF fallback and a handback; or spend above 130 hours before M3 closes. |

## 2. Build preflight

```
BUILD PREFLIGHT
Project        : myPDF
Shape          : PWA
Runs on        : browser (Pixel 9 Pro Chrome primary; desktop Chrome, Firefox, Safari)
Data engine    : none - OPFS (file bytes) + IndexedDB (recents, signatures) + localStorage (prefs)
New deps       : 3 runtime beyond house stack (mupdf, tesseract.js, comlink) - section 4
Closed tools   : none
RAM ceiling    : 1.5 GB tab on a 300-page file; engine worker recycled after 60 s idle
Lenovo RAM     : n/a for M0 to M4 (no Docker, no native build); required at M5
App slug       : mypdf
VM footprint   : none - browser only (no registry row; section 10.2 unchanged)
Coexistence    : n/a
Isolation      : n/a
Mock-up + plan : [x] signed off 30-09-2026
designer.md    : READ - preflight in PRODUCT-SPEC Appendix D
developer.md   : G0 PASS, G1 PASS (PRODUCT-SPEC Appendix B)
DEPLOY.md      : [ ] drafted (1, 2, 3, 5, 6, 10); builder fills 4, 7, 8, 9; tested at M4
Architect      : Claude Chat
Commit gate    : [ ] builder runs `pre-commit install`; CI runs `pre-commit run --all-files`
Frontend gate  : [ ] frontend-verification six stages at M4, stage 6 on the production bundle
Handover packet: [ ] committed at <sha>
Builder        : Claude Code
```

## 3. Target tree (exists when M4 closes)

```
mypdf/
├── CLAUDE.md  BUILD-BRIEF.md  DEPLOY.md  PRODUCT-SPEC.md  README.md  LICENSE
├── .claude/settings.json  .claude/hooks/guard-read.py
├── .github/workflows/gate.yml  .pre-commit-config.yaml  .gitignore  .env.example
├── vercel.json  deploy.sh  rollback.sh
├── index.html                    # loads /theme-init.js synchronously in <head>
├── public/
│   ├── theme-init.js             # no-flash script (designer section 12)
│   ├── icons/                    # 192, 512, maskable 512
│   └── tesseract/                # worker.min.js, core wasm, eng.traineddata.gz
├── src/
│   ├── main.tsx  app/App.tsx  app/router.ts      # screens: home, work, canvas
│   ├── config/support.ts                         # Paystack URL, Bitcoin address, sign-off (F15)
│   ├── styles/tokens.css  styles/globals.css     # tokens resolved; globals from designer assets
│   ├── hooks/appearance.tsx                      # copied from designer assets
│   ├── engine/PdfEngine.ts                       # the interface in section 5
│   ├── engine/mupdf/engine.worker.ts             # the only file that imports "mupdf"
│   ├── engine/mupdf/client.ts                    # comlink wrapper implementing PdfEngine
│   ├── engine/ocr/ocr.worker.ts                  # tesseract.js, self-hosted paths
│   ├── storage/opfs.ts  storage/idb.ts  storage/prefs.ts
│   ├── features/home/  features/workbench/  features/canvas/
│   ├── features/settings/  features/privacy-receipt/  features/export/  features/support/
│   ├── history/undo.ts                           # command stack, 50 steps minimum (R11)
│   └── sw/share-target.ts                        # handles POST /share, writes to OPFS
├── tests/
│   ├── unit/                     # vitest: engine adapter, undo, storage
│   ├── e2e/                      # playwright: R01 to R13 by id, one spec file per R
│   └── corpus/MANIFEST.md + files # public or synthetic only
└── scripts/corpus-check.mjs      # open, save, qpdf --check, render timing for all 25
```

## 4. Dependencies (pinned exactly; lockfile committed)

| Package | Version | Licence | Failure without it |
|---|---|---|---|
| mupdf | 1.28.1 | AGPL-3.0-or-later | No render, edit, redact, encrypt or save. |
| tesseract.js | 7.0.0 | Apache-2.0 | No OCR (F09, R09). |
| comlink | 4.4.2 | Apache-2.0 | Hand-rolled worker RPC; more code, more bugs. |
| react, react-dom | 19.3.0 | MIT | House stack. |
| vite | 8.3.1 | MIT | House stack. |
| @vitejs/plugin-react | 6.1.1 | MIT | House stack. |
| typescript | 7.0.2 | Apache-2.0 | House stack. |
| tailwindcss, @tailwindcss/vite | 4.3.3 | MIT | House stack. |
| vite-plugin-pwa | 1.3.0 | MIT | No install, offline or share target. |
| lucide-react | 1.49.0 | ISC | House icons. |
| vitest | 5.0.2 | MIT | No unit tests. |
| @playwright/test | 1.63.0 | Apache-2.0 | No R-id end-to-end tests, no R13 egress proof. |
| eslint | 10.11.0 | MIT | No lint gate. |

shadcn/ui components are copied in as source (MIT), not installed. Any package not in this table is a handback.

## 5. The engine interface (fixed; changes are a handback)

```ts
// src/engine/PdfEngine.ts
export type DocId = string;
export type Rect = [number, number, number, number];      // PDF user space, points
export type Quad = [number, number, number, number, number, number, number, number];

export interface PageInfo { index: number; width: number; height: number; rotation: 0 | 90 | 180 | 270 }
export interface SearchHit { page: number; quads: Quad[] }
export interface SaveOptions { compress: boolean; stripMetadata: boolean; password?: string }

export interface PdfEngine {
  open(bytes: ArrayBuffer, password?: string): Promise<{ id: DocId; pages: PageInfo[]; needsPassword: boolean }>;
  render(id: DocId, page: number, scale: number): Promise<ImageBitmap>;
  text(id: DocId, page: number): Promise<string>;
  search(id: DocId, needle: string): Promise<SearchHit[]>;
  // Workbench (F02)
  rearrange(id: DocId, order: number[]): Promise<void>;
  rotate(id: DocId, pages: number[], degrees: 90 | 180 | 270): Promise<void>;
  insertBlank(id: DocId, at: number): Promise<void>;
  merge(target: DocId, source: DocId, at: number): Promise<void>;
  extract(id: DocId, pages: number[]): Promise<DocId>;
  imagesToPdf(images: Blob[]): Promise<DocId>;
  // Canvas (F03 to F07, F11)
  annotate(id: DocId, page: number, a: AnnotationInput): Promise<string>;
  replaceText(id: DocId, page: number, span: Quad[], text: string): Promise<{ usedFallbackFont: boolean }>;
  fields(id: DocId): Promise<FormField[]>;
  setField(id: DocId, name: string, value: string | boolean): Promise<void>;
  flatten(id: DocId): Promise<void>;
  placeImage(id: DocId, page: number, rect: Rect, png: Blob): Promise<void>;   // signatures
  markRedaction(id: DocId, page: number, quads: Quad[]): Promise<string>;
  applyRedactions(id: DocId): Promise<{ verified: boolean; residualMatches: number }>;
  stamp(id: DocId, kind: 'pageNumbers' | 'watermark', text?: string): Promise<void>;
  // Output (F08, F10, F12)
  save(id: DocId, opts: SaveOptions): Promise<Uint8Array>;
  setMetadata(id: DocId, meta: Record<string, string>): Promise<void>;
  close(id: DocId): Promise<void>;
}
```

`AnnotationInput` and `FormField` are defined in the same file by the builder as plain data types. Adding a method is a handback.

**Resolved engine calls.**
- Merge: `graftPage`.
- Reorder: `rearrangePages`.
- Redaction: `applyRedactions(true, REDACT_IMAGE_PIXELS, REDACT_LINE_ART_REMOVE_IF_COVERED, REDACT_TEXT_REMOVE)`, then re-extract the text under each marked rectangle. `verified` is true only when `residualMatches === 0`.
- `replaceText`: a text-only redaction (`black_boxes` false, `REDACT_IMAGE_NONE`, `REDACT_LINE_ART_NONE`), then insert the new text at the original baseline. Use the original font if it holds every glyph, otherwise Noto Sans embedded, and return `usedFallbackFont`.
- Save strings:
  - `garbage=compact,compress` when compressing;
  - `incremental` for quick saves inside a session;
  - `encrypt=aes-256,user-password=…,owner-password=…` when a password is set.

## 6. Storage (fixed schema)

**OPFS.**

| Path | Contents |
|---|---|
| `/docs/<docId>/original.pdf` | The file as opened. |
| `/docs/<docId>/working.pdf` | The latest incremental save. |
| `/inbox/<uuid>.pdf` | Files received from the share target. |

**IndexedDB** (database `mypdf`, version 1).

| Store | Record |
|---|---|
| `recents` | `{ docId, name, pages, updatedAt }` |
| `signatures` | `{ id, kind: 'draw' \| 'type' \| 'image', png: Blob, createdAt }` |

**localStorage.**

| Key | Values | Default |
|---|---|---|
| `ui.theme` | `system` \| `light` \| `dark` (designer §12.1) | `system` |
| `ui.fontScale` | `compact` \| `default` \| `large` \| `xlarge` (designer §12.2) | `default` |
| `export.compress` | `true` \| `false` | `true` |
| `export.stripMetadata` | `true` \| `false` | `true` |

## 7. PWA wiring (resolved)

- **Manifest.**
  - Name `myPDF`, `theme_color` `#237352`, `display` `standalone`.
  - `share_target`: `{ action: "/share", method: "POST", enctype: "multipart/form-data", params: { files: [{ name: "file", accept: ["application/pdf"] }] } }`.
  - `file_handlers`: `[{ action: "/", accept: { "application/pdf": [".pdf"] } }]`.
- **Service worker.**
  - Precache the shell, the engine chunk, `mupdf-wasm.wasm` and `public/tesseract/**`.
  - `sw/share-target.ts` intercepts `POST /share`, writes the file to `/inbox/`, and redirects with 303 to `/?open=inbox/<uuid>`.
- **Loading order.** The shell renders without the engine. The engine worker spawns on first open. Progress is shown from the wasm fetch `Content-Length`.
- **Headers** are in `vercel.json` (CSP, no third-party origins).

## 8. Screens and components (from the signed-off mock-up)

| Screen | Contents |
|---|---|
| Home | Mono hero line, **Open PDF** as the primary pill, Merge files, recents, the companion card showing "Not detected", and the "0 bytes sent" Privacy Receipt chip. A footer carries the tonal **☕ Support myPDF** button and the sign-off "Made with ❤️ by Brian Gachichio" (linked to x.com/b_gachichio). |
| Workbench | Three-column thumbnail grid with multi-select. The bottom dock is contextual: with nothing selected it shows Blank page, Compress, Page numbers, Watermark and OCR; with pages selected it shows Edit, Rotate, Duplicate, Move, Extract and Delete. Primary action: **Export**. Long-press and drag reorders pages on touch. |
| Canvas | Page view with the tool dock: Select, Edit text, Highlight, Draw, Sign, Redact, Fields. Undo and redo sit in the top bar. In Redact mode a warning banner shows the marked count, and the primary action turns into the error-coloured **Apply redaction (n)**. |
| Sheets | Settings, Sign, Export and Support, all bottom sheets with `--r-xl` top corners. Settings ends with an About group: a Support row, a Source code row (GitHub, AGPL-3.0), the domain line and the sign-off. Support offers Card or M-Pesa (Paystack, opens in a new tab) then Bitcoin as two cards (copy per `builder` §6.1, no gift-size wording): Lightning first (`lightning:` URI), on-chain Taproot second (`bitcoin:` URI), each address shown in mono with Copy and Open wallet buttons. All values come from `src/config/support.ts`. |

Copy follows the mock-up v2 verbatim, including "Your file stays on this device" and "Payments leave myPDF only when you tap. Your documents never do." Every interactive element is at least 44 by 44 px at every text size. Mock-up v2 was verified headless on 30-09-2026 at 390 px light (M), 390 px dark (XL) and 1280 px light (M): no horizontal overflow, no target under 44 px, no console errors, and all journeys completed.

## 9. Tests

| Layer | What | Where |
|---|---|---|
| Unit | Every `PdfEngine` method against three small fixtures; undo stack; storage round trips | `tests/unit/`, `npm test` |
| End to end | One Playwright spec per requirement, named `r01-share-open.spec.ts` to `r13-zero-egress.spec.ts` (R01 is covered by a manual Pixel check recorded in `DEPLOY.md` section 7) | `tests/e2e/` |
| Corpus | 25 files: open, save, `qpdf --check`, first-render time, redaction residue | `scripts/corpus-check.mjs`, run in CI |
| Support (R15) | Playwright checks the link targets, clipboard copy and `bitcoin:` URI; unit tests check the bech32m checksum of `BTC_ADDRESS` and that the production build guard fails if either address is empty | `tests/e2e/r15-support.spec.ts` |
| Egress (R13) | The Playwright route handler fails the test on any request whose origin is not the app's, after the initial load | `tests/e2e/r13-zero-egress.spec.ts` |

**Corpus (`tests/corpus/MANIFEST.md`).** Source files only from:
- the Mozilla pdf.js test suite (Apache-2.0);
- public Kenyan government forms (KRA, NSSF);
- the Library of Congress or arXiv open-access papers;
- synthetic board papers generated with LibreOffice from invented data.

Cover these categories at minimum: fillable form, scanned image-only, encrypted, 300+ pages, image-heavy, right-to-left text, damaged xref, and PDF 2.0.

## 10. Milestone sequence

| Milestone | Build | Exit criterion |
|---|---|---|
| M0 (to 11-10-2026) | Scaffold, the four defaults, tokens, engine worker with `open` and `render`, and `corpus-check.mjs`. Deploy the shell to production. | Record the corpus result in `PRODUCT-SPEC.md` Section 4 and hand back to Chat for the pivot-or-persevere decision. |
| M1 | Workbench and organise functions. | R01 to R03, R11 and R12 pass. |
| M2 | Canvas: text, annotate, sign, fields. | R04 to R06 pass. |
| M3 | Redact, OCR, compress, protect. | R07 to R10 pass. |
| M4 | Privacy Receipt, Support sheet and sign-off (F15), hardening, frontend-verification, `DEPLOY.md` finished and tested. | R13 and R15 pass, and the site is live at mypdf.gachichio.org. |
