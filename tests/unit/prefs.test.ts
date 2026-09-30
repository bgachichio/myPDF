// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest'
import { prefs } from '@/storage/prefs'

describe('prefs', () => {
  beforeEach(() => localStorage.clear())

  it('getTheme defaults to system', () => {
    expect(prefs.getTheme()).toBe('system')
  })

  it('setTheme and getTheme round-trip', () => {
    prefs.setTheme('dark')
    expect(prefs.getTheme()).toBe('dark')
  })

  it('getFontScale defaults to default', () => {
    expect(prefs.getFontScale()).toBe('default')
  })

  it('setFontScale and getFontScale round-trip', () => {
    prefs.setFontScale('large')
    expect(prefs.getFontScale()).toBe('large')
  })

  it('getExportCompress defaults to true', () => {
    expect(prefs.getExportCompress()).toBe(true)
  })

  it('getExportStripMetadata defaults to true', () => {
    expect(prefs.getExportStripMetadata()).toBe(true)
  })
})
