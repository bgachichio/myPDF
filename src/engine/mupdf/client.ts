// SPDX-License-Identifier: AGPL-3.0-or-later
import * as Comlink from 'comlink'
import type { PdfEngine } from '@/engine/PdfEngine'

let _client: Comlink.Remote<PdfEngine> | null = null
let _worker: Worker | null = null

export function getEngine(): Comlink.Remote<PdfEngine> {
  if (!_client) {
    _worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    _client = Comlink.wrap<PdfEngine>(_worker)
  }
  return _client
}

export function terminateEngine(): void {
  _client = null
  _worker?.terminate()
  _worker = null
}
