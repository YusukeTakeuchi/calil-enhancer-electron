import { describe, expect, it } from 'vitest'
import { ndcLabel } from './ndc'

describe('NDC labels', () => {
  it('uses the detailed three-digit class for decimal codes', () => {
    expect(ndcLabel('913.6')).toBe('小説 物語')
    expect(ndcLabel('727')).toBe('グラッフィクデザイン 図案')
  })

  it('uses the matching hierarchy level for shorter codes', () => {
    expect(ndcLabel('91')).toBe('日本文学')
    expect(ndcLabel('9')).toBe('文学')
  })
})
