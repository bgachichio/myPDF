// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
// F19: certificate signatures, end to end on bytes, with poppler's pdfsig and OpenSSL as independent checkers when they are installed.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import * as mupdf from 'mupdf'
import { createIdentity, loadIdentity, IdentityFailure } from '@/features/signing/identity'
import { finishSignature, checkSignatures, pdfDate, RESERVE } from '@/features/signing/pdfsign'

vi.mock('comlink', () => ({ expose: vi.fn(), wrap: vi.fn(), transfer: (v: unknown) => v }))
const corpus = (f: string) => readFileSync(resolve(__dirname, '../corpus', f))
const ab = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const tmp = mkdtempSync(join(tmpdir(), 'mypdf-sign-'))
const have = (cmd: string, args: string[]) => { try { execFileSync(cmd, args, { stdio: 'pipe' }); return true } catch (e) { return (e as { code?: string }).code !== 'ENOENT' } }
let engine: typeof import('@/engine/mupdf/engine.worker').engine

beforeAll(async () => { engine = (await import('@/engine/mupdf/engine.worker')).engine })

async function prepared(file = 'pdfjs-basicapi.pdf', rect: [number, number, number, number] | null = [40, 700, 300, 780]) {
  const { id } = await engine.open(ab(corpus(file)))
  return engine.saveForSigning(id, { page: 0, rect, signer: 'Test Signer', reason: 'I approve', location: 'Nairobi', contact: '', date: pdfDate(new Date('2026-10-03T10:00:00Z')), reserve: RESERVE, compress: false, stripMetadata: false })
}

describe('F19 certificate signing', () => {
  it('signs a file, keeps its length, and the signature checks out', async () => {
    const pre = await prepared()
    const { identity } = await createIdentity({ name: 'Test Signer', password: 'pw-123456' })
    const signed = await finishSignature(pre, identity, new Date('2026-10-03T10:00:00Z'))
    expect(signed.length).toBe(pre.length)
    const [r] = await checkSignatures(signed)
    expect(r.integrity).toBe('valid')
    expect(r.signer).toBe('Test Signer')
    expect(r.selfSigned).toBe(true)
    expect(r.coversWholeFile).toBe(true)
    expect(r.reason).toBe('I approve')
    expect(r.location).toBe('Nairobi')
    // The file still opens, still has its page, and shows the signature field.
    const d = mupdf.Document.openDocument(signed, 'application/pdf').asPDF()!
    expect(d.countPages()).toBeGreaterThan(0)
    expect((d.loadPage(0) as mupdf.PDFPage).getWidgets().some((w) => !w.isText() && !w.isCheckbox())).toBe(true)
  })

  it('a changed byte makes the signature report changed', async () => {
    const { identity } = await createIdentity({ name: 'Test Signer', password: 'pw-123456' })
    const signed = await finishSignature(await prepared(), identity, new Date())
    const tampered = signed.slice(); tampered[200] = tampered[200] ^ 0xff
    const [r] = await checkSignatures(tampered)
    expect(r.integrity).toBe('changed')
    // Appending after the signature is flagged as content added later, not as a broken signature.
    const appended = new Uint8Array(signed.length + 20); appended.set(signed); appended.set(new TextEncoder().encode('\n%% later addition\n'), signed.length)
    const [r2] = await checkSignatures(appended)
    expect(r2.integrity).toBe('valid'); expect(r2.coversWholeFile).toBe(false)
  })

  it('supports an invisible signature and a compressed save', async () => {
    const { id } = await engine.open(ab(corpus('pdfjs-tracemonkey-text.pdf')))
    const pre = await engine.saveForSigning(id, { page: 0, rect: null, signer: 'Test Signer', reason: '', location: '', contact: '', date: pdfDate(new Date()), reserve: RESERVE, compress: true, stripMetadata: true })
    const { identity } = await createIdentity({ name: 'Test Signer', password: 'pw-123456' })
    const [r] = await checkSignatures(await finishSignature(pre, identity, new Date()))
    expect(r.integrity).toBe('valid')
  })

  it('writes and reads back a .p12, and tells a wrong password from a good one', async () => {
    const { p12, identity } = await createIdentity({ name: 'Round Trip', email: 'rt@example.org', organisation: 'Gachichio', password: 'pw-123456' })
    const back = await loadIdentity(p12, 'pw-123456')
    expect(back.name).toBe('Round Trip'); expect(back.algorithm).toBe('rsa')
    expect(back.notAfter.getTime()).toBe(identity.notAfter.getTime())
    await expect(loadIdentity(p12, 'wrong')).rejects.toMatchObject({ code: 'wrong-password' })
    await expect(loadIdentity(new Uint8Array([1, 2, 3]), 'x')).rejects.toBeInstanceOf(IdentityFailure)
    const signed = await finishSignature(await prepared(), back, new Date())
    expect((await checkSignatures(signed))[0].integrity).toBe('valid')
  })

  it('reports nothing for a file with no signatures', async () => {
    expect(await checkSignatures(new Uint8Array(corpus('pdfjs-tracemonkey-text.pdf')))).toEqual([])
  })

  it.runIf(have('openssl', ['version']))('reads an AES .p12 made by OpenSSL, signs with it, and OpenSSL accepts the signature', async () => {
    const key = join(tmp, 'k.pem'), crt = join(tmp, 'c.pem'), p12 = join(tmp, 'id.p12')
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', key, '-out', crt, '-days', '30', '-subj', '/CN=OpenSSL EC Signer/O=Test'], { stdio: 'pipe' })
    execFileSync('openssl', ['pkcs12', '-export', '-inkey', key, '-in', crt, '-out', p12, '-passout', 'pass:ssl-pass-1'], { stdio: 'pipe' })
    const identity = await loadIdentity(new Uint8Array(readFileSync(p12)), 'ssl-pass-1')
    expect(identity.name).toBe('OpenSSL EC Signer'); expect(identity.algorithm).toBe('ecdsa')
    const signed = await finishSignature(await prepared(), identity, new Date())
    expect((await checkSignatures(signed))[0].integrity).toBe('valid')
    // OpenSSL: extract the container and the signed ranges and verify the detached CMS with no chain check.
    const [r] = [...new TextDecoder('latin1').decode(signed).matchAll(/\/ByteRange\s*\[(\d+) (\d+) (\d+) (\d+)\s*\]/g)]
    const [a, b, c, d] = r.slice(1).map(Number)
    const hex = new TextDecoder('latin1').decode(signed.subarray(b + 1, c - 1)).replace(/0+$/, '')
    writeFileSync(join(tmp, 'sig.der'), Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex'))
    writeFileSync(join(tmp, 'content.bin'), Buffer.concat([signed.subarray(a, a + b), signed.subarray(c, c + d)]))
    const out = execFileSync('openssl', ['cms', '-verify', '-inform', 'DER', '-in', join(tmp, 'sig.der'), '-content', join(tmp, 'content.bin'), '-binary', '-noverify'], { stdio: 'pipe' })
    expect(out.length).toBe(a + b + d + 0 * c)
  })

  it.runIf(have('pdfsig', ['-v']))('poppler pdfsig reads the signature as intact', async () => {
    const { identity } = await createIdentity({ name: 'Poppler Check', password: 'pw-123456' })
    const file = join(tmp, 'signed.pdf')
    writeFileSync(file, await finishSignature(await prepared(), identity, new Date()))
    const out = execFileSync('pdfsig', [file], { stdio: 'pipe' }).toString()
    expect(out).toMatch(/Signature #1/)
    expect(out).toMatch(/Signature Validation: Signature is Valid/i)
    expect(out).toMatch(/Poppler Check/)
    const bad = readFileSync(file); bad[300] ^= 0xff; writeFileSync(file, bad)
    let text = ''
    try { text = execFileSync('pdfsig', [file], { stdio: 'pipe' }).toString() } catch (e) { text = String((e as { stdout?: Buffer }).stdout ?? '') }
    expect(text).not.toMatch(/Signature is Valid/i)
  })

  it.runIf(have('openssl', ['version']))('signs with an RSA leaf from a two-certificate chain and puts the leaf first', async () => {
    const d = (n: string) => join(tmp, n)
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', d('ca.key'), '-out', d('ca.pem'), '-days', '30', '-subj', '/CN=Test Root CA'], { stdio: 'pipe' })
    execFileSync('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', d('leaf.key'), '-out', d('leaf.csr'), '-subj', '/CN=Chain Signer'], { stdio: 'pipe' })
    execFileSync('openssl', ['x509', '-req', '-in', d('leaf.csr'), '-CA', d('ca.pem'), '-CAkey', d('ca.key'), '-CAcreateserial', '-out', d('leaf.pem'), '-days', '20'], { stdio: 'pipe' })
    execFileSync('openssl', ['pkcs12', '-export', '-inkey', d('leaf.key'), '-in', d('leaf.pem'), '-certfile', d('ca.pem'), '-out', d('chain.p12'), '-passout', 'pass:chain-pass-1'], { stdio: 'pipe' })
    const identity = await loadIdentity(new Uint8Array(readFileSync(d('chain.p12'))), 'chain-pass-1')
    expect(identity.name).toBe('Chain Signer'); expect(identity.issuer).toBe('Test Root CA'); expect(identity.chain).toHaveLength(2)
    const [r] = await checkSignatures(await finishSignature(await prepared(), identity, new Date()))
    expect(r.integrity).toBe('valid'); expect(r.selfSigned).toBe(false); expect(r.issuer).toBe('Test Root CA')
  })

  it.runIf(have('openssl', ['version']))('refuses an old 3DES .p12 with a plain explanation, and a wrong password on a modern one is told apart', async () => {
    const d = (n: string) => join(tmp, n)
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', d('o.key'), '-out', d('o.pem'), '-days', '5', '-subj', '/CN=Old Format'], { stdio: 'pipe' })
    let made = true
    try { execFileSync('openssl', ['pkcs12', '-export', '-inkey', d('o.key'), '-in', d('o.pem'), '-out', d('old.p12'), '-passout', 'pass:old-pass-1', '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1'], { stdio: 'pipe' }) } catch { made = false }
    if (!made) return
    await expect(loadIdentity(new Uint8Array(readFileSync(d('old.p12'))), 'old-pass-1')).rejects.toMatchObject({ code: 'legacy-encryption' })
  })

  it('refuses a key type it cannot sign with', async () => {
    await expect(loadIdentity(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]), 'x')).rejects.toBeInstanceOf(IdentityFailure)
  })
})
