// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { PRESETS, findMatches } from '@/features/canvas/patterns'

const re = (id: string) => PRESETS.find((p) => p.id === id)!.re
describe('redaction presets', () => {
  it('finds emails, and not look-alikes', () => {
    expect(findMatches('Write to brian@gachichio.org or a.b+c@mail.co.ke. Not at@ or @at.', re('email'))).toEqual(['brian@gachichio.org', 'a.b+c@mail.co.ke'])
  })
  it('finds Kenyan and international phone numbers', () => {
    const t = 'Call 0725 471 260, +254 725 471 260, 0112-345-678 or +44 20 7946 0958. Ref 12345.'
    expect(findMatches(t, re('phone'))).toEqual(['0725 471 260', '+254 725 471 260', '0112-345-678', '+44 20 7946 0958'])
  })
  it('finds long numbers of 8 or more digits only', () => {
    expect(findMatches('ID 12345678, account 0012345678901, year 2026, code 1234567', re('long'))).toEqual(['12345678', '0012345678901'])
  })
  it('finds KRA PINs', () => {
    expect(findMatches('PIN A123456789Z and P987654321B, not B123456789C1 or a123456789z', re('kra'))).toEqual(['A123456789Z', 'P987654321B'])
  })
  it('returns each match once', () => { expect(findMatches('a@b.co a@b.co', re('email'))).toEqual(['a@b.co']) })
})
