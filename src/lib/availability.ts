import type { AvailabilityRecord, CollectionCache } from '../types'

type StatusStyle = { label: string; mark: string; rank: number; tone: string }

const STATUS: Record<string, StatusStyle> = {
  貸出可: { label: '貸出可', mark: '◎', rank: 100, tone: 'available' },
  蔵書あり: { label: '蔵書あり', mark: '○', rank: 90, tone: 'owned' },
  館内のみ: { label: '館内のみ', mark: '○', rank: 80, tone: 'onsite' },
  貸出中: { label: '貸出中', mark: '△', rank: 70, tone: 'waiting' },
  準備中: { label: '準備中', mark: '△', rank: 60, tone: 'waiting' },
  予約中: { label: '予約中', mark: '△', rank: 50, tone: 'waiting' },
  休館中: { label: '休館中', mark: '△', rank: 40, tone: 'waiting' },
  蔵書なし: { label: '蔵書なし', mark: '×', rank: 10, tone: 'none' },
}

export function statusStyle(raw?: string): StatusStyle {
  return STATUS[raw || ''] ?? STATUS['蔵書なし']
}

export function aggregateStatus(record?: AvailabilityRecord): StatusStyle {
  const values = Object.values(record?.libkey ?? {})
  return values.map(statusStyle).reduce((best, current) => current.rank > best.rank ? current : best, STATUS['蔵書なし'])
}

export function isResolvedRecord(record?: AvailabilityRecord): boolean {
  return record?.status === 'OK' || record?.status === 'Cache'
}

export function mergeCollectionCache(base: CollectionCache, update: CollectionCache): CollectionCache {
  const merged = { ...base }
  for (const [isbn, systems] of Object.entries(update)) {
    merged[isbn] = { ...(merged[isbn] ?? {}), ...systems }
  }
  return merged
}
