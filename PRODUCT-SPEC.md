# myPDF: Product Specification

## 0. Header

| Field | Value |
|---|---|
| Product | myPDF (served at mypdf.gachichio.org; previously myPDFdoc at mypdfdoc.online) |
| Owner | Brian Gachichio Karanja |
| Status | Reviewed v0.6 (Design Review Gate signed off; moves to Approved when §I.2 items 3 and 9 close at M0 and M3) |
| Date | 30-09-2026 |
| Licence | AGPL-3.0-or-later |
| Shape | PWA, browser-first, with an optional local Docker companion |
| Decision log | Section 12 of this document |

Version history: v0.1 (30-09-2026) first draft, written from the upgrade research brief and three owner decisions logged in Section 12. v0.2 (30-09-2026) Workbench plus Canvas direction approved; MuPDF.js re-verified against alternatives and a live spike (Appendix D); fallback engine changed to EmbedPDF. v0.3 (30-09-2026) polished mock-up signed off; MinerU exclusion and EmbedPDF fallback approved; handover packet issued. v0.4 (30-09-2026) domain set to mypdf.gachichio.org; house sign-off and Support sheet (Paystack and Bitcoin) added as F15 and R15; mock-up v2 verified headless. v0.5 (30-09-2026) Bitcoin receiving details set: Lightning address and Taproot on-chain address. v0.6 (30-09-2026) F15 now follows the house rule in `builder` §6.1; gift-size wording removed; stored theme and font-scale values aligned with `designer` §12.

## 1. Outcome, written backwards

**Headline: Edit any PDF on your phone or laptop. It never leaves your device.**

myPDF is a full PDF editor that runs inside the browser. You open a file, then reorder pages, edit text, fill forms, sign, redact, compress and OCR it, and save the result. No part of the file is uploaded, because there is no server to upload it to. It installs like an app, works offline, and is free and open source.

**The problem.** Capable PDF tools either cost a subscription or require the file to be uploaded to someone else's server. For anyone handling board papers, contracts, payslips or ID documents, uploading is a breach waiting to happen. Free offline tools exist, but they are desktop-only, fragmented across several programs, and poor on a phone.

**The solution.** One installable web app that does the twenty jobs people actually use PDF tools for, on the device, in one place. When a job is impossible in a browser (Word to PDF, deep document extraction, certificate signing), an optional companion running in Docker on your own laptop does it, still without the file leaving your machine.

**Customer quote (fictional).** "I redacted a board paper on the train, signed it, and sent it before I reached the office. Nothing went to the cloud, and the redacted text was actually gone, not just covered."

**How to get it.** Visit mypdf.gachichio.org, tap Install, and open any PDF from Files or the Share menu.

## 2. Why

**Golden Circle.** Why: confidential documents should never need to leave their owner's device to be edited. How: a single high-fidelity PDF engine compiled to WebAssembly, running in the browser, offline. What: an installable, open-source PDF editor covering viewing, page organisation, annotation, text editing, forms, signing, redaction, compression and OCR.

**Gap type.** Opportunity gap. The previous myPDFdoc (edit, sign, compress, merge, split, client-side) is offline and its repository is archived. This is a rebuild, not a patch.

**5C snapshot.**

| C | One line |
|---|---|
| Company | One builder, part-time, PWA-first stack already proven on Kenya Pulse and myDownloader. |
| Customers | Professionals who handle confidential PDFs on mobile and laptop and will not upload them. |
| Competitors | Adobe Acrobat (paid), iLovePDF and Smallpdf (upload-based), Stirling-PDF (self-hosted, open-core, free only to five users), PDFsam and pdfarranger (desktop-only). |
| Collaborators | Artifex (MuPDF, AGPL), Tesseract.js, Gotenberg, Docling and pyHanko maintainers. |
| Climate | Rising data-protection enforcement (Kenya Data Protection Act 2019) and mature WebAssembly make browser-only processing credible. |

**Economic gate (brian §6).** Time cost is estimated at 100 build hours across twelve weeks. At the personal working rate of KES 1,673 per hour, that is **KES 167,300**. Direct monetary gain is **[UNVALIDATED]**: no revenue model is planned under AGPL, and the saving against a paid PDF tool is modest. The build still passes the gate on two grounds. It serves Life Goal 5 (mentally sharp) and Life Goal 3 (a portfolio asset toward running his own company). It also compounds the public-intellectual brand as a demonstrable, privacy-first product. **Verdict: GO, capped.** Kill or re-scope if spend passes 130 hours before Milestone M3 closes.

## 3. Customer and job

**Primary persona: the confidential-document executive.** The situation is a senior professional in Nairobi who receives and returns PDFs daily (board papers, contracts, forms) on a Pixel phone and a Linux laptop. The struggle is that every free tool worth using wants the file uploaded, and confidentiality rules that out. The hire is to "change this PDF and send it back, now, without it leaving my hands". The goal is to finish PDF chores in minutes on whatever device is to hand.

**Evidence.** A single user (the owner), based on his own past behaviour of building myPDFdoc because upload tools were unacceptable. This is **[UNVALIDATED]** beyond n=1 and is tested in Section 4.

**Secondary personas, ranked.** (1) Lawyers and advocates handling client bundles. (2) SME owners filling and signing statutory forms (KRA, NSSF, SHA). (3) Students merging and compressing submissions on low-data phones.

**Four forces.**

| Force | Content |
|---|---|
| Push | Upload tools breach confidentiality; Acrobat costs money; phone PDF apps are weak. |
| Pull | One free app, offline, private, mobile-first, and true redaction. |
| Anxiety | "Will the output open correctly in Acrobat?" "Is the redaction real?" |
| Habit | People already have iLovePDF bookmarked and it works well enough. |

## 4. Hypothesis and validation

**Hypothesis.** We believe that professionals handling confidential PDFs have no private, capable, mobile tool, and that myPDF will let them complete at least 80% of their PDF tasks without falling back to another tool.

**Assumptions ranked by risk.**

| # | Assumption | Risk | P/S/A grade |
|---|---|---|---|
| A1 | MuPDF.js in the browser renders and saves real-world PDFs with output Acrobat opens cleanly. | Medium | P, partly (spike of 30-09-2026 on a sample file passed; the 25-file corpus is still to run) |
| A2 | Text editing of existing PDFs is good enough for small corrections. | High | A (assumed) |
| A3 | The WASM bundle loads fast enough on a Pixel 9 Pro over mobile data on first visit. | Medium | S (engine is 10.4 MB, 3.6 MB with Brotli; load time untested) |
| A4 | Users other than the owner share the problem. | Medium | A (assumed) |

**Experiments, thresholds fixed before they run.**

1. **Engine spike (breaks A1 to A3), in week one.** A 25-file corpus (bank board packs, scanned forms, fillable KRA forms, image-heavy reports, encrypted files). Pass: at least 23 of 25 open, save and pass `qpdf --check`; first render of page 1 in under 3 seconds on a Pixel 9 Pro after caching. Kill: fewer than 20 of 25, which means falling back to the EmbedPDF (PDFium) architecture in Appendix A.
2. **Dogfood log (breaks the hypothesis), for four weeks from M2.** Every PDF task the owner performs is logged, whether it was completed in myPDF or needed another tool. Pass: at least 80% completed in myPDF. Kill: under 50%.
3. **Five problem interviews (breaks A4), by M3.** Question: "Tell me about the last time you had to edit or sign a PDF." Pass: at least 3 of 5 describe an upload concern or a workaround. Kill: 0 or 1 of 5, which means myPDF stays a personal tool with no launch effort.

**M0 result (01-10-2026).** Experiment 1: 25 of 25 corpus files open, render page 1, save with `garbage=compact,compress` and pass real `qpdf --check` in CI (two encrypted files of unknown password are open-checked only; the AES-256 synthetic file is checked with its password). Page-1 render times 3 to 307 ms in Node; the Pixel 9 Pro cached-load timing (A3) is still untested. Verdict: persevere with MuPDF.js; the EmbedPDF fallback is not triggered. A2 (text-edit quality) and A4 (other users) stay unvalidated.

**Decision.** Persevere with MuPDF.js, 01-10-2026 (Section 12). The wider pivot-or-persevere call on the hypothesis waits for the dogfood log and interviews.

## 5. Journey and friction

**Scenario 1: fix and send on mobile.** An email attachment arrives. The user taps Share, then myPDF, and the file opens in the editor. They edit a figure, sign, export and share it back to email. The target is under 90 seconds end to end.

**Scenario 2: assemble a pack on laptop.** The user drags three PDFs and two images onto the window. In the page organiser they reorder, delete and rotate pages, add page numbers and a watermark, compress, and save.

**Scenario 3: redact for release.** The user searches for a name, marks all matches, adds manual boxes and applies redaction. A verification pass confirms that no text is left under the boxes, and the user exports.

**Scenario 4 (companion): convert Word to PDF.** The user opens a DOCX. myPDF detects the local companion, converts the file through it, and opens the result in the editor.

**Drop-off map and value gap.**

| Stage | Risk | Value gap |
|---|---|---|
| Discovery | Nobody finds it. | Out of scope for the MVP; the launch post only. |
| Onboarding | First load downloads a large WASM bundle. | **Value gap:** a blank screen during the first download. It is fixed by a progress state and by caching the engine on install. |
| First use | The output looks different from the original. | **Value gap:** the user loses trust at first export. It is fixed by the fidelity corpus test, which is required to pass. |
| Habit | The user forgets the app exists. | It is fixed by registering as a share and file target, so myPDF appears where PDFs are opened. |

## 6. Scope

**Most critical user story.** "As a professional with a confidential PDF, I can open it on my phone or laptop, change it (pages, text, signature, redaction) and save it, without the file ever leaving my device."

**Feature audit of the previous myPDFdoc.** Its core features (edit, sign, compress, merge, split) are kept and rebuilt. Waste was not measurable, because no usage data exists.

**In scope (MVP, browser-only).**

| ID | Feature | Kano |
|---|---|---|
| F01 | Open (picker, drag and drop, Android share target, desktop file handler), view, zoom, search, thumbnails, outline | Must-be |
| F02 | Page organiser: reorder, rotate, delete, duplicate, insert blank, extract, split by range, merge files, images to PDF | Must-be |
| F03 | Annotate: highlight, underline, strike, freehand ink, text box, shapes, sticky note | Performance |
| F04 | Edit existing text within a line, plus add new text and images | Performance |
| F05 | Fill AcroForm fields; flatten the form | Must-be |
| F06 | Visual signature: drawn, typed or image, saved on the device for reuse | Must-be |
| F07 | True redaction: search-and-mark plus manual boxes, applied so that the underlying content is removed | Performance |
| F08 | Compress (clean, garbage-collect, deflate, downsample images) | Performance |
| F09 | OCR scanned pages into a searchable invisible text layer | Performance |
| F10 | Encrypt and decrypt with a password; edit metadata; strip metadata | Must-be |
| F11 | Page numbers and text watermark | Performance |
| F12 | Export and save: download, Web Share, File System Access save-in-place on desktop | Must-be |
| F13 | Settings: Auto/Light/Dark theme defaulting to the device, a 4-step font size, default export options, all persisted in localStorage | Must-be (house standard) |
| F14 | Delighter: a **Privacy Receipt** panel that counts network requests since launch and shows a green "0 bytes sent" badge | Attractive |
| F15 | Per `builder` §6.1: house sign-off "Made with ❤️ by Brian Gachichio" (linked to x.com/b_gachichio) on Home and in Settings, and a **Support** sheet with Paystack (card or M-Pesa, paystack.shop/pay/gachichio) and Bitcoin: Lightning `gachichio@walletofsatoshi.com` first, then on-chain Taproot `bc1ptrd8…q6yfu6`, each with Copy and Open wallet | Indifferent (house standard) |

**Phase 2 (local companion, opt-in).**

| ID | Feature | Engine |
|---|---|---|
| C01 | Office to PDF (DOCX, XLSX, PPTX, ODT and HTML) | Gotenberg (MIT), wrapping LibreOffice |
| C02 | PDF to structured Markdown or JSON, including tables | Docling (MIT) |
| C03 | Cryptographic PAdES signature with a local certificate | pyHanko (MIT) |
| C04 | Heavy batch OCR and PDF/A output | OCRmyPDF (MPL-2.0) |

**Explicitly out of scope.** User accounts; cloud storage or sync; real-time collaboration; AI chat with a PDF; MinerU (GPU-bound, custom licence); PDF to Word conversion; reflowing whole paragraphs across lines; XFA forms; native app-store builds; any analytics or telemetry.

## 7. Requirements

Each requirement below is binary. Test files come from the 25-file fidelity corpus (the "corpus").

| ID | Story | Acceptance criteria (PASS or FAIL) | Priority | Kano |
|---|---|---|---|---|
| R01 | As a user I open a PDF from the Android share sheet. | Sharing a PDF from Gmail on a Pixel 9 Pro opens it in myPDF with page 1 rendered. | P1 | Must-be |
| R02 | As a user I view large files smoothly. | A 300-page corpus file scrolls without the main thread blocking for more than 200 ms (Chrome performance trace). | P1 | Must-be |
| R03 | As a user I reorder and merge pages. | Merging three corpus files and moving page 5 to position 1 produces a file whose page order matches the organiser and passes `qpdf --check`. | P1 | Must-be |
| R04 | As a user I edit a word in existing text. | Replacing a word on a corpus text page saves, re-opens in Acrobat Reader, and shows the new word on the same baseline. Where the embedded font lacks a glyph, a warning appears before save. | P1 | Performance |
| R05 | As a user I fill and flatten a form. | All fields of the corpus KRA form accept input. After flattening, the saved file contains no AcroForm fields (`qpdf --json` shows none). | P1 | Must-be |
| R06 | As a user I sign visually. | A drawn signature placed on page 2 appears at the same position after save and re-open, and is reusable from the saved-signatures list after a browser restart. | P1 | Must-be |
| R07 | As a user I redact for real. | After applying redaction to a marked name, text extraction (`mutool draw -F txt`) of the saved file returns zero matches for that name, and the region's image pixels are replaced. | P1 | Performance |
| R08 | As a user I compress a file. | The image-heavy corpus file shrinks by at least 30% and remains viewable. | P2 | Performance |
| R09 | As a user I OCR a scan. | After OCR, searching a known word on the corpus scan finds it, and the page looks unchanged. | P2 | Performance |
| R10 | As a user I password-protect a file. | The saved file asks for the password in Acrobat Reader and opens with it. | P2 | Must-be |
| R11 | As a user I undo mistakes. | Every edit action can be undone and redone at least 50 steps deep within a session. | P1 | Must-be |
| R12 | As a user I work offline. | With airplane mode on after install, R03 to R11 all pass. | P1 | Must-be |
| R13 | As a user I trust that nothing uploads. | An automated Playwright test running scenarios 1 to 3 records zero requests to any origin other than mypdf.gachichio.org, and none after the initial asset load. User-tapped links to Paystack, X, GitHub or a wallet are navigations in a new tab that carry no document data, and are excluded. | P1 | Attractive |
| R15 | As a user I can support the project. | Tapping Support on Home or in Settings opens the Support sheet. The Paystack option opens https://paystack.shop/pay/gachichio in a new tab. Each Copy button puts the exact configured address on the clipboard (Lightning, then on-chain). Open wallet uses a `lightning:` URI for Lightning and a `bitcoin:` URI for on-chain. A unit test re-verifies the on-chain address's bech32m checksum on every build, and the production build fails if either address is empty. The sign-off link opens x.com/b_gachichio. None of these fire a request until tapped. | P2 | Indifferent |
| R14 | As a user I use the companion when present. | With the companion running, a DOCX converts and opens. With it stopped, the DOCX option shows "Companion not running" and a set-up link, and no error. | P3 | Performance |

**Quality-bar states (required, not left to taste).**
- **Empty state:** an open-file call to action with a drag target and "Your file stays on this device".
- **Loading:** engine download progress with a percentage on first run; page skeletons during render.
- **Error:** an encrypted file prompts for the password; a corrupt file offers "Try repair" (MuPDF repair on open); files over 250 MB are refused with the reason.
- **Zero state:** search with no matches says so and offers the OCR tip on scanned pages.
- **Real data:** all demos and tests use corpus files, never lorem ipsum.

**Non-functional requirements.**
- **Accessibility:** WCAG 2.2 AA; full keyboard operation; screen-reader labels on every tool; the 4-step font scale applies to the UI chrome.
- **Security:** see Appendix B.
- **Privacy:** no telemetry, no third-party requests, no CDN. All assets are self-hosted and precached.
- **Performance:** first interactive shell under 2 s on 4G. The engine is lazy-loaded, never on the critical path of the shell. All PDF work runs in a Web Worker.
- **Compatibility:** current Chrome, Edge, Firefox and Safari; Android Chrome is the primary target.
- **Licence compliance:** a "Source" link on every screen's settings panel points to the public repository (AGPL-3.0 section 13).

## 8. Success metrics

myPDF collects no telemetry, so every metric is measured locally or by test.

| Metric | Type | Baseline | Target | Date | Source | Owner |
|---|---|---|---|---|---|---|
| Share of owner's PDF tasks completed in myPDF | North Star | 0% (app offline) | 80% or more | 20-12-2026 | Dogfood log | Brian |
| Corpus files that pass open, save and `qpdf --check` | Input | Not measured | 25 of 25 | 06-12-2026 | CI fidelity test | Brian |
| Time to first page render, Pixel 9 Pro, cached | Input | Not measured | Under 1.5 s | 06-12-2026 | Lighthouse and trace | Brian |
| Scenario 1 end-to-end time | Input | Not measured | Under 90 s | 20-12-2026 | Stopwatch, 5 runs | Brian |
| Document bytes sent off-device | Guardrail | Not measured | 0, always | Every CI run | R13 Playwright test | Brian |
| Redaction leaks in corpus | Guardrail | Not measured | 0, always | Every CI run | R07 test | Brian |

**Vanity metrics excluded by name:** page views, PWA installs, GitHub stars.

**Satisfaction.** Each month the owner asks himself one question: "Did I reach for another PDF tool this month, and why?" The answer goes into the dogfood log. After launch, the same question is placed on a GitHub Discussions pinned thread.

## 9. Agentic and trust

Not agentic.

## 10. Plan

Planned at about 8 hours a week (100 hours in total). Every milestone ships something usable.

| Milestone | Dates | Exit criterion |
|---|---|---|
| M0: Gate and spike | 01-10-2026 to 11-10-2026 | Mock-up direction signed off; engine spike result recorded against the Section 4 thresholds; handover packet committed; a deployed shell that opens and renders a PDF (usable in week one). |
| M1: Organise | 12-10-2026 to 25-10-2026 | R01 to R03, R11 and R12 pass; F13 settings done. |
| M2: Edit and sign | 26-10-2026 to 08-11-2026 | R04 to R06 pass; dogfood log starts. |
| M3: Protect | 09-11-2026 to 22-11-2026 | R07 to R10 pass; five interviews done; hours checked against the 130-hour cap. |
| M4: Harden and launch | 23-11-2026 to 06-12-2026 | R13 passes; frontend-verification's six stages are clean against the production bundle; DEPLOY.md is tested from a clean checkout; live on mypdf.gachichio.org. |
| M5: Companion v1 | 07-12-2026 to 20-12-2026 | R14 passes with Gotenberg and Docling on the Lenovo, and the §3.2 RAM check is recorded. |

**Dependencies.** M1 to M4 depend on the M0 engine verdict. M5 depends on the Lenovo RAM check (builder §3.2).

**Cut-scope rule.** Before cutting anything, re-read the Section 3 job. Cut in this order: F11, F08, F09, then Phase 2. Never cut F07 (redaction) or R13 (privacy), because they are the reason the product exists.

## 11. Launch and learn

**Message.** "Edit any PDF. It never leaves your device." It is a benefit, not a feature list.

**Launch plan.**
1. A GitHub README with a short demo video (create-a-video).
2. One Substack note and one LinkedIn post on why confidential documents should never be uploaded, linking to the app.
3. A post in r/selfhosted about the companion.

**Post-launch review on 20-01-2027.** A retrospective, the Section 8 metrics against targets, and a recommendation to iterate, add the Phase 2 companion features, or retire the product.

## 12. Risks, open questions, decision log

**Decision log.**

| Date | Decision | By | Reason |
|---|---|---|---|
| 30-09-2026 | Browser-first, with an optional local Docker companion. | Brian | Keeps privacy absolute while unlocking Office conversion, extraction and certificate signing on his own machine. |
| 30-09-2026 | myPDF is licensed AGPL-3.0-or-later. | Brian | Makes MuPDF.js usable, which gives in-browser text editing and true redaction without a server. |
| 30-09-2026 | The spec is written now, with the mock-ups in parallel (a waiver of product §C.2a's order). | Brian | Speed. The spec stays Draft until the mock-up sign-off. |
| 30-09-2026 | MuPDF.js is the single PDF engine, replacing PDF.js plus pdf-lib. | Brian, on Claude's proposal, re-verified (Appendix D) | One engine covers rendering, editing, forms, redaction, encryption and saving; a live spike passed. |
| 30-09-2026 | MinerU is excluded. | Brian, on Claude's proposal | GPU-bound with a custom licence; Docling covers the need on CPU. |
| 30-09-2026 | Design direction: Workbench (C) as home, opening into Canvas (B) for page edits. | Brian | Workbench suits pack assembly and phones; Canvas gives full tools in context. |
| 30-09-2026 | EmbedPDF replaces PDF.js plus pdf-lib as the fallback engine. | Brian, on Claude's proposal | Permissive, actively maintained, and keeps true redaction and forms. |
| 30-09-2026 | Polished Workbench plus Canvas mock-up signed off; handover packet (BUILD-BRIEF.md and five companion artefacts) issued for M0. | Brian | Design Review Gate complete (product §C.2a). |
| 30-09-2026 | Serve myPDF at mypdf.gachichio.org, alongside the other gachichio.org apps. | Brian | One brand domain for the app portfolio. |
| 30-09-2026 | Add the house sign-off and a Support sheet (Paystack and Bitcoin). | Brian | House standard across myDownloader and Kenya Pulse. |
| 30-09-2026 | Bitcoin support: Lightning `gachichio@walletofsatoshi.com` shown first, on-chain Taproot `bc1ptrd8ykgu046nkwjml4kvtke0vz6ga0cmhccmgkpspwuswrasjspqq6yfu6` second; checksum verified. | Brian (addresses); Claude (order) | Wallet of Satoshi charges 1.95% plus network fee to receive on-chain; Lightning is instant with near-zero fees. |
| 30-09-2026 | No Support copy may suggest a gift size ("best for small amounts" and "for larger amounts" removed). The sign-off and Support sheet become a standing rule for every personal project (`builder` §6.1). | Brian | Size cues anchor supporters low. |
| 01-10-2026 | M0 engine verdict: persevere with MuPDF.js (25 of 25, CI, real qpdf). M0 shell deployed to Vercel project `mypdf`; DNS CNAME for mypdf.gachichio.org pending at the DNS host. | Brian (go), Claude Code (evidence) | Corpus spike passed the 23-of-25 bar; kill threshold (under 20) not approached. |
| 30-09-2026 | The fidelity corpus is built only from public or synthetic files; no real bank or client document ever enters the repository. | Claude, under developer §8.5 | A public AGPL repository would otherwise leak confidential data. |

**Risks.**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MuPDF.js bundle size (3.6 MB with Brotli) slows the first load | Medium | Medium | The shell ships first; the engine is lazy-loaded, precached on install and shown with a progress state. |
| Text editing looks wrong with subset fonts | High | Medium | Scope is limited to in-line replacement with a pre-save warning (R04). |
| Chrome's Private Network Access blocks calls from mypdf.gachichio.org to the localhost companion | Medium | Medium | Companion sends the PNA preflight headers; fallback is serving myPDF from the companion itself at localhost. |
| Maintainer burnout (one builder) | Medium | High | 100-hour budget, 130-hour kill cap, strict scope. |
| AGPL deters corporate contributors | Low | Low | Accepted; not a growth product. |

**Open questions.**

| Question | Owner | Due |
|---|---|---|
| Does the corpus-wide spike (25 files) pass, and does F04 hold up on real fonts? | Claude Code, reviewed by Brian | 11-10-2026 |
| Keep mypdf.gachichio.org as a 301 redirect to mypdf.gachichio.org, or let it lapse? | Brian | 06-12-2026 |

## Appendix A: Architecture (builder)

**Shape.** A static PWA with no application server. The optional companion is a separate Docker Compose stack on the Lenovo, bound to loopback only.

```
Browser (mypdf.gachichio.org, installed PWA)
├── React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui
├── UI thread: viewer canvas, tool panels, undo stack
├── Engine worker: MuPDF.js (WASM), all open, render, edit, redact, save
├── OCR worker: Tesseract.js (WASM), languages lazy-loaded (eng first)
├── OPFS: working copies of open files (never leave the device)
├── IndexedDB: recent-files index, saved signatures
├── localStorage: ui.theme, ui.fontScale, export defaults
└── Service worker (vite-plugin-pwa): precache shell, engine, eng.traineddata

Lenovo (optional companion, docker compose, 127.0.0.1 only)
├── gateway (Caddy): pairing token check, CORS for mypdf.gachichio.org, PNA headers
├── gotenberg: Office/HTML to PDF
├── docling-serve: PDF to Markdown/JSON
└── pyhanko: PAdES signing with a local .p12 (Phase 2, C03)
```

**Dependencies (each names the failure without it).**

| Dependency | Licence | Failure without it |
|---|---|---|
| mupdf (MuPDF.js) | AGPL-3.0 | No rendering, editing, redaction or saving. |
| tesseract.js | Apache-2.0 | No OCR (F09). |
| comlink | Apache-2.0 | Hand-written worker messaging; more code and more bugs. Optional: may be removed at G1 review. |
| vite-plugin-pwa | MIT | No offline use, no install. |
| React, Vite, Tailwind, shadcn/ui, lucide-react | MIT, ISC | House stack (builder §2.1). |

Removed against the research brief: PDF.js, pdf-lib and jsPDF, all superseded by the single engine. That is 3 dependencies deleted.

**Data engine.** None. There is no relational data, so PGlite is not justified (builder §2.3).

**Engine fallback.** Every call goes through a `PdfEngine` TypeScript interface. If the M0 spike fails, an EmbedPDF adapter (MIT, PDFium under Apache-2.0) implements the same interface. It keeps true redaction, annotations and forms. It loses password encryption on save and MuPDF's finer redaction controls, and the spec says so.

**Text editing approach.** No open engine offers native edit-in-place of existing text, so F04 is built on MuPDF primitives. The selected span is removed with a text-only redaction (no black box, images and line art untouched). The replacement is then written at the same baseline in the original embedded font where its subset holds the glyphs, otherwise in a fallback font with the R04 warning.

**Hosting.** Path A, static PWA on Vercel (builder §8.2). The rollback is to redeploy the previous immutable deployment, which takes under 5 minutes. VM footprint: none.

**Build preflight (draft, unticked items block the build).**

```
BUILD PREFLIGHT
Project        : myPDF
Shape          : PWA (+ optional local Docker companion)
Runs on        : browser; companion on Lenovo
Data engine    : none (OPFS + IndexedDB + localStorage)
New deps       : 5 runtime beyond house stack, each justified above
Closed tools   : none
RAM ceiling    : browser tab under 1.5 GB on a 300-page file; companion TBD
Lenovo RAM     : [ ] section 3.2 check before companion build
App slug       : mypdf
VM footprint   : none - browser only
Coexistence    : n/a (no VM)
Isolation      : n/a (no VM)
Mock-up + plan : [x] polished C+B signed off 30-09-2026
designer.md    : READ - preflight printed at polish (Appendix D)
developer.md   : G0 PASS, G1 PASS (Appendix B)
DEPLOY.md      : [ ] drafted at M0, tested at M4
Architect      : Claude Chat - this spec
Commit gate    : [ ] pre-commit installed at scaffold
Frontend gate  : [ ] six stages at M4
Handover packet: [x] committed 76de001 (30-09-2026), bgachichio/myPDF
Builder        : Claude Code - executes the packet, decides nothing
```

## Appendix B: Security and trust (developer)

**G0 Secrets and identity: PASS.** The PWA holds no secrets and no keys, and has no back end. The companion pairing token is generated on first run, shown once, and stored in `~/secrets/mypdf.env` on the Lenovo and in the browser's localStorage. The companion listens on 127.0.0.1 only, so the blast radius is local processes.

**G1 Necessity and design: PASS.**
- **Is it necessary?** Yes. Without it, confidential PDFs go to upload tools or to Acrobat's subscription.
- **Does it have to be done this way?** A simpler alternative, self-hosting Stirling-PDF, lost for two reasons: it needs a server, and it is open-core with a five-user free cap.
- **Does it have to take this long?** 12 weeks at 8 hours a week. The floor is about 6 weeks for the MVP without the companion.
- **Delta-4:** 4 against upload-based tools on privacy. It is 2 on features against Acrobat, which is accepted because privacy is the moat.

**Threats and controls.**

| Threat | Control |
|---|---|
| Malicious PDF exploiting the parser | Engine runs in a worker; JavaScript in PDFs is never executed; open is capped at 250 MB and 5,000 pages; the worker is killed after 60 s without a response. |
| XSS through metadata, annotations or filenames | All PDF-derived strings rendered as text nodes, never HTML; a strict CSP with no `unsafe-eval` beyond `wasm-unsafe-eval`. |
| Supply chain | Versions pinned; lockfile committed; `npm audit` and grype in CI fail on high or critical; no CDN, all assets self-hosted. |
| Silent data egress | CSP `connect-src 'self' http://127.0.0.1:*`; R13 Playwright test in CI. |
| Fake redaction | Redaction applied with content removal, then verified by text extraction (R07). A drawn box is never labelled as redaction. |
| Companion abuse by other local sites | Pairing token required; CORS allows only mypdf.gachichio.org and localhost origins. |

**Rollback.** Rolling back the PWA means promoting the previous Vercel deployment. Rolling back the companion means `docker compose down` and pinning the previous image tags. Both are tested at M4.

## Appendix C: Entropy ledger

- **Removed:** PDF.js, pdf-lib, jsPDF and MinerU, plus any server tier for the core product.
- **Hardened:** a single engine behind an adapter, a CI-enforced zero-egress test, and a verified-redaction test.
- **Saves:** 3 dependencies in the client, all hosting cost beyond Vercel's free tier, and the whole server attack surface.

**Audit stamp: REVIEWED.** Spec completeness gate (product §I.2) is 8 of 10 passing. Items 3 (a recorded pivot-or-persevere decision) and 9 (the [UNVALIDATED] markers in Sections 3 and 4) are open by design until M0 and M3. The spec cannot be Approved until they close.

## Appendix D: Engine re-verification (30-09-2026)

**Question.** Is MuPDF.js the best engine for a browser-only, AGPL-licensed, all-in-one editor whose non-negotiables are true redaction, privacy and fidelity?

**Candidates.**

| Engine | Licence | Strengths | Gaps for myPDF |
|---|---|---|---|
| MuPDF.js 1.28.1 (Artifex) | AGPL-3.0 or commercial | Official bindings from the engine's makers; render, annotate, forms, merge (graft), rearrange, redaction with image, line-art and text controls, encryption and compaction on save, structured text for search | No ready-made UI; 10.4 MB WASM (3.6 MB Brotli) |
| EmbedPDF 2.15 (PDFium) | MIT, PDFium Apache-2.0 | Chrome's renderer; headless React plugins for viewer, 17+ annotation types, forms, search, undo and true redaction; very active | Password encryption on save not documented; coarser redaction controls |
| PDF.js plus pdf-lib | Apache-2.0 and MIT | Mature viewer and a small writer | No true redaction; pdf-lib largely unmaintained since 2021; two engines can disagree about one file |
| Nutrient, Apryse | Commercial | Most complete, including native text editing | Paid per seat or domain; closed; fails the builder selection law |

**Spike, run on 30-09-2026 in Node against a generated test PDF.** The following all passed in 118 ms end to end:
- Search found the customer name, and a redaction annotation was applied with image pixels removed.
- A second file was merged with `graftPage` and pages were reordered.
- A highlight annotation was added.
- The file was saved with compaction, and `qpdf --check` found no errors.
- On re-open, text extraction found no trace of the name on the redacted page.
- A copy saved with AES-256 encryption (R6) opened only with its password.

**Verdict.** MuPDF.js stays. It is the only open engine that does everything on the critical path (true redaction with fine control, encryption, compaction and merge) inside one WASM file from the engine's own makers. AGPL costs myPDF nothing, because myPDF is AGPL by choice. EmbedPDF is the stronger UI kit, and its MIT licence would matter only if myPDF were ever closed; it becomes the fallback engine. Neither engine offers native edit-in-place of existing text, so F04 is custom in either case (Appendix A).

**Design preflight (designer section 0).**

```
DESIGN PREFLIGHT
Surface type     : tool
Primary action   : open a PDF, change it, save it on the device
Density          : comfortable
Token source     : designer.md role tokens from #237352, r-lg 20px cards, pill buttons
Deletions made   : tool grid on home, per-page toolbars, count badges, decorative icons
Defaults wired   : [x] font-size toggle (4 steps)  [x] auto/light/dark  [x] localStorage
```
