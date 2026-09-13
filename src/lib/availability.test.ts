import { describe, expect, it } from 'vitest'
import { isResolvedRecord, mergeCollectionCache, selectAvailabilityRecord } from './availability'

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

  it('distinguishes stored records from records received by the current check', () => {
    const stored = { status: 'OK', libkey: { 中央: '貸出中' } }
    const live = { status: 'OK', libkey: { 中央: '貸出可' } }
    const liveApiCache = { status: 'Cache', libkey: { 中央: '貸出可' } }

    expect(selectAvailabilityRecord(undefined, stored)).toEqual({ record: stored, fromLocalCache: true })
    expect(selectAvailabilityRecord(live, stored)).toEqual({ record: live, fromLocalCache: false })
    expect(selectAvailabilityRecord(liveApiCache, stored)).toEqual({ record: liveApiCache, fromLocalCache: false })
  })

  it('keeps stored data until a partial live result actually arrives', () => {
    const stored = { status: 'OK', libkey: { 中央: '貸出中' } }
    const running = { status: 'Running', libkey: {} }
    const partial = { status: 'Running', libkey: { 中央: '貸出可' } }

    expect(selectAvailabilityRecord(running, stored)).toEqual({ record: stored, fromLocalCache: true })
    expect(selectAvailabilityRecord(partial, stored)).toEqual({ record: partial, fromLocalCache: false })
  })
})
