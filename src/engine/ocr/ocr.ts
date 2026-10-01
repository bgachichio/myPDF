// SPDX-License-Identifier: AGPL-3.0-or-later
// OCR (F09, R09). tesseract.js runs in its own worker; worker, core and eng.traineddata are self-hosted under /tesseract/ (nothing leaves the device).
import { createWorker, type Worker } from 'tesseract.js'
import type { OcrWord, Rect } from '@/engine/PdfEngine'

let worker: Promise<Worker> | null = null
let progressCb: ((p: number) => void) | undefined

function getWorker() {
  worker ??= createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract',
    langPath: '/tesseract',
    gzip: true,
    workerBlobURL: false,
    logger: (m) => { if (m.status === 'recognizing text') progressCb?.(m.progress) },
  })
  return worker
}

interface Bbox { x0: number; y0: number; x1: number; y1: number }
interface OcrBlocks { blocks?: { paragraphs: { lines: { words: { text: string; bbox: Bbox }[] }[] }[] }[] | null }

/** Recognise one rendered page. `scale` is pixels per point, so word boxes return in page space. */
export async function recognise(bitmap: ImageBitmap, scale: number, onProgress?: (p: number) => void): Promise<OcrWord[]> {
  progressCb = onProgress
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width; canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const w = await getWorker()
  const { data } = await w.recognize(canvas, {}, { blocks: true })
  const words: OcrWord[] = []
  for (const b of (data as unknown as OcrBlocks).blocks ?? [])
    for (const p of b.paragraphs) for (const l of p.lines) for (const wd of l.words) {
      const rect: Rect = [wd.bbox.x0 / scale, wd.bbox.y0 / scale, wd.bbox.x1 / scale, wd.bbox.y1 / scale]
      if (wd.text.trim()) words.push({ text: wd.text, rect })
    }
  return words
}

export async function stopOcr() {
  if (!worker) return
  const w = await worker; worker = null
  await w.terminate()
}
