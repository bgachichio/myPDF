// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { zip, crc32 } from '@/lib/zip'

describe('zip', () => {
  it('matches the known CRC-32 of "123456789"', () => { expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926) })

  it('writes an archive that the system unzip accepts and reads back byte for byte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mypdf-zip-'))
    const a = new Uint8Array(70_000).map((_, i) => (i * 7) & 255), b = new TextEncoder().encode('hello'), c = new Uint8Array(0)
    const file = join(dir, 'out.zip')
    writeFileSync(file, zip([{ name: 'a.bin', bytes: a }, { name: 'dir/b.txt', bytes: b }, { name: 'empty.txt', bytes: c }]))
    let have = true
    try { execFileSync('unzip', ['-v'], { stdio: 'pipe' }) } catch { have = false }
    if (!have) return
    expect(execFileSync('unzip', ['-t', file], { stdio: 'pipe' }).toString()).toMatch(/No errors detected/)
    execFileSync('unzip', ['-o', '-q', file, '-d', join(dir, 'x')])
    expect(Buffer.compare(readFileSync(join(dir, 'x', 'a.bin')), Buffer.from(a))).toBe(0)
    expect(readFileSync(join(dir, 'x', 'dir', 'b.txt'), 'utf8')).toBe('hello')
    // A non-ASCII name is flagged as UTF-8 and the archive still tests clean (the system unzip may show the name in its own locale).
    const u = join(dir, 'u.zip'); writeFileSync(u, zip([{ name: 'résumé.pdf', bytes: b }]))
    expect(execFileSync('unzip', ['-t', u], { stdio: 'pipe' }).toString()).toMatch(/No errors detected/)
  })
})
