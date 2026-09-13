function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function isbn13to10(isbn13) {
  if (!/^978\d{10}$/.test(isbn13)) return isbn13
  const base = isbn13.slice(3, 12)
  const sum = [...base].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0)
  const check = (11 - (sum % 11)) % 11
  return base + (check === 10 ? 'X' : String(check))
}

function normalizeNdc(value) {
  const normalized = decodeXml(value).normalize('NFKC').trim()
  const match = normalized.match(/\d{1,3}(?:\.\d+)?/)
  return match ? match[0] : ''
}

function isValidNdc(value) {
  return typeof value === 'string' && /^\d{1,3}(?:\.\d+)?$/.test(value.trim())
}

function createNdlSruUrl(isbn) {
  const url = new URL('https://ndlsearch.ndl.go.jp/api/sru')
  url.searchParams.set('operation', 'searchRetrieve')
  url.searchParams.set('query', `isbn="${String(isbn).replace(/["\\]/g, '\\$&')}"`)
  url.searchParams.set('maximumRecords', '10')
  url.searchParams.set('recordPacking', 'xml')
  url.searchParams.set('recordSchema', 'dcndl')
  url.searchParams.set('onlyBib', 'true')
  return url.toString()
}

function extractSruDiagnostic(xml) {
  const message = xml.match(/<(?:[\w.-]+:)?message\b[^>]*>\s*([^<]+)\s*<\/(?:[\w.-]+:)?message>/i)?.[1]
  return message ? decodeXml(message).normalize('NFKC').trim() : ''
}

function extractNdcFromXml(xml) {
  const result = {}
  const blocks = xml.match(/<(?:[\w.-]+:)?recordData\b[\s\S]*?<\/(?:[\w.-]+:)?recordData>/gi) || [xml]
  for (const block of blocks) {
    const isbnMatch = block.match(/<(?:[\w.-]+:)?identifier\b[^>]*(?:ISBN)[^>]*>\s*([^<]+)<\/(?:[\w.-]+:)?identifier>/i)
      || block.match(/<(?:[\w.-]+:)?ISBN\b[^>]*>\s*([^<]+)<\/(?:[\w.-]+:)?ISBN>/i)

    // NDL Search also returns self-closing subject links whose URL contains "NDC".
    // Only paired elements can contain the actual classification value.
    const subjectMatches = [...block.matchAll(
      /<(?:[\w.-]+:)?subject\b([^>]*)>\s*([^<]*?[^\s<][^<]*?)\s*<\/(?:[\w.-]+:)?subject>/gi,
    )]
    const ndcSubject = subjectMatches.find((match) => /NDC\d*/i.test(match[1]))
    let ndcMatch = ndcSubject
      ? ndcSubject[2]
      : block.match(/<(?:[\w.-]+:)?NDC\d*\b[^>]*>\s*([^<]*?[^\s<][^<]*?)\s*<\/(?:[\w.-]+:)?NDC\d*>/i)?.[1]

    // Recent DC-NDL records often expose NDC only as a subject resource URL,
    // for example .../class/ndc10/913.6, without a text-valued subject.
    if (!ndcMatch) {
      const resourceMatches = [...block.matchAll(
        /<(?:[\w.-]+:)?subject\b[^>]*(?:[\w.-]+:)?resource=["'][^"']*\/class\/ndc(10|9|8)?\/([^"'#?\s/]+)["'][^>]*\/?>/gi,
      )]
      resourceMatches.sort((left, right) => ndcVersionRank(right[1]) - ndcVersionRank(left[1]))
      ndcMatch = resourceMatches[0]?.[2]
    }

    if (!isbnMatch || !ndcMatch) continue
    const originalIsbn = decodeXml(isbnMatch[1]).replace(/[-\s]/g, '')
    const isbn = originalIsbn.length === 13 ? isbn13to10(originalIsbn) : originalIsbn
    const ndc = normalizeNdc(ndcMatch)
    if (isbn && ndc && !result[isbn]) result[isbn] = ndc
  }
  return result
}

function ndcVersionRank(version) {
  if (version === '10') return 3
  if (version === '9') return 2
  if (version === '8') return 1
  return 0
}

module.exports = {
  createNdlSruUrl,
  extractNdcFromXml,
  extractSruDiagnostic,
  isbn13to10,
  isValidNdc,
  normalizeNdc,
}
