import type { AppState, CalilBridge, CollectionCache } from './types'

const previewState: AppState = {
  version: 1,
  books: [
    { id: '4101010013', title: '吾輩は猫である', author: '夏目 漱石' },
    { id: '4003101014', title: '銀河鉄道の夜', author: '宮沢 賢治' },
    { id: '4101092055', title: 'こころ', author: '夏目 漱石' },
  ],
  systems: [
    { id: 'Tokyo_Setagaya', name: '世田谷区立図書館', libraries: ['中央', '経堂'] },
    { id: 'Tokyo_Meguro', name: '目黒区立図書館', libraries: ['八雲', '大橋'] },
  ],
  stars: { '4101010013': 3, '4003101014': 2 },
  ndc: { '4101010013': '913.6', '4003101014': '913.6', '4101092055': '913.6' },
  ndcFailed: {},
  collectionCache: {
    '4101010013': {
      Tokyo_Setagaya: { status: 'OK', reserveurl: 'https://calil.jp/', libkey: { 中央: '貸出可', 経堂: '貸出中' } },
      Tokyo_Meguro: { status: 'Cache', reserveurl: 'https://calil.jp/', libkey: { 八雲: '貸出中', 大橋: '蔵書なし' } },
    },
    '4003101014': {
      Tokyo_Setagaya: { status: 'OK', reserveurl: 'https://calil.jp/', libkey: { 中央: '貸出中', 経堂: '貸出中' } },
      Tokyo_Meguro: { status: 'OK', libkey: { 八雲: '蔵書なし', 大橋: '蔵書なし' } },
    },
  },
  options: { booksPerPage: 20 },
  lastSyncedAt: new Date().toISOString(),
}

export function installDevBridge() {
  if (!import.meta.env.DEV || window.calil) return
  let state = structuredClone(previewState)
  const bridge: CalilBridge = {
    loadState: async () => structuredClone(state),
    setStar: async (isbn, rate) => {
      if (rate) state.stars[isbn] = rate
      else delete state.stars[isbn]
      return structuredClone(state.stars)
    },
    saveOptions: async (options) => { state.options = options; return structuredClone(state) },
    clearLocalData: async () => { state = { ...state, books: [], systems: [], ndc: {}, ndcFailed: {}, collectionCache: {}, lastSyncedAt: null }; return structuredClone(state) },
    openLogin: async () => true,
    checkLogin: async () => true,
    syncWishlist: async () => structuredClone(state),
    checkAvailability: async () => structuredClone(state.collectionCache) as CollectionCache,
    cancelAvailability: async () => true,
    moveBooks: async (isbns) => { state.books = state.books.filter((book) => !isbns.includes(book.id)); return structuredClone(state) },
    openExternal: async () => undefined,
    openReservePage: async () => undefined,
    openLogs: async () => '/tmp/calil-enhancer-preview.log',
    logRendererError: () => undefined,
    onProgress: () => () => undefined,
    onAvailabilityUpdate: () => () => undefined,
    onNdcUpdate: () => () => undefined,
  }
  window.calil = bridge
}
