#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// myPDF companion gateway (C01, R14). Converts Office files to PDF on your own machine. Listens on 127.0.0.1 only.
// Engine: Gotenberg when GOTENBERG_URL is set (docker compose), otherwise LibreOffice (`soffice`) installed on this machine.
// Security: a pairing token is required for every route except CORS preflight; only myPDF's own origins may call it from a browser.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'
const MAX_BYTES = Number(process.env.MAX_BYTES ?? 100 * 1024 * 1024)
const GOTENBERG_URL = process.env.GOTENBERG_URL?.replace(/\/$/, '')
const SECRETS = process.env.MYPDF_SECRETS_FILE ?? join(homedir(), 'secrets', 'mypdf.env')
const ALLOWED = [/^https:\/\/mypdf\.gachichio\.org$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/]
const OFFICE = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.odt', '.ods', '.odp', '.rtf', '.txt', '.html', '.htm', '.csv'])

/** The pairing token comes from the environment, then the secrets file; on first run it is generated, stored mode 600 and shown once. */
function loadToken() {
  if (process.env.MYPDF_COMPANION_TOKEN) return { token: process.env.MYPDF_COMPANION_TOKEN, fresh: false }
  if (existsSync(SECRETS)) {
    const m = /^MYPDF_COMPANION_TOKEN=(.+)$/m.exec(readFileSync(SECRETS, 'utf8'))
    if (m) return { token: m[1].trim(), fresh: false }
  }
  const token = randomBytes(24).toString('base64url')
  mkdirSync(join(SECRETS, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(SECRETS, `MYPDF_COMPANION_TOKEN=${token}\n`, { mode: 0o600 }); chmodSync(SECRETS, 0o600)
  return { token, fresh: true }
}
const { token: TOKEN, fresh } = loadToken()

function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED.some((r) => r.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Filename')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Private-Network', 'true') // Chrome's Private Network Access preflight
    res.setHeader('Access-Control-Expose-Headers', 'X-Engine')
    res.setHeader('Access-Control-Max-Age', '600')
    return true
  }
  return !origin // no Origin header: not a browser cross-site call (curl, the same machine)
}
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)) }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0
    req.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject)
  })
}

// One conversion at a time: LibreOffice is memory hungry and the machine is somebody's laptop.
let queue = Promise.resolve()
const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => undefined); return p }

function viaSoffice(bytes, ext) {
  return serial(() => new Promise((resolve, reject) => {
    const dir = mkdtempSync(join(tmpdir(), 'mypdf-companion-'))
    const input = join(dir, `input${ext}`)
    writeFileSync(input, bytes)
    const child = spawn(process.env.SOFFICE ?? 'soffice', ['--headless', '--norestore', `-env:UserInstallation=file://${join(dir, 'profile')}`, '--convert-to', 'pdf', '--outdir', dir, input], { stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('conversion timed out')) }, 120_000)
    child.on('error', (e) => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); reject(e) })
    child.on('close', () => {
      clearTimeout(timer)
      try { resolve(readFileSync(join(dir, 'input.pdf'))) } catch { reject(new Error('LibreOffice produced no PDF')) } finally { rmSync(dir, { recursive: true, force: true }) }
    })
  }))
}
async function viaGotenberg(bytes, name) {
  const form = new FormData(); form.append('files', new Blob([bytes]), name)
  const r = await fetch(`${GOTENBERG_URL}/forms/libreoffice/convert`, { method: 'POST', body: form })
  if (!r.ok) throw new Error(`Gotenberg returned ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!cors(req, res)) return send(res, 403, { error: 'origin not allowed' })
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const auth = req.headers.authorization ?? ''
  if (auth !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'pairing token missing or wrong' })
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, name: 'myPDF companion', engine: GOTENBERG_URL ? 'gotenberg' : 'libreoffice', formats: [...OFFICE] })
  if (req.method === 'POST' && url.pathname === '/convert') {
    const name = basename(decodeURIComponent(req.headers['x-filename'] ?? 'file.docx'))
    const ext = extname(name).toLowerCase()
    if (!OFFICE.has(ext)) return send(res, 415, { error: `unsupported type ${ext || '(none)'}` })
    try {
      const bytes = await readBody(req)
      if (!bytes.length) return send(res, 400, { error: 'empty file' })
      const pdf = GOTENBERG_URL ? await viaGotenberg(bytes, name) : await viaSoffice(bytes, ext)
      res.setHeader('X-Engine', GOTENBERG_URL ? 'gotenberg' : 'libreoffice')
      return send(res, 200, pdf, 'application/pdf')
    } catch (e) { return send(res, e.code === 413 ? 413 : 500, { error: String(e.message ?? e) }) }
  }
  send(res, 404, { error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`myPDF companion listening on http://${HOST}:${PORT} (${GOTENBERG_URL ? `Gotenberg at ${GOTENBERG_URL}` : 'local LibreOffice'})`)
  if (fresh) console.log(`\nPairing token (shown once, stored in ${SECRETS}):\n  ${TOKEN}\n`)
  else console.log('Pairing token: stored in the environment or ' + SECRETS)
})
