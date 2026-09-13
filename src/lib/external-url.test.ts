import { describe, expect, it } from 'vitest'
// @ts-expect-error CommonJS module used by the Electron main process.
import externalUrl from '../../electron/external-url.cjs'

const { getAuthorizedReserveUrl, parseExternalHttpsUrl } = externalUrl

describe('external URL validation', () => {
  it('allows only the reservation URL stored for that book and system', () => {
    const state = {
      collectionCache: {
        book1: { library1: { reserveurl: 'https://opac.example.jp/reserve?id=1' } },
      },
    }
    expect(getAuthorizedReserveUrl(state, 'book1', 'library1').hostname).toBe('opac.example.jp')
    expect(() => getAuthorizedReserveUrl(state, 'book2', 'library1')).toThrow('見つかりません')
  })

  it('rejects non-HTTPS protocols', () => {
    expect(() => parseExternalHttpsUrl('http://opac.example.jp/reserve')).toThrow('HTTPS')
    expect(() => parseExternalHttpsUrl('javascript:alert(1)')).toThrow('HTTPS')
  })

  it('keeps ordinary external links on an explicit host allowlist', () => {
    expect(parseExternalHttpsUrl('https://calil.jp/book/1', ['calil.jp']).hostname).toBe('calil.jp')
    expect(() => parseExternalHttpsUrl('https://example.com/', ['calil.jp'])).toThrow('許可されていない')
  })
})
