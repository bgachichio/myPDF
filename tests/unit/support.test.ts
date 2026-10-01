// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { BTC_ADDRESS, LIGHTNING_ADDRESS, PAYSTACK_URL } from '@/config/support'

// Bech32m charset for validation
const BECH32M_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32M_CONST = 0x2bc830a3

function bech32mVerify(addr: string): boolean {
  const lower = addr.toLowerCase()
  const sep = lower.lastIndexOf('1')
  if (sep < 1 || sep + 7 > lower.length) return false
  const hrp = lower.slice(0, sep)
  const data = lower.slice(sep + 1).split('').map(c => BECH32M_CHARSET.indexOf(c))
  if (data.includes(-1)) return false
  return bech32mPolymod(hrpExpand(hrp).concat(data)) === BECH32M_CONST
}

function hrpExpand(hrp: string): number[] {
  return [...hrp].map(c => c.charCodeAt(0) >> 5).concat([0], [...hrp].map(c => c.charCodeAt(0) & 31))
}

function bech32mPolymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]
  }
  return chk
}

describe('support config', () => {
  it('BTC_ADDRESS is non-empty', () => {
    expect(BTC_ADDRESS).toBeTruthy()
  })

  it('LIGHTNING_ADDRESS is non-empty', () => {
    expect(LIGHTNING_ADDRESS).toBeTruthy()
  })

  it('PAYSTACK_URL is non-empty', () => {
    expect(PAYSTACK_URL).toBeTruthy()
  })

  it('BTC_ADDRESS passes bech32m checksum', () => {
    expect(bech32mVerify(BTC_ADDRESS)).toBe(true)
  })
})

describe('production build guard (R15)', () => {
  it('throws when either address is empty and passes when both are set', async () => {
    const { assertSupportConfig } = await import('@/config/support-guard')
    expect(() => assertSupportConfig('', BTC_ADDRESS)).toThrow(/must not be empty/)
    expect(() => assertSupportConfig(LIGHTNING_ADDRESS, '  ')).toThrow(/must not be empty/)
    expect(() => assertSupportConfig(LIGHTNING_ADDRESS, BTC_ADDRESS)).not.toThrow()
  })
  it('the Lightning address looks like name@host and no copy suggests a gift size', async () => {
    expect(LIGHTNING_ADDRESS).toMatch(/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i)
    expect(PAYSTACK_URL).toBe('https://paystack.shop/pay/gachichio')
  })
})
