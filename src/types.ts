export type Book = {
  id: string
  title: string
  author: string
}

export type LibrarySystem = {
  id: string
  name: string
  libraries: string[]
}

export type AvailabilityRecord = {
  status: 'Running' | 'OK' | 'Cache' | string
  reserveurl?: string
  libkey?: Record<string, string>
}

export type CollectionCache = Record<string, Record<string, AvailabilityRecord>>

export type AppState = {
  version: number
  books: Book[]
  systems: LibrarySystem[]
  stars: Record<string, number>
  ndc: Record<string, string>
  collectionCache: CollectionCache
  options: { booksPerPage: number }
  lastSyncedAt: string | null
}

export type Progress = {
  stage: string
  current: number
  total: number
}

export type AvailabilityUpdate = {
  books: CollectionCache
  complete: boolean
}

export type NdcUpdate = {
  ndc: Record<string, string>
  complete: boolean
}

export type MoveDestination = 'read' | 'delete'

export interface CalilBridge {
  loadState(): Promise<AppState>
  setStar(isbn: string, rate: number): Promise<Record<string, number>>
  saveOptions(options: { booksPerPage: number }): Promise<AppState>
  clearLocalData(): Promise<AppState>
  openLogin(): Promise<boolean>
  checkLogin(): Promise<boolean>
  syncWishlist(): Promise<AppState>
  checkAvailability(isbns: string[], systemIds: string[]): Promise<CollectionCache>
  moveBooks(isbns: string[], destination: MoveDestination): Promise<AppState>
  openExternal(url: string): Promise<void>
  openReservePage(isbn: string, systemId: string): Promise<void>
  openLogs(): Promise<string>
  logRendererError(details: { type: string; message: string; stack?: string }): void
  onProgress(callback: (progress: Progress) => void): () => void
  onAvailabilityUpdate(callback: (update: AvailabilityUpdate) => void): () => void
  onNdcUpdate(callback: (update: NdcUpdate) => void): () => void
}

declare global {
  interface Window {
    calil: CalilBridge
  }
}
