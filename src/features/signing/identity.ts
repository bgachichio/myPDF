// SPDX-License-Identifier: AGPL-3.0-or-later
// F19: signing identities. A PKCS#12 file (.p12 or .pfx) is read on this device and the private key never leaves it.
// Only modern encryption is supported (AES, via WebCrypto). Files protected by the old 3DES or RC2 schemes are refused with a clear message.
import * as pkijs from 'pkijs'
import * as asn1js from 'asn1js'

export interface Identity {
  key: CryptoKey
  /** The signer's certificate first, then any others in the file. */
  chain: pkijs.Certificate[]
  name: string
  issuer: string
  notAfter: Date
  algorithm: 'rsa' | 'ecdsa'
}
export type IdentityError = 'wrong-password' | 'legacy-encryption' | 'no-key' | 'unreadable'
export class IdentityFailure extends Error { constructor(public code: IdentityError, message: string) { super(message) } }

const OID = { cn: '2.5.4.3', org: '2.5.4.10', email: '1.2.840.113549.1.9.1', keyBag: '1.2.840.113549.1.12.10.1.1', shrouded: '1.2.840.113549.1.12.10.1.2', certBag: '1.2.840.113549.1.12.10.1.3', rsa: '1.2.840.113549.1.1.1', ec: '1.2.840.10045.2.1', p256: '1.2.840.10045.3.1.7', p384: '1.3.132.0.34' }
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const pwBytes = (p: string) => ab(new TextEncoder().encode(p))

/** Common name of a certificate subject or issuer, or the whole name when there is none. */
export function nameOf(rdn: pkijs.RelativeDistinguishedNames): string {
  const get = (t: string) => rdn.typesAndValues.find((x) => x.type === t)?.value.valueBlock.value as string | undefined
  return get(OID.cn) || get(OID.org) || rdn.typesAndValues.map((x) => String(x.value.valueBlock.value)).join(', ') || 'Unknown'
}

const rdn = (pairs: [string, string][]) => new pkijs.RelativeDistinguishedNames({
  typesAndValues: pairs.map(([type, value]) => new pkijs.AttributeTypeAndValue({ type, value: type === OID.email ? new asn1js.IA5String({ value }) : new asn1js.Utf8String({ value }) })),
})

async function jwkOfCert(c: pkijs.Certificate): Promise<JsonWebKey | null> {
  try {
    const pub = await c.getPublicKey()
    return await crypto.subtle.exportKey('jwk', pub)
  } catch { return null }
}

async function importKey(info: pkijs.PrivateKeyInfo): Promise<{ key: CryptoKey; jwk: JsonWebKey; algorithm: Identity['algorithm'] }> {
  const der = ab(new Uint8Array(info.toSchema().toBER(false)))
  const alg = info.privateKeyAlgorithm.algorithmId
  const tries: [Identity['algorithm'], RsaHashedImportParams | EcKeyImportParams][] = alg === OID.rsa
    ? [['rsa', { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }]]
    : alg === OID.ec ? [['ecdsa', { name: 'ECDSA', namedCurve: 'P-256' }], ['ecdsa', { name: 'ECDSA', namedCurve: 'P-384' }]] : []
  for (const [algorithm, params] of tries) {
    try {
      const key = await crypto.subtle.importKey('pkcs8', der, params, true, ['sign'])
      return { key, jwk: await crypto.subtle.exportKey('jwk', key), algorithm }
    } catch { /* try the next curve */ }
  }
  throw new IdentityFailure('no-key', 'This file holds a key type myPDF cannot sign with. Use an RSA or P-256 or P-384 key.')
}

/** Reads a .p12 or .pfx. Throws IdentityFailure with a code the screen turns into a plain sentence. */
export async function loadIdentity(bytes: Uint8Array, password: string): Promise<Identity> {
  let pfx: pkijs.PFX
  try {
    const parsed = asn1js.fromBER(ab(bytes))
    if (parsed.offset === -1) throw new Error('asn1')
    pfx = new pkijs.PFX({ schema: parsed.result })
  } catch { throw new IdentityFailure('unreadable', 'This does not look like a .p12 or .pfx file.') }
  const pw = pwBytes(password)
  const certs: pkijs.Certificate[] = []
  let keyInfo: pkijs.PrivateKeyInfo | null = null
  try {
    await pfx.parseInternalValues({ password: pw, checkIntegrity: true })
    const safe = pfx.parsedValue!.authenticatedSafe!
    await safe.parseInternalValues({ safeContents: safe.safeContents.map(() => ({ password: pw })) })
    for (const sc of safe.parsedValue!.safeContents) for (const bag of sc.value.safeBags) {
      if (bag.bagId === OID.certBag) { const c = (bag.bagValue as pkijs.CertBag).parsedValue; if (c instanceof pkijs.Certificate) certs.push(c) }
      else if (bag.bagId === OID.shrouded) { await (bag.bagValue as unknown as { parseInternalValues(p: { password: ArrayBuffer }): Promise<void> }).parseInternalValues({ password: pw }); keyInfo = (bag.bagValue as pkijs.PKCS8ShroudedKeyBag).parsedValue ?? null }
      else if (bag.bagId === OID.keyBag) keyInfo = bag.bagValue as pkijs.PrivateKeyInfo
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // pkijs reports a failed integrity check or decryption the same way for a wrong password and for an old cipher; tell them apart by the algorithm in the file.
    const legacy = /1\.2\.840\.113549\.1\.12\.1\.(3|4|5|6)\b/.test(pfxText(bytes)) || /not supported|unsupported|Unknown/i.test(msg)
    throw legacy
      ? new IdentityFailure('legacy-encryption', 'This file uses an older encryption scheme (3DES or RC2). Export it again with AES encryption, or create a new signing ID in myPDF.')
      : new IdentityFailure('wrong-password', 'The password did not open this file.')
  }
  if (!keyInfo || !certs.length) throw new IdentityFailure('no-key', 'This file needs both a private key and a certificate.')
  const { key, jwk, algorithm } = await importKey(keyInfo)
  // The signer's certificate is the one whose public key matches the private key; the rest ride along as the chain.
  let signer = 0
  for (let i = 0; i < certs.length; i++) {
    const j = await jwkOfCert(certs[i])
    if (j && (algorithm === 'rsa' ? j.n === jwk.n && j.e === jwk.e : j.x === jwk.x && j.y === jwk.y)) { signer = i; break }
  }
  const chain = [certs[signer], ...certs.filter((_, i) => i !== signer)]
  return { key, chain, name: nameOf(chain[0].subject), issuer: nameOf(chain[0].issuer), notAfter: chain[0].notAfter.value, algorithm }
}
function pfxText(b: Uint8Array): string {
  // Only the object identifiers matter here; scanning is cheaper than a second parse. 3DES and RC2 PKCS#12 ciphers are 1.2.840.113549.1.12.1.3 to .6, encoded as 2A 86 48 86 F7 0D 01 0C 01 xx.
  const hits: string[] = []
  for (let i = 0; i + 10 < b.length; i++) {
    if (b[i] === 0x2a && b[i + 1] === 0x86 && b[i + 2] === 0x48 && b[i + 3] === 0x86 && b[i + 4] === 0xf7 && b[i + 5] === 0x0d && b[i + 6] === 0x01 && b[i + 7] === 0x0c && b[i + 8] === 0x01) hits.push(`1.2.840.113549.1.12.1.${b[i + 9]}`)
  }
  return hits.join(' ')
}

/** Makes a new self-signed identity (RSA 2048, SHA-256) and the .p12 that holds it, protected by `password`. Nothing is stored. */
export async function createIdentity(o: { name: string; email?: string; organisation?: string; years?: number; password: string }): Promise<{ p12: Uint8Array; identity: Identity }> {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const subject: [string, string][] = [[OID.cn, o.name]]
  if (o.organisation) subject.push([OID.org, o.organisation])
  if (o.email) subject.push([OID.email, o.email])
  const cert = new pkijs.Certificate()
  cert.version = 2
  const serial = crypto.getRandomValues(new Uint8Array(16)); serial[0] &= 0x7f
  cert.serialNumber = new asn1js.Integer({ valueHex: ab(serial) })
  cert.subject = rdn(subject); cert.issuer = rdn(subject)
  cert.notBefore.value = new Date(Math.floor((Date.now() - 3_600_000) / 1000) * 1000)
  cert.notAfter.value = new Date(Math.floor((Date.now() + (o.years ?? 5) * 365 * 86_400_000) / 1000) * 1000)
  cert.extensions = [
    new pkijs.Extension({ extnID: '2.5.29.19', critical: true, extnValue: new pkijs.BasicConstraints({ cA: false }).toSchema().toBER(false) }),
    // digitalSignature and nonRepudiation
    new pkijs.Extension({ extnID: '2.5.29.15', critical: true, extnValue: new asn1js.BitString({ valueHex: new Uint8Array([0xc0]).buffer, unusedBits: 6 }).toBER(false) }),
  ]
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey)
  await cert.sign(keys.privateKey, 'SHA-256')
  const pkcs8 = new pkijs.PrivateKeyInfo({ schema: asn1js.fromBER(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).result })
  const pw = pwBytes(o.password)
  const pfx = new pkijs.PFX({ parsedValue: { integrityMode: 0, authenticatedSafe: new pkijs.AuthenticatedSafe({ parsedValue: { safeContents: [
    { privacyMode: 0, value: new pkijs.SafeContents({ safeBags: [new pkijs.SafeBag({ bagId: OID.shrouded, bagValue: new pkijs.PKCS8ShroudedKeyBag({ parsedValue: pkcs8 }) })] }) },
    { privacyMode: 1, value: new pkijs.SafeContents({ safeBags: [new pkijs.SafeBag({ bagId: OID.certBag, bagValue: new pkijs.CertBag({ parsedValue: cert }) })] }) },
  ] } }) } })
  const enc = { password: pw, contentEncryptionAlgorithm: { name: 'AES-CBC', length: 256 }, hmacHashAlgorithm: 'SHA-256', iterationCount: 200_000 } as never
  const safe = pfx.parsedValue!.authenticatedSafe!
  await (safe.parsedValue!.safeContents[0].value.safeBags[0].bagValue as pkijs.PKCS8ShroudedKeyBag).makeInternalValues(enc)
  await safe.makeInternalValues({ safeContents: [{}, enc] })
  await pfx.makeInternalValues({ password: pw, iterations: 200_000, pbkdf2HashAlgorithm: 'SHA-256', hmacHashAlgorithm: 'SHA-256' })
  const p12 = new Uint8Array(pfx.toSchema().toBER(false))
  return { p12, identity: { key: keys.privateKey, chain: [cert], name: o.name, issuer: o.name, notAfter: cert.notAfter.value, algorithm: 'rsa' } }
}
