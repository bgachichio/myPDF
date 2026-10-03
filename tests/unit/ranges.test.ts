// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { parseRanges, formatRanges, reorder, splitGroups } from '@/features/workbench/ranges'

describe('page ranges', () => {
  it('parses lists, spans and open ends', () => {
    expect(parseRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4])
    expect(parseRanges('8-', 10)).toEqual([7, 8, 9])
    expect(parseRanges('2,2,3', 10)).toEqual([1, 2])
  })
  it('rejects bad input', () => {
    for (const bad of ['', 'a', '0', '5-3', '11', '1-11', '1;2']) expect(parseRanges(bad, 10)).toBeNull()
  })
  it('formats back', () => { expect(formatRanges([4, 0, 1, 2])).toBe('1-3, 5') })
  it('reorders: moving page 5 to position 1 (R03)', () => {
    expect(reorder(6, [4], 0)).toEqual([4, 0, 1, 2, 3, 5])
    expect(reorder(6, [0, 1], 4)).toEqual([2, 3, 4, 5, 0, 1])
  })
  it('splits every N pages, after chosen pages, or into chosen ranges (F22)', () => {
    expect(splitGroups('every', 7, '3')).toEqual([[0, 1, 2], [3, 4, 5], [6]])
    expect(splitGroups('every', 4, '10')).toEqual([[0, 1, 2, 3]])
    expect(splitGroups('at', 8, '3, 6')).toEqual([[0, 1, 2], [3, 4, 5], [6, 7]])
    expect(splitGroups('at', 8, '6 3 3')).toEqual([[0, 1, 2], [3, 4, 5], [6, 7]])
    expect(splitGroups('ranges', 9, '1-2, 5, 7-')).toEqual([[0, 1], [4], [6, 7, 8]])
    for (const [m, t] of [['every', '0'], ['every', 'x'], ['at', '8'], ['at', '0'], ['at', ''], ['ranges', '3-1'], ['ranges', '']] as const) expect(splitGroups(m, 8, t)).toBeNull()
  })
})
