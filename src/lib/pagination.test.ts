import { describe, expect, it } from 'vitest'
import { paginationPages } from './pagination'

describe('pagination', () => {
  it('shows four neighboring pages plus the first and last pages', () => {
    expect(paginationPages(10, 20)).toEqual([1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20])
  })

  it('does not duplicate pages near either end', () => {
    expect(paginationPages(2, 8)).toEqual([1, 2, 3, 4, 5, 6, 8])
    expect(paginationPages(7, 8)).toEqual([1, 3, 4, 5, 6, 7, 8])
  })
})
