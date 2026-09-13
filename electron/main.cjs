const { app, BrowserWindow, ipcMain, Menu, screen, session, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createLogger } = require('./logger.cjs')
const { createNdlSruUrl, extractNdcFromXml, extractSruDiagnostic, isValidNdc } = require('./ndl.cjs')
const { getAuthorizedReserveUrl, parseExternalHttpsUrl } = require('./external-url.cjs')
const { isWindowBounds, normalizeWindowBounds } = require('./window-bounds.cjs')

const CALIL_APP_KEY = 'e4ee980a3908451a0f4dc8af64ff268b'
const CALIL_PARTITION = 'persist:calil-enhancer-account'
const AVAILABILITY_BATCH_SIZE = 20
const MAX_AVAILABILITY_POLL_ATTEMPTS = 150
const DEFAULT_STATE = {
  version: 1,
  books: [],
  systems: [],
  stars: {},
  ndc: {},
  collectionCache: {},
  options: { booksPerPage: 20 },
  lastSyncedAt: null,
  windowBounds: null,
}

let mainWindow
let loginWindow
let calilSession
let writeQueue = Promise.resolve()
let logger
let lastProgressStage
let boundsSaveTimer
let availabilityAbortController

function logInfo(event, details) {
  logger?.info(event, details)
  if (!app.isPackaged) console.info(`[${event}]`, details || '')
}

function logWarn(event, details) {
  logger?.warn(event, details)
  console.warn(`[${event}]`, details || '')
}

function logError(event, error, details) {
  logger?.error(event, error, details)
  console.error(`[${event}]`, error)
}

function safeEndpoint(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return '[invalid-url]'
  }
}

process.on('uncaughtExceptionMonitor', (error, origin) => {
  logError('process.uncaught-exception', error, { origin })
})
process.on('unhandledRejection', (reason) => {
  logError('process.unhandled-rejection', reason)
})

function dataPath() {
  return path.join(app.getPath('userData'), 'calil-enhancer-data.json')
}

async function loadState() {
  try {
    const data = JSON.parse(await fs.readFile(dataPath(), 'utf8'))
    return {
      ...DEFAULT_STATE,
      ...data,
      books: Array.isArray(data.books) ? data.books : [],
      systems: Array.isArray(data.systems) ? data.systems : [],
      stars: isRecord(data.stars) ? data.stars : {},
      ndc: isRecord(data.ndc) ? data.ndc : {},
      collectionCache: isRecord(data.collectionCache) ? data.collectionCache : {},
      options: { ...DEFAULT_STATE.options, ...(isRecord(data.options) ? data.options : {}) },
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') logError('storage.read-failed', error)
    return structuredClone(DEFAULT_STATE)
  }
}

function saveState(nextState) {
  writeQueue = writeQueue.then(async () => {
    const target = dataPath()
    const temporary = `${target}.tmp`
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(temporary, JSON.stringify(nextState, null, 2), 'utf8')
    await fs.rename(temporary, target)
  })
  return writeQueue
}

async function updateState(updater) {
  await writeQueue
  const state = await loadState()
  const result = await updater(state)
  await saveState(state)
  return result === undefined ? state : result
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length > 2048) throw new TypeError(`${name} が不正です。`)
  return value
}

function assertStringArray(value, name, max = 200) {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${name} が不正です。`)
  }
  return value
}

function emitProgress(stage, current = 0, total = 0) {
  if (stage !== lastProgressStage) {
    lastProgressStage = stage
    logInfo('operation.progress', { stage, current, total })
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('calil:progress', { stage, current, total })
  }
}

function emitAvailabilityUpdate(books, complete = false) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('calil:availability-update', {
      books: isRecord(books) ? books : {},
      complete,
    })
  }
}

function emitNdcUpdate(ndc, complete = false) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('calil:ndc-update', {
      ndc: isRecord(ndc) ? ndc : {},
      complete,
    })
  }
}

async function loggedSessionFetch(url, init = {}, service = 'external') {
  const startedAt = Date.now()
  const request = {
    service,
    method: String(init.method || 'GET').toUpperCase(),
    endpoint: safeEndpoint(url),
  }
  logInfo('http.request', request)
  try {
    const response = await calilSession.fetch(url, init)
    logInfo('http.response', {
      ...request,
      status: response.status,
      durationMs: Date.now() - startedAt,
    })
    return response
  } catch (error) {
    if (isAbortError(error)) {
      logInfo('http.aborted', { ...request, durationMs: Date.now() - startedAt })
    } else {
      logError('http.network-error', error, { ...request, durationMs: Date.now() - startedAt })
    }
    throw error
  }
}

function isAbortError(error) {
  return Boolean(error && (error.name === 'AbortError' || error.code === 'ABORT_ERR'))
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      reject(error)
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    function onAbort() {
      clearTimeout(timer)
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      reject(error)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function calilFetch(url, init = {}, acceptedStatuses = []) {
  const response = await loggedSessionFetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      Referer: 'https://calil.jp/list',
      Origin: 'https://calil.jp',
      ...(init.headers || {}),
    },
  }, 'calil')
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    const pathname = new URL(url).pathname
    const error = new Error(`カーリルとの通信に失敗しました: ${pathname} (${response.status})`)
    error.status = response.status
    throw error
  }
  return response
}

async function getWishlistToken() {
  const response = await calilFetch(
    'https://calil.jp/infrastructure/v2/get_yomitai_token',
    { cache: 'no-store' },
    [401, 503],
  )
  if (response.status === 401) throw new Error('カーリルにログインしてください。')
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('json')) {
    throw new Error('カーリルにログインしてください。')
  }
  const json = await response.json()
  if (response.status === 503) throw new Error(json.message || 'カーリルは現在メンテナンス中です。')
  const token = json['Calil-Yomitai-Token']
  if (typeof token !== 'string' || !token) throw new Error('読みたいリストを取得できませんでした。')
  return token
}

async function fetchWishlistJson(url, token, init = {}) {
  const response = await calilFetch(url, {
    ...init,
    headers: {
      'Calil-Yomitai-Token': token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  return response.json()
}

async function syncWishlist() {
  logInfo('wishlist.sync-started')
  emitProgress('ログイン状態を確認中')
  const token = await getWishlistToken()

  emitProgress('登録図書館を取得中')
  const libraryResponse = await calilFetch('https://calil.jp/infrastructure/v2/get_library', { cache: 'no-store' })
  const libraryData = await libraryResponse.json()
  const systems = Array.isArray(libraryData.libs)
    ? libraryData.libs.map((library) => ({
        id: String(library.system_id || ''),
        name: String(library.system_name || ''),
        libraries: Array.isArray(library.sublibs)
          ? library.sublibs.filter((item) => item.checked).map((item) => String(item.libkey || ''))
          : [],
      })).filter((system) => system.id)
    : []

  const books = []
  const seen = new Set()
  for (let page = 1; page <= 500; page += 1) {
    emitProgress('読みたいリストを取得中', books.length, 0)
    const data = await fetchWishlistJson('https://calil.jp/api/list/v2/', token, {
      method: 'POST',
      body: JSON.stringify({ name: 'wish', perCount: 20, page }),
    })
    const pageBooks = Array.isArray(data.books) ? data.books : []
    for (const rawBook of pageBooks) {
      const id = String(rawBook.id || rawBook.isbn || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      books.push({ id, title: String(rawBook.title || '無題'), author: String(rawBook.author || '') })
    }
    if (pageBooks.length === 0) break
  }

  await updateState((state) => {
    state.books = books
    state.systems = systems
    state.lastSyncedAt = new Date().toISOString()
  })

  const state = await loadState()
  const missingNdc = books.map((book) => book.id).filter((isbn) => !isValidNdc(state.ndc[isbn]))
  if (missingNdc.length) {
    try {
      await fetchNdc(missingNdc)
    } catch (error) {
      logError('ndc.fetch-failed', error, { isbnCount: missingNdc.length, nonFatal: true })
    }
  }
  emitProgress('同期完了', books.length, books.length)
  logInfo('wishlist.sync-completed', { bookCount: books.length, systemCount: systems.length })
  return loadState()
}

async function fetchNdc(isbns) {
  const result = {}
  let pending = {}
  let failedRequests = 0
  let batchRequested = 0
  let batchFetched = 0
  for (let index = 0; index < isbns.length; index += 1) {
    emitProgress('NDC 分類を取得中', index, isbns.length)
    const url = createNdlSruUrl(isbns[index])
    batchRequested += 1
    try {
      let response
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        response = await loggedSessionFetch(url, { cache: 'no-store' }, 'ndl')
        if (response.ok) break
        if (attempt === 3) throw new Error(`NDC の取得に失敗しました (${response.status})`)
        await new Promise((resolve) => setTimeout(resolve, attempt * 750))
      }
      const xml = await response.text()
      const diagnostic = extractSruDiagnostic(xml)
      if (diagnostic) throw new Error(`NDC API 診断: ${diagnostic}`)
      const fetched = extractNdcFromXml(xml)
      Object.assign(result, fetched)
      Object.assign(pending, fetched)
      batchFetched += Object.keys(fetched).length
    } catch (error) {
      failedRequests += 1
      logError('ndc.request-failed', error, { index, nonFatal: true })
    }

    const processed = index + 1
    if (processed % 20 === 0 || processed === isbns.length) {
      const committed = pending
      pending = {}
      if (Object.keys(committed).length) {
        // Save and render incrementally so an interruption cannot discard earlier results.
        await updateState((state) => Object.assign(state.ndc, committed))
        emitNdcUpdate(committed)
      }
      logInfo('ndc.batch-completed', {
        processed,
        requestedCount: batchRequested,
        fetchedCount: batchFetched,
      })
      batchRequested = 0
      batchFetched = 0
    }
    emitProgress('NDC 分類を取得中', processed, isbns.length)
    if (processed < isbns.length) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  emitNdcUpdate({}, true)
  logInfo('ndc.fetch-completed', {
    requestedCount: isbns.length,
    fetchedCount: Object.keys(result).length,
    failedRequests,
  })
  return result
}

function mergeBookRecords(target, source) {
  if (!isRecord(source)) return
  for (const [isbn, systems] of Object.entries(source)) {
    if (!isRecord(systems)) continue
    target[isbn] ||= {}
    for (const [systemId, record] of Object.entries(systems)) target[isbn][systemId] = record
  }
}

function countResolvedAvailabilityBooks(result, isbns, systemIds) {
  return isbns.filter((isbn) => systemIds.every((systemId) => {
    const status = result[isbn]?.[systemId]?.status
    return status === 'OK' || status === 'Cache'
  })).length
}

async function checkAvailability(isbns, systemIds) {
  if (!isbns.length || !systemIds.length) return {}
  availabilityAbortController?.abort()
  const controller = new AbortController()
  availabilityAbortController = controller
  const result = {}
  let cancelled = false
  try {
    emitProgress('蔵書状況を確認中', 0, isbns.length)
    for (let offset = 0; offset < isbns.length; offset += AVAILABILITY_BATCH_SIZE) {
      const batch = isbns.slice(offset, offset + AVAILABILITY_BATCH_SIZE)
      let params = new URLSearchParams({
        appkey: CALIL_APP_KEY,
        callback: 'no',
        isbn: batch.join(','),
        systemid: systemIds.join(','),
      })
      let batchComplete = false
      for (let attempt = 0; attempt < MAX_AVAILABILITY_POLL_ATTEMPTS; attempt += 1) {
        const response = await loggedSessionFetch(
          `https://api.calil.jp/check?${params}`,
          { signal: controller.signal },
          'calil-api',
        )
        if (!response.ok) throw new Error(`蔵書状況を取得できませんでした (${response.status})`)
        const data = await response.json()
        mergeBookRecords(result, data.books)
        batchComplete = Number(data.continue) !== 1
        const allBatchesComplete = batchComplete && offset + batch.length >= isbns.length
        emitAvailabilityUpdate(data.books, allBatchesComplete)
        emitProgress(
          '蔵書状況を確認中',
          batchComplete
            ? offset + batch.length
            : offset + countResolvedAvailabilityBooks(result, batch, systemIds),
          isbns.length,
        )
        if (batchComplete) break
        await abortableDelay(attempt < 3 ? 1000 : attempt < 8 ? 2000 : 4000, controller.signal)
        params = new URLSearchParams({ appkey: CALIL_APP_KEY, callback: 'no', session: String(data.session) })
      }
      if (!batchComplete) {
        throw new Error(`蔵書状況の確認がタイムアウトしました (${offset + 1}〜${offset + batch.length}冊目)`)
      }
      logInfo('availability.batch-completed', {
        batchStart: offset + 1,
        batchEnd: offset + batch.length,
        requestedCount: isbns.length,
      })
    }
    logInfo('availability.completed', { requestedCount: isbns.length, fetchedBookCount: Object.keys(result).length })
  } catch (error) {
    if (!isAbortError(error)) throw error
    cancelled = true
    logInfo('availability.cancelled', { isbnCount: isbns.length, fetchedBookCount: Object.keys(result).length })
  } finally {
    await updateState((state) => {
      for (const [isbn, systems] of Object.entries(result)) {
        state.collectionCache[isbn] ||= {}
        for (const [systemId, record] of Object.entries(systems)) {
          if (record && (record.status === 'OK' || record.status === 'Cache')) {
            state.collectionCache[isbn][systemId] = record
          }
        }
      }
    })
    if (availabilityAbortController === controller) {
      availabilityAbortController = undefined
      emitAvailabilityUpdate({}, true)
      if (!cancelled) emitProgress('蔵書状況の確認完了')
    }
  }
  return result
}

function cancelAvailability() {
  if (!availabilityAbortController) return false
  availabilityAbortController.abort()
  return true
}

async function moveBooks(isbns, destination) {
  if (!['read', 'delete'].includes(destination)) throw new TypeError('移動先が不正です。')
  const token = await getWishlistToken()
  const endpoint = destination === 'read' ? 'move' : 'delete'
  const payload = destination === 'read'
    ? { move: isbns, from: 'wish', to: 'read' }
    : { delete: isbns, from: 'wish' }
  const response = await calilFetch(`https://calil.jp/api/list/v2/${endpoint}`, {
    method: 'POST',
    headers: {
      'Calil-Yomitai-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  const succeeded = Array.isArray(result.success) ? result.success.map(String) : []
  const failed = Array.isArray(result.fail) ? result.fail : []
  if (failed.length || succeeded.length !== isbns.length) {
    throw new Error('一部の本を更新できませんでした。読みたいリストを再同期してください。')
  }
  await updateState((state) => {
    const removed = new Set(succeeded)
    state.books = state.books.filter((book) => !removed.has(book.id))
  })
  logInfo('wishlist.books-updated', { destination, requestedCount: isbns.length, succeededCount: succeeded.length })
  return loadState()
}

function handleIpc(channel, handler, { trace = false } = {}) {
  ipcMain.handle(channel, async (...args) => {
    const startedAt = Date.now()
    if (trace) logInfo('ipc.started', { channel })
    try {
      const result = await handler(...args)
      if (trace) logInfo('ipc.completed', { channel, durationMs: Date.now() - startedAt })
      return result
    } catch (error) {
      logError('ipc.failed', error, { channel, durationMs: Date.now() - startedAt })
      throw error
    }
  })
}

function registerIpc() {
  handleIpc('state:load', () => loadState())
  handleIpc('state:set-star', async (_event, payload) => {
    const isbn = assertString(payload && payload.isbn, 'ISBN')
    const rate = Number(payload && payload.rate)
    if (!Number.isInteger(rate) || rate < 0 || rate > 3) throw new TypeError('スターの値が不正です。')
    return updateState((state) => {
      if (rate === 0) delete state.stars[isbn]
      else state.stars[isbn] = rate
      return state.stars
    })
  })
  handleIpc('state:save-options', async (_event, options) => {
    const booksPerPage = Number(options && options.booksPerPage)
    if (!Number.isInteger(booksPerPage) || booksPerPage < 5 || booksPerPage > 100) {
      throw new TypeError('1ページの冊数は 5〜100 で指定してください。')
    }
    return updateState((state) => { state.options.booksPerPage = booksPerPage })
  })
  handleIpc('state:clear-local', () => updateState((state) => {
    state.books = []
    state.systems = []
    state.ndc = {}
    state.collectionCache = {}
    state.lastSyncedAt = null
  }), { trace: true })
  handleIpc('calil:open-login', () => openLoginWindow(), { trace: true })
  handleIpc('calil:check-login', async () => {
    try { await getWishlistToken(); return true } catch { return false }
  })
  handleIpc('calil:sync-wishlist', () => syncWishlist(), { trace: true })
  handleIpc('calil:check-availability', (_event, payload) =>
    checkAvailability(
      assertStringArray(payload && payload.isbns, 'ISBN'),
      assertStringArray(payload && payload.systemIds, '図書館ID', 30),
    ), { trace: true })
  handleIpc('calil:cancel-availability', () => cancelAvailability(), { trace: true })
  handleIpc('calil:move-books', (_event, payload) =>
    moveBooks(assertStringArray(payload && payload.isbns, 'ISBN'), payload && payload.destination), { trace: true })
  handleIpc('app:open-external', async (_event, rawUrl) => {
    const url = parseExternalHttpsUrl(
      assertString(rawUrl, 'URL'),
      ['calil.jp', 'ndlsearch.ndl.go.jp'],
    )
    await shell.openExternal(url.toString())
    logInfo('app.external-opened', { hostname: url.hostname })
  })
  handleIpc('app:open-reserve', async (_event, payload) => {
    const isbn = assertString(payload && payload.isbn, 'ISBN')
    const systemId = assertString(payload && payload.systemId, '図書館ID')
    const url = getAuthorizedReserveUrl(await loadState(), isbn, systemId)
    await shell.openExternal(url.toString())
    logInfo('app.reserve-opened', { hostname: url.hostname, systemId })
  })
  handleIpc('app:open-logs', async () => {
    await logger.flush()
    shell.showItemInFolder(logger.filePath)
    return logger.filePath
  }, { trace: true })
  ipcMain.on('log:renderer-error', (_event, payload) => {
    if (!isRecord(payload)) return
    const type = typeof payload.type === 'string' ? payload.type.slice(0, 80) : 'error'
    const message = typeof payload.message === 'string' ? payload.message.slice(0, 4000) : 'Unknown renderer error'
    const stack = typeof payload.stack === 'string' ? payload.stack.slice(0, 12000) : ''
    logError('renderer.error', Object.assign(new Error(message), { stack }), { type })
  })
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus()
    return true
  }
  loginWindow = new BrowserWindow({
    width: 1080,
    height: 800,
    title: 'カーリルにログイン',
    parent: mainWindow,
    webPreferences: {
      partition: CALIL_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: loginWindow,
        webPreferences: {
          partition: CALIL_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      },
    }
    return { action: 'deny' }
  })
  loginWindow.loadURL('https://calil.jp/login?redirect=/list/')
  loginWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    logError('login-window.load-failed', new Error(errorDescription), {
      errorCode,
      endpoint: safeEndpoint(validatedUrl),
    })
  })
  loginWindow.on('closed', () => { loginWindow = null })
  return true
}

async function saveWindowBounds() {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer)
  boundsSaveTimer = undefined
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getNormalBounds()
  await updateState((state) => { state.windowBounds = bounds })
}

function scheduleWindowBoundsSave() {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer)
  boundsSaveTimer = setTimeout(() => {
    void saveWindowBounds().catch((error) => logError('window.bounds-save-failed', error))
  }, 400)
}

async function createWindow() {
  const state = await loadState()
  const savedBounds = isWindowBounds(state.windowBounds) ? state.windowBounds : null
  const restoredBounds = savedBounds
    ? normalizeWindowBounds(savedBounds, screen.getDisplayMatching(savedBounds).workArea)
    : null
  mainWindow = new BrowserWindow({
    width: restoredBounds?.width ?? 1440,
    height: restoredBounds?.height ?? 920,
    ...(restoredBounds ? { x: restoredBounds.x, y: restoredBounds.y } : {}),
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f4f1e9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError('renderer.process-gone', new Error(details.reason), { exitCode: details.exitCode })
  })
  mainWindow.on('unresponsive', () => logWarn('renderer.unresponsive'))
  mainWindow.on('move', scheduleWindowBoundsSave)
  mainWindow.on('resize', scheduleWindowBoundsSave)
  mainWindow.on('close', () => { void saveWindowBounds() })
  mainWindow.on('closed', () => { mainWindow = null })
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else mainWindow.loadURL('http://localhost:5173')
}

async function restartApplication() {
  try {
    await saveWindowBounds()
    await writeQueue
    logInfo('app.restart-requested')
    await logger?.flush()
  } catch (error) {
    console.error('[app.restart-preparation-failed]', error)
  } finally {
    app.relaunch()
    app.exit(0)
  }
}

function createApplicationMenu() {
  const fileMenu = {
    label: 'File',
    submenu: [
      {
        label: '再起動',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: () => { void restartApplication() },
      },
      { type: 'separator' },
      { role: process.platform === 'darwin' ? 'close' : 'quit' },
    ],
  }
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    fileMenu,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ])
}

app.whenReady().then(async () => {
  logger = createLogger({ filePath: path.join(app.getPath('logs'), 'main.log') })
  logInfo('app.started', {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  })
  calilSession = session.fromPartition(CALIL_PARTITION)
  registerIpc()
  Menu.setApplicationMenu(createApplicationMenu())
  await createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

let quittingAfterLogFlush = false
app.on('before-quit', (event) => {
  if (!logger || quittingAfterLogFlush) return
  event.preventDefault()
  quittingAfterLogFlush = true
  saveWindowBounds().catch((error) => logError('window.bounds-save-failed', error)).then(() => {
    logger.info('app.stopped')
    return logger.flush()
  }).finally(() => app.quit())
})
