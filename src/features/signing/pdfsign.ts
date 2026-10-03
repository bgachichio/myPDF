// SPDX-License-Identifier: AGPL-3.0-or-later
// F19: certificate signatures. The engine writes an empty signature field with a marked, reserved container; this file fills it.
// The result is a PKCS#7 detached signature (SubFilter adbe.pkcs7.detached, SHA-256) that other PDF readers can check. It is not PAdES and carries no timestamp from a time authority.
import * as pkijs from 'pkijs'
import * as asn1js from 'asn1js'
import { nameOf, type Identity } from '@/features/signing/identity'

/** Bytes reserved for the signature container. A single certificate with a 2048-bit key needs about 2 KB; this leaves room for a chain. */
export const RESERVE = 12_288
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

/** PDF date string in UTC, for example D:20261003120000Z. */
export function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

function find(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  for (let i = hay.indexOf(needle[0], from); i !== -1; i = hay.indexOf(needle[0], i + 1)) {
    let ok = true
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break }
    if (ok) return i
  }
  return -1
}
const enc = (s: string) => new TextEncoder().encode(s)
const concat = (a: Uint8Array, b: Uint8Array) => { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out }

/** Detached CMS signature over `content`, as DER. */
export async function signDetached(identity: Identity, content: Uint8Array, when: Date): Promise<Uint8Array> {
  const cert = identity.chain[0]
  const digest = await crypto.subtle.digest('SHA-256', ab(content))
  const signed = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
    signerInfos: [new pkijs.SignerInfo({
      version: 1,
      sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
      signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes: [
        new pkijs.Attribute({ type: '1.2.840.113549.1.9.3', values: [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })] }),
        new pkijs.Attribute({ type: '1.2.840.113549.1.9.5', values: [new asn1js.UTCTime({ valueDate: when })] }),
        new pkijs.Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: digest })] }),
      ] }),
    })],
    certificates: identity.chain,
  })
  await signed.sign(identity.key, 0, 'SHA-256')
  const info = new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) })
  return new Uint8Array(info.toSchema().toBER(false))
}

/**
 * Takes the file from `saveForSigning`, fixes the byte ranges, signs everything outside the reserved container
 * and writes the signature into it. The file's length does not change.
 */
export async function finishSignature(prepared: Uint8Array, identity: Identity, when: Date, reserve = RESERVE): Promise<Uint8Array> {
  const out = prepared.slice()
  const marker = enc('1111111111'); const at = find(out, marker)
  if (at < 0) throw new Error('The signature placeholder was not found')
  const open = out.indexOf(0x5b /* [ */, at - 12), close = out.indexOf(0x5d /* ] */, at)
  const hexRun = enc('ab'.repeat(8)) // the reserved container is filled with 0xAB, so its hex starts with ab
  let start = find(out, hexRun, close)
  if (start < 0) start = find(out, enc('AB'.repeat(8)), close)
  if (start < 1 || out[start - 1] !== 0x3c /* < */) throw new Error('The signature container was not found')
  const hexStart = start - 1, hexEnd = hexStart + 2 * reserve + 2
  if (out[hexEnd - 1] !== 0x3e /* > */) throw new Error('The signature container has an unexpected size')
  const ranges = [0, hexStart, hexEnd, out.length - hexEnd]
  const text = `[${ranges.join(' ')}`
  const slot = close - open + 1
  if (text.length + 1 > slot) throw new Error('The byte range does not fit its placeholder')
  out.set(enc((text + ']').padEnd(slot, ' ')), open)
  const content = concat(out.subarray(0, hexStart), out.subarray(hexEnd))
  const der = await signDetached(identity, content, when)
  if (der.length > reserve) throw new Error('The signature is larger than the space reserved for it')
  const hex = [...der].map((b) => b.toString(16).padStart(2, '0')).join('').padEnd(2 * reserve, '0')
  out.set(enc(hex), hexStart + 1)
  return out
}

export interface SignatureReport {
  signer: string
  issuer: string
  signedAt: Date | null
  reason: string
  location: string
  /** valid: the signed bytes are unchanged. changed: they are not. unverified: the check could not run. */
  integrity: 'valid' | 'changed' | 'unverified'
  /** False when more was saved after this signature. */
  coversWholeFile: boolean
  selfSigned: boolean
  expired: boolean
  note: string
}

const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s }
const pdfString = (dict: string, key: string) => {
  const m = new RegExp(`/${key}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`).exec(dict)
  return m ? m[1].replace(/\\([()\\])/g, '$1') : ''
}

/** Reads every signature in a file and says whether its signed bytes still match. It does not judge who the signer is. */
export async function checkSignatures(bytes: Uint8Array): Promise<SignatureReport[]> {
  const reports: SignatureReport[] = []
  const key = enc('/ByteRange')
  for (let at = find(bytes, key); at !== -1; at = find(bytes, key, at + key.length)) {
    const close = bytes.indexOf(0x5d, at)
    if (close < 0 || close - at > 120) continue
    const nums = latin1(bytes.subarray(at + key.length, close)).replace('[', '').trim().split(/\s+/).map(Number)
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n) || n < 0)) continue
    const [a, b, c, d] = nums
    const report: SignatureReport = { signer: 'Unknown', issuer: '', signedAt: null, reason: '', location: '', integrity: 'unverified', coversWholeFile: false, selfSigned: false, expired: false, note: '' }
    const from = bytes.lastIndexOf(0x6f /* o of "obj" */, at) // coarse; the window below is what is parsed
    const win = latin1(bytes.subarray(Math.max(0, Math.min(from, at) - 1500), Math.min(bytes.length, at + 1500)))
    report.reason = pdfString(win, 'Reason'); report.location = pdfString(win, 'Location')
    report.coversWholeFile = c + d === bytes.length || latin1(bytes.subarray(c + d)).trim() === ''
    try {
      if (a !== 0 || b > c || c + d > bytes.length) throw new Error('The byte range is not valid')
      const gap = bytes.subarray(b, c)
      if (gap[0] !== 0x3c || gap[gap.length - 1] !== 0x3e) throw new Error('No signature value')
      const hex = latin1(gap.subarray(1, gap.length - 1)).replace(/\s+/g, '')
      const der = new Uint8Array(hex.length / 2); for (let i = 0; i < der.length; i++) der[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
      if (!der.some((v) => v)) { report.note = 'This signature field has not been signed.'; reports.push(report); continue }
      const parsed = asn1js.fromBER(ab(der))
      if (parsed.offset === -1) throw new Error('The signature cannot be read')
      const info = new pkijs.ContentInfo({ schema: parsed.result })
      const signed = new pkijs.SignedData({ schema: info.content })
      const signerCert = signed.certificates?.find((x): x is pkijs.Certificate => x instanceof pkijs.Certificate && x.serialNumber.isEqual(signed.signerInfos[0].sid instanceof pkijs.IssuerAndSerialNumber ? signed.signerInfos[0].sid.serialNumber : x.serialNumber)) as pkijs.Certificate | undefined
      if (signerCert) {
        report.signer = nameOf(signerCert.subject); report.issuer = nameOf(signerCert.issuer)
        report.selfSigned = nameOf(signerCert.subject) === nameOf(signerCert.issuer) && signerCert.subject.isEqual(signerCert.issuer)
      }
      const time = signed.signerInfos[0].signedAttrs?.attributes.find((x) => x.type === '1.2.840.113549.1.9.5')?.values[0] as asn1js.UTCTime | asn1js.GeneralizedTime | undefined
      report.signedAt = time?.toDate() ?? null
      if (signerCert && report.signedAt) report.expired = report.signedAt < signerCert.notBefore.value || report.signedAt > signerCert.notAfter.value
      const content = concat(bytes.subarray(a, a + b), bytes.subarray(c, c + d))
      const ok = await signed.verify({ signer: 0, data: ab(content), checkChain: false, extendedMode: true }).then((r) => Boolean((r as { signatureVerified?: boolean }).signatureVerified)).catch(() => false)
      report.integrity = ok ? 'valid' : 'changed'
      report.note = ok
        ? (report.coversWholeFile ? 'The signed content is unchanged.' : 'The signed content is unchanged, but more was saved after this signature.')
        : 'The file was changed after it was signed, or the signature is damaged.'
    } catch (e) {
      report.note = e instanceof Error ? e.message : 'The signature could not be checked.'
    }
    reports.push(report)
  }
  return reports
}
