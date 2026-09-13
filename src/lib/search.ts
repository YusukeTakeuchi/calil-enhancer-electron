import type { Book } from '../types'

export type SearchContext = {
  stars: Record<string, number>
  ndc: Record<string, string>
  starFilter: 'none' | '1' | '2' | '3'
}

type ParsedQuery = {
  text: string[]
  ndcs: string[]
  starRange: { from: number | null; to: number | null } | null
}

export function parseQuery(input: string): ParsedQuery {
  // Labels added by an NDC sidebar click are display-only annotations. Remove
  // the whole annotation before tokenizing so spaces in a label do not become
  // accidental title/author search terms.
  const searchableInput = input.replace(/(ndc:\s*[0-9.]+)\([^)]*\)/gi, '$1')
  const tokens = searchableInput.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
  const text: string[] = []
  const ndcs: string[] = []
  let starRange: ParsedQuery['starRange'] = null

  for (const rawToken of tokens) {
    const token = rawToken.replace(/^"|"$/g, '')
    if (token.toLowerCase().startsWith('ndc:')) {
      const value = token.slice(4).replace(/\(.*/, '').trim()
      if (value) ndcs.push(value)
      continue
    }
    if (token.toLowerCase().startsWith('star:')) {
      starRange = parseStarRange(token.slice(5))
      continue
    }
    if (token) text.push(token.toLocaleLowerCase('ja'))
  }
  return { text, ndcs, starRange }
}

function parseStarRange(value: string): ParsedQuery['starRange'] {
  if (!value) return { from: 1, to: null }
  if (!value.includes('-')) {
    const exact = Number(value)
    return Number.isFinite(exact) ? { from: exact, to: exact } : null
  }
  const [rawFrom, rawTo] = value.split('-', 2)
  const from = rawFrom === '' ? null : Number(rawFrom)
  const to = rawTo === '' ? null : Number(rawTo)
  if ((from !== null && !Number.isFinite(from)) || (to !== null && !Number.isFinite(to))) return null
  return { from, to }
}

export function matchesBook(book: Book, query: string, context: SearchContext): boolean {
  const parsed = parseQuery(query)
  const searchable = `${book.title} ${book.author}`.toLocaleLowerCase('ja')
  if (!parsed.text.every((word) => searchable.includes(word))) return false

  const rating = context.stars[book.id] ?? 0
  if (context.starFilter !== 'none' && rating !== Number(context.starFilter)) return false
  if (context.starFilter === 'none' && parsed.starRange) {
    if (parsed.starRange.from !== null && rating < parsed.starRange.from) return false
    if (parsed.starRange.to !== null && rating > parsed.starRange.to) return false
  }

  const bookNdc = context.ndc[book.id]
  return parsed.ndcs.length === 0 || Boolean(bookNdc && parsed.ndcs.some((code) => bookNdc.startsWith(code)))
}
