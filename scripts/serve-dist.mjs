#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Serves dist/ with the exact headers from vercel.json, so e2e tests run under the production CSP.
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { extname, join, resolve } from 'path'

const root = resolve(import.meta.dirname, '../dist')
const config = JSON.parse(readFileSync(resolve(import.meta.dirname, '../vercel.json'), 'utf8'))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.gz': 'application/gzip' }

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = join(root, path === '/' ? 'index.html' : path)
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }
  for (const rule of config.headers) {
    if (rule.source === '/(.*)' || (rule.source.endsWith('\\.wasm') && file.endsWith('.wasm'))) {
      for (const h of rule.headers) headers[h.key] = h.value
    }
  }
  res.writeHead(200, headers).end(readFileSync(file))
}).listen(4173, '127.0.0.1')
