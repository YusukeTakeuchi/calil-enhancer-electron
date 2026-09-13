import { describe, expect, it } from 'vitest'
import { matchesBook, parseQuery } from './search'

const book = { id: '123', title: '吾輩は猫である', author: '夏目漱石' }
const context = { stars: { '123': 2 }, ndc: { '123': '913.6' }, starFilter: 'none' as const }

describe('search query', () => {
  it('combines title/author terms with NDC', () => {
    expect(matchesBook(book, '猫 漱石 ndc:913(日本文学)', context)).toBe(true)
    expect(matchesBook(book, '猫 ndc:4', context)).toBe(false)
  })

  it('treats a spaced NDC label as a display-only annotation', () => {
    const statisticsBook = { id: '417-book', title: '統計入門', author: '著者' }
    const statisticsContext = { stars: {}, ndc: { '417-book': '417' }, starFilter: 'none' as const }

    expect(parseQuery('ndc:417(確率論 数理統計学)')).toMatchObject({ text: [], ndcs: ['417'] })
    expect(matchesBook(statisticsBook, 'ndc:417(確率論 数理統計学)', statisticsContext)).toBe(true)
  })

  it('supports exact and ranged star queries', () => {
    expect(parseQuery('star:2')).toMatchObject({ starRange: { from: 2, to: 2 } })
    expect(matchesBook(book, 'star:1-2', context)).toBe(true)
    expect(matchesBook(book, 'star:3-', context)).toBe(false)
  })
})
