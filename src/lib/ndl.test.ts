import { describe, expect, it } from 'vitest'
// The Electron main-process parser is intentionally a CommonJS module.
// @ts-expect-error There is no separate declaration file for this internal module.
import ndl from '../../electron/ndl.cjs'

const { createNdlSruUrl, extractNdcFromXml, extractSruDiagnostic, isbn13to10, isValidNdc } = ndl

describe('NDL classification parser', () => {
  it('ignores self-closing NDC links and reads the classification value', () => {
    const xml = `
      <recordData>
        <rdf:RDF>
          <dcndl:BibResource>
            <dcterms:identifier rdf:datatype="http://ndl.go.jp/dcndl/terms/ISBN">9784839955557</dcterms:identifier>
            <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndc9/021.4"/>
            <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndc9/727"/>
            <dc:subject rdf:datatype="http://ndl.go.jp/dcndl/terms/NDC8">727</dc:subject>
          </dcndl:BibResource>
        </rdf:RDF>
      </recordData>`

    expect(extractNdcFromXml(xml)).toEqual({ 4839955557: '727' })
  })

  it('normalizes a hyphenated ISBN and accepts decimal NDC values', () => {
    const xml = `
      <recordData>
        <identifier type="ISBN">978-4-8399-5555-7</identifier>
        <subject type="NDC9">913.6</subject>
      </recordData>`

    expect(extractNdcFromXml(xml)).toEqual({ 4839955557: '913.6' })
    expect(isbn13to10('9784839955557')).toBe('4839955557')
    expect(isValidNdc('913.6')).toBe(true)
    expect(isValidNdc('   ')).toBe(false)
  })

  it('creates one-ISBN SRU queries and detects HTTP 200 diagnostics', () => {
    const url = new URL(createNdlSruUrl('4839955557'))
    expect(url.searchParams.get('query')).toBe('isbn="4839955557"')
    expect(url.searchParams.get('query')).not.toContain(' OR ')
    expect(extractSruDiagnostic(`
      <diagnostics><diagnostic><message>illegal query syntax</message></diagnostic></diagnostics>
    `)).toBe('illegal query syntax')
  })
})
