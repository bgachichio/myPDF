// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare const __WASM_BYTES__: number
declare module '*?url' { const url: string; export default url }

declare module 'jsdom' { export class JSDOM { constructor(html?: string); window: { DOMParser: new () => { parseFromString(s: string, t: string): Document } & { prototype: { parseFromString(s: string, t: string): Document } } } } }
