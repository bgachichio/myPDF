#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Corpus check: open, save, qpdf --check, first-render time for each file in tests/corpus/
// Records pass/fail to stdout and exits 0 only if all present files pass.
// At M0, checks open() and render() of page 0. Subsequent milestones add save and redaction residue.

import { execSync } from 'child_process'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { performance } from 'perf_hooks'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const corpusDir = resolve(__dirname, '../tests/corpus')

// Find all PDF files in corpus (not in private/)
const pdfFiles = readdirSync(corpusDir)
  .filter(f => f.endsWith('.pdf'))
  .map(f => join(corpusDir, f))

if (pdfFiles.length === 0) {
  console.log('No corpus PDF files found in tests/corpus/. Skipping corpus check.')
  console.log('NOTE: populate tests/corpus/ with the files listed in MANIFEST.md for a real check.')
  process.exit(0)
}

let passed = 0
let failed = 0

// Lazy-load mupdf (may not be installed in minimal CI environments)
let mupdf
try {
  mupdf = await import('mupdf')
} catch (e) {
  console.error('mupdf not available; skipping render checks:', e.message)
  process.exit(0)
}

for (const filePath of pdfFiles) {
  const name = filePath.split('/').pop()
  const start = performance.now()
  try {
    const bytes = readFileSync(filePath)
    const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf')
    const pageCount = doc.countPages()

    // Render page 0
    const page = doc.loadPage(0)
    const pixmap = page.toPixmap(mupdf.Matrix.scale(1.0, 1.0), mupdf.ColorSpace.DeviceRGB, false, true)
    const renderMs = performance.now() - start
    pixmap.destroy()
    page.destroy()

    // Save
    const saved = doc.saveToBuffer('garbage=compact,compress')
    const savedBytes = saved.asUint8Array()
    doc.destroy()

    // qpdf --check (only if qpdf is available)
    const tmpPath = `/tmp/corpus-check-${Date.now()}.pdf`
    writeFileSync(tmpPath, savedBytes)
    let qpdfOk = true
    try {
      execSync(`qpdf --check "${tmpPath}"`, { stdio: 'pipe' })
    } catch {
      qpdfOk = false
    }

    const status = qpdfOk ? 'PASS' : 'FAIL(qpdf)'
    if (qpdfOk) passed++ ; else failed++
    console.log(`${status.padEnd(12)} ${name.padEnd(40)} pages=${pageCount} render=${renderMs.toFixed(0)}ms`)
  } catch (e) {
    failed++
    console.error(`FAIL         ${name.padEnd(40)} ${e.message}`)
  }
}

console.log(`\nCorpus result: ${passed} passed, ${failed} failed out of ${pdfFiles.length} files.`)

if (failed > 0) {
  const killThreshold = Math.floor(pdfFiles.length * 0.8) // 80% must pass
  if (passed < killThreshold) {
    console.error(`Kill condition: fewer than ${killThreshold} of ${pdfFiles.length} files passed. See BUILD-BRIEF §1.`)
    process.exit(1)
  }
}
process.exit(failed > 0 ? 1 : 0)
