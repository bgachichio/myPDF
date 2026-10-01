// SPDX-License-Identifier: AGPL-3.0-or-later
// First-run engine download with a percentage (PRODUCT-SPEC quality-bar "Loading"). The wasm is fetched once on the main thread so the
// progress can be shown; the worker then loads it from the browser cache. Installed copies have it precached and skip this in a blink.
// A relative path, because mupdf's package exports do not expose the wasm file. Vite emits the same hashed asset the worker uses.
import wasmUrl from '../../../node_modules/mupdf/dist/mupdf-wasm.wasm?url'

declare const __WASM_BYTES__: number
let warmed: Promise<void> | null = null

export function warmEngine(onProgress: (percent: number) => void): Promise<void> {
  warmed ??= (async () => {
    try {
      const r = await fetch(wasmUrl)
      if (!r.ok || !r.body) return
      const reader = r.body.getReader(); let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        got += value.length
        onProgress(Math.min(99, Math.round((got / __WASM_BYTES__) * 100)))
      }
    } catch { /* the worker will fetch it itself; progress is a nicety */ }
  })()
  return warmed
}
