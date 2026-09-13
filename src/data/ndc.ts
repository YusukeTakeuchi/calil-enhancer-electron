import { NDC_CLASSES } from './ndc-classes'

export const NDC_TOP = Object.fromEntries(
  Object.entries(NDC_CLASSES[0]).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
)

export function ndcLabel(code: string): string {
  const digits = code.trim().match(/^\d{1,3}/)?.[0] ?? ''
  for (let length = Math.min(3, digits.length); length >= 1; length -= 1) {
    const label = NDC_CLASSES[length - 1]?.[digits.slice(0, length)]
    if (label) return label
  }
  return '分類未設定'
}
