export const NDC_TOP: Record<string, string> = {
  '0': '総記',
  '1': '哲学',
  '2': '歴史',
  '3': '社会科学',
  '4': '自然科学',
  '5': '技術・工学',
  '6': '産業',
  '7': '芸術・美術',
  '8': '言語',
  '9': '文学',
}

export function ndcLabel(code: string): string {
  return NDC_TOP[code.slice(0, 1)] ?? '分類未設定'
}
