import { describe, expect, it } from 'vitest'
import { isResolvedRecord, mergeCollectionCache } from './availability'

describe('incremental availability', () => {
  it('merges systems without dropping earlier results', () => {
    const first = { book: { systemA: { status: 'OK', libkey: { 中央: '貸出可' } } } }
    const second = { book: { systemB: { status: 'OK', libkey: { 西: '貸出中' } } } }
    const merged = mergeCollectionCache(first, second)
    expect(Object.keys(merged.book)).toEqual(['systemA', 'systemB'])
    expect(first.book).not.toHaveProperty('systemB')
  })

  it('distinguishes running and resolved records', () => {
    expect(isResolvedRecord({ status: 'Running' })).toBe(false)
    expect(isResolvedRecord({ status: 'OK' })).toBe(true)
    expect(isResolvedRecord({ status: 'Cache' })).toBe(true)
  })
})
