import { useEffect, useMemo, useState } from 'react'
import { aggregateStatus, isResolvedRecord, mergeCollectionCache, selectAvailabilityRecord, statusStyle } from './lib/availability'
import { matchesBook } from './lib/search'
import { paginationPages } from './lib/pagination'
import { NDC_TOP, ndcLabel } from './data/ndc'
import type { AppState, AvailabilityRecord, Book, LibrarySystem, MoveDestination, Progress } from './types'

type Notice = { kind: 'info' | 'success' | 'error'; text: string } | null

function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [query, setQuery] = useState('')
  const [starFilter, setStarFilter] = useState<'none' | '1' | '2' | '3'>('none')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [liveRecords, setLiveRecords] = useState<AppState['collectionCache']>({})
  const [checkingIsbns, setCheckingIsbns] = useState<Set<string>>(new Set())
  const [autoCheckAvailability, setAutoCheckAvailability] = useState(false)
  const [sideTab, setSideTab] = useState<'ndc' | 'data'>('ndc')
  const [loginState, setLoginState] = useState<'unknown' | 'yes' | 'no'>('unknown')

  useEffect(() => {
    window.calil.loadState().then(setState).catch((error) => setNotice({ kind: 'error', text: messageOf(error) }))
    window.calil.checkLogin().then((loggedIn) => setLoginState(loggedIn ? 'yes' : 'no'))
    const stopProgress = window.calil.onProgress(setProgress)
    const stopAvailability = window.calil.onAvailabilityUpdate((update) => {
      setLiveRecords((current) => mergeCollectionCache(current, update.books))
      if (update.complete) setCheckingIsbns(new Set())
    })
    const stopNdc = window.calil.onNdcUpdate((update) => {
      if (Object.keys(update.ndc).length) {
        setState((current) => current ? { ...current, ndc: { ...current.ndc, ...update.ndc } } : current)
      }
    })
    return () => {
      stopProgress()
      stopAvailability()
      stopNdc()
    }
  }, [])

  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [query, starFilter])

  const filteredBooks = useMemo(() => {
    if (!state) return []
    return state.books.filter((book) => matchesBook(book, query, {
      stars: state.stars,
      ndc: state.ndc,
      starFilter,
    }))
  }, [state, query, starFilter])

  const booksPerPage = state?.options.booksPerPage ?? 20
  const maxPage = Math.max(1, Math.ceil(filteredBooks.length / booksPerPage))
  const safePage = Math.min(page, maxPage)
  const pageBooks = filteredBooks.slice((safePage - 1) * booksPerPage, safePage * booksPerPage)

  useEffect(() => {
    if (page > maxPage) setPage(maxPage)
  }, [page, maxPage])

  async function sync() {
    setBusy(true)
    setNotice(null)
    try {
      const next = await window.calil.syncWishlist()
      setState(next)
      setAutoCheckAvailability(false)
      setLoginState('yes')
      setNotice({ kind: 'success', text: `${next.books.length}冊の読みたいリストを同期しました。` })
    } catch (error) {
      setNotice({ kind: 'error', text: messageOf(error) })
      setLoginState('no')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function checkAvailability(
    targetIsbns = pageBooks.map((book) => book.id),
    enableAutomaticPageChecks = true,
  ) {
    if (!state || targetIsbns.length === 0 || state.systems.length === 0 || busy) return
    setLiveRecords({})
    setCheckingIsbns(new Set(targetIsbns))
    setBusy(true)
    setNotice(null)
    try {
      await window.calil.checkAvailability(targetIsbns, state.systems.map((system) => system.id))
      setState(await window.calil.loadState())
      if (enableAutomaticPageChecks) setAutoCheckAvailability(true)
    } catch (error) {
      setState(await window.calil.loadState())
      setNotice({ kind: 'error', text: messageOf(error) })
    } finally {
      setBusy(false)
      setProgress(null)
      setCheckingIsbns(new Set())
    }
  }

  function changePage(nextPage: number) {
    if (busy) return
    const nextBooks = filteredBooks.slice((nextPage - 1) * booksPerPage, nextPage * booksPerPage)
    setPage(nextPage)
    window.scrollTo({ top: 0 })
    if (autoCheckAvailability) {
      void checkAvailability(nextBooks.map((book) => book.id), false)
    }
  }

  async function setRating(isbn: string, rate: number) {
    if (!state) return
    setState({ ...state, stars: { ...state.stars, ...(rate ? { [isbn]: rate } : {}) } })
    if (rate === 0) {
      setState((current) => {
        if (!current) return current
        const stars = { ...current.stars }
        delete stars[isbn]
        return { ...current, stars }
      })
    }
    try {
      await window.calil.setStar(isbn, rate)
    } catch (error) {
      setState(await window.calil.loadState())
      setNotice({ kind: 'error', text: messageOf(error) })
    }
  }

  function toggleSelection(isbn: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(isbn)) next.delete(isbn)
      else next.add(isbn)
      return next
    })
  }

  async function moveSelected(destination: MoveDestination) {
    if (!state || selected.size === 0) return
    const label = destination === 'delete' ? '削除' : '読んだリストに移動'
    if (destination === 'delete' && !window.confirm(`${selected.size}冊を読みたいリストから削除しますか？`)) return
    setBusy(true)
    try {
      const next = await window.calil.moveBooks([...selected], destination)
      setState(next)
      setSelected(new Set())
      setNotice({ kind: 'success', text: `${selected.size}冊を${label}しました。` })
    } catch (error) {
      setNotice({ kind: 'error', text: messageOf(error) })
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return <div className="loading-screen"><Spinner /><p>ライブラリを読み込んでいます</p></div>
  }

  const first = filteredBooks.length ? (safePage - 1) * booksPerPage + 1 : 0
  const last = Math.min(safePage * booksPerPage, filteredBooks.length)
  const hasPagination = filteredBooks.length > booksPerPage

  return (
    <div className={`app-shell ${hasPagination ? 'has-pagination' : ''}`}>
      <header className="app-header">
        <button className="brand" onClick={() => { setQuery(''); setStarFilter('none') }}>
          <span className="brand-mark" aria-hidden="true">C<span>＋</span></span>
          <span><strong>Calil Enhancer</strong><small>読みたい本を、借りられる本へ。</small></span>
        </button>
        <div className="header-actions">
          <span className={`login-pill ${loginState}`}><i />{loginState === 'yes' ? 'ログイン済み' : loginState === 'no' ? '未ログイン' : '確認中'}</span>
          <button className="button ghost" onClick={() => window.calil.openLogin()}>カーリルにログイン</button>
          <button className="button primary" disabled={busy} onClick={sync}>読みたいリストを同期</button>
        </div>
      </header>

      <main className="page">
        <section className="search-panel">
          <div className="search-title">
            <div><span className="eyebrow">MY READING LIST</span><h1>次に読む一冊を探す</h1></div>
            <span className="book-total"><strong>{state.books.length}</strong> 冊</span>
          </div>
          <div className="search-controls">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・著者・ndc:913・star:2-3" autoFocus />
              {query && <button onClick={() => setQuery('')} aria-label="検索をクリア">×</button>}
            </label>
            <label className="star-filter"><span>評価</span>
              <select value={starFilter} onChange={(event) => setStarFilter(event.target.value as typeof starFilter)}>
                <option value="none">すべて</option>
                <option value="1">★</option>
                <option value="2">★★</option>
                <option value="3">★★★</option>
              </select>
            </label>
            <button className="button availability-button" disabled={busy || pageBooks.length === 0 || state.systems.length === 0} onClick={() => checkAvailability()}>
              蔵書を確認
            </button>
          </div>
        </section>

        {notice && <div className={`notice ${notice.kind}`}><span>{notice.kind === 'error' ? '!' : '✓'}</span><p>{notice.text}</p><button onClick={() => setNotice(null)}>×</button></div>}
        {busy && progress && <div className="progress-line"><Spinner /><span>{progress.stage}</span>{progress.total > 0 && <small>{progress.current} / {progress.total}</small>}</div>}

        {state.books.length === 0 ? (
          <EmptyState loginState={loginState} busy={busy} onLogin={() => window.calil.openLogin()} onSync={sync} />
        ) : (
          <div className="workspace">
            <section className="results" aria-label="検索結果">
              <div className="results-meta">
                <span>{filteredBooks.length === 0 ? '該当する本はありません' : `${filteredBooks.length}冊中 ${first}–${last}冊`}</span>
                <span className="legend"><i className="dot available" />貸出可 <i className="dot waiting" />貸出中 <i className="dot none" />蔵書なし</span>
              </div>

              {pageBooks.length > 0 && <label className="select-all">
                <input type="checkbox" checked={pageBooks.every((book) => selected.has(book.id))} onChange={(event) => {
                  setSelected((current) => {
                    const next = new Set(current)
                    pageBooks.forEach((book) => event.target.checked ? next.add(book.id) : next.delete(book.id))
                    return next
                  })
                }} /> このページをすべて選択
              </label>}

              <div className="book-list">
                {pageBooks.map((book) => (
                  <BookRow key={book.id} book={book} systems={state.systems} records={state.collectionCache[book.id] ?? {}}
                    liveRecords={liveRecords[book.id] ?? {}} checking={checkingIsbns.has(book.id)}
                    ndc={state.ndc[book.id]} rating={state.stars[book.id] ?? 0} selected={selected.has(book.id)}
                    onToggle={() => toggleSelection(book.id)} onRate={(rate) => setRating(book.id, rate)} />
                ))}
              </div>

              {hasPagination && <Pagination page={safePage} maxPage={maxPage} disabled={busy} onPage={changePage} />}
            </section>

            <Sidebar tab={sideTab} onTab={setSideTab} state={state} onSearchNdc={(code) => setQuery(`ndc:${code}(${ndcLabel(code)})`)} onState={setState} onNotice={setNotice} />
          </div>
        )}
      </main>

      {selected.size > 0 && <div className="selection-bar">
        <strong>{selected.size}冊を選択中</strong>
        <button onClick={() => moveSelected('read')}>読んだリストに移動</button>
        <button className="danger" onClick={() => moveSelected('delete')}>削除</button>
        <button className="close-selection" onClick={() => setSelected(new Set())}>×</button>
      </div>}
    </div>
  )
}

function EmptyState({ loginState, busy, onLogin, onSync }: { loginState: string; busy: boolean; onLogin: () => void; onSync: () => void }) {
  return <section className="empty-state">
    <div className="empty-illustration" aria-hidden="true"><span>本</span><i /><i /><i /></div>
    <span className="eyebrow">WELCOME</span>
    <h2>読みたいリストを取り込みましょう</h2>
    <p>カーリルにログインすると、登録した本と図書館をこのアプリで検索・整理できます。</p>
    <div className="empty-steps">
      <div className={loginState === 'yes' ? 'done' : ''}><b>1</b><span><strong>カーリルにログイン</strong><small>専用ウィンドウで安全にログイン</small></span></div>
      <div><b>2</b><span><strong>読みたいリストを同期</strong><small>本・図書館・NDCをローカルに保存</small></span></div>
      <div><b>3</b><span><strong>蔵書状況をチェック</strong><small>借りられる図書館がひと目でわかる</small></span></div>
    </div>
    <div className="empty-actions"><button className="button ghost" onClick={onLogin}>1. ログイン画面を開く</button><button className="button primary" disabled={busy} onClick={onSync}>2. 同期する</button></div>
  </section>
}

function BookRow({ book, systems, records, liveRecords, checking, ndc, rating, selected, onToggle, onRate }: {
  book: Book
  systems: LibrarySystem[]
  records: Record<string, AvailabilityRecord>
  liveRecords: Record<string, AvailabilityRecord>
  checking: boolean
  ndc?: string
  rating: number
  selected: boolean
  onToggle: () => void
  onRate: (rate: number) => void
}) {
  return <article className={`book-row ${selected ? 'selected' : ''} ${checking ? 'checking' : ''}`}>
    <label className="book-check"><input type="checkbox" checked={selected} onChange={onToggle} /><span /></label>
    <button className="cover-button" onClick={() => openExternal(`https://calil.jp/book/${encodeURIComponent(book.id)}`)} title="カーリルで本を開く">
      <img src={`https://calil.jp/cover/${encodeURIComponent(book.id)}`} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
      <span>BOOK</span>
    </button>
    <div className="book-info">
      <button className="book-title" onClick={() => openExternal(`https://calil.jp/book/${encodeURIComponent(book.id)}`)}>{book.title}</button>
      <button className="author" onClick={() => openExternal(`https://calil.jp/search?q=${encodeURIComponent(`author:${book.author}`)}`)}>{book.author || '著者不明'}</button>
      <div className="book-tags"><span>ISBN {book.id}</span>{ndc && <span className="ndc-chip">NDC {ndc} · {ndcLabel(ndc)}</span>}</div>
      <StarRating value={rating} onChange={onRate} />
    </div>
    <div className="availability-grid">
      {systems.length === 0 ? <div className="no-library">登録図書館がありません</div> : systems.map((system) => {
        const liveRecord = liveRecords[system.id]
        const { record, fromLocalCache } = selectAvailabilityRecord(liveRecord, records[system.id])
        return <SystemAvailability key={system.id} isbn={book.id} system={system} record={record} fromLocalCache={fromLocalCache} checking={checking && !isResolvedRecord(liveRecord)} />
      })}
    </div>
  </article>
}

function SystemAvailability({ isbn, system, record, fromLocalCache, checking }: { isbn: string; system: LibrarySystem; record?: AvailabilityRecord; fromLocalCache: boolean; checking: boolean }) {
  const aggregate = aggregateStatus(record)
  const libraries = record?.libkey ?? {}
  return <div className={`system-card ${record ? aggregate.tone : 'unknown'} ${fromLocalCache ? 'cached' : ''} ${checking ? 'checking' : ''}`}>
    <div className="system-heading"><span className="status-mark">{checking ? <i className="system-spinner" /> : record ? aggregate.mark : '–'}</span><span><strong>{system.name}</strong><small>{record ? aggregate.label : checking ? '確認中' : '未確認'}{fromLocalCache ? ' · ローカルキャッシュ' : ''}{checking && record ? ' · 更新中' : ''}</small></span></div>
    {record && <div className="library-statuses">
      {system.libraries.map((library) => {
        const style = statusStyle(libraries[library])
        return <span key={library} className={style.tone} title={`${library}: ${style.label}`}>{library}<b>{style.mark}</b></span>
      })}
    </div>}
    {record?.reserveurl && <button className="reserve-link" onClick={() => openReservePage(isbn, system.id)}>予約ページ ↗</button>}
  </div>
}

function StarRating({ value, onChange }: { value: number; onChange: (rate: number) => void }) {
  return <div className="star-rating" aria-label={`評価 ${value}`}>
    {[1, 2, 3].map((rate) => <button key={rate} className={rate <= value ? 'filled' : ''} onClick={() => onChange(rate === value ? 0 : rate)} title={rate === value ? '評価を外す' : `評価 ${rate}`}>★</button>)}
  </div>
}

function Sidebar({ tab, onTab, state, onSearchNdc, onState, onNotice }: {
  tab: 'ndc' | 'data'
  onTab: (tab: 'ndc' | 'data') => void
  state: AppState
  onSearchNdc: (code: string) => void
  onState: (state: AppState) => void
  onNotice: (notice: Notice) => void
}) {
  const [perPage, setPerPage] = useState(state.options.booksPerPage)
  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    state.books.forEach((book) => {
      const code = state.ndc[book.id]
      if (!code) return
      for (let length = 1; length <= 3; length += 1) {
        const prefix = code.slice(0, length)
        result[prefix] = (result[prefix] ?? 0) + 1
      }
    })
    return result
  }, [state.books, state.ndc])

  const presentCodes = Object.keys(counts).filter((code) => code.length === 3).sort()

  async function savePerPage() {
    try {
      onState(await window.calil.saveOptions({ booksPerPage: perPage }))
      onNotice({ kind: 'success', text: '表示冊数を保存しました。' })
    } catch (error) { onNotice({ kind: 'error', text: messageOf(error) }) }
  }

  async function clearData() {
    if (!window.confirm('読みたいリスト・蔵書キャッシュ・NDCをこのコンピュータから削除しますか？')) return
    try {
      onState(await window.calil.clearLocalData())
      onNotice({ kind: 'success', text: 'ローカルデータを削除しました。スターと設定は残しています。' })
    } catch (error) { onNotice({ kind: 'error', text: messageOf(error) }) }
  }

  async function openLogs() {
    try {
      const logPath = await window.calil.openLogs()
      onNotice({ kind: 'info', text: `診断ログをFinderに表示しました: ${logPath}` })
    } catch (error) { onNotice({ kind: 'error', text: messageOf(error) }) }
  }

  return <aside className="sidebar">
    <div className="sidebar-tabs"><button className={tab === 'ndc' ? 'active' : ''} onClick={() => onTab('ndc')}>NDC 分類</button><button className={tab === 'data' ? 'active' : ''} onClick={() => onTab('data')}>データ・設定</button></div>
    {tab === 'ndc' ? <div className="ndc-panel">
      <p>分類から本を絞り込む</p>
      <div className="ndc-top-list">
        {Object.entries(NDC_TOP).map(([code, label]) => <button key={code} onClick={() => onSearchNdc(code)}><b>{code}</b><span>{label}</span><em>{counts[code] ?? 0}</em></button>)}
      </div>
      {presentCodes.length > 0 && <div className="ndc-detail"><h3>リスト内の細分類</h3>{presentCodes.map((code) => <button key={code} onClick={() => onSearchNdc(code)}><span>{code}</span><small>{ndcLabel(code)}</small><em>{counts[code]}</em></button>)}</div>}
    </div> : <div className="data-panel">
      <section><h3>同期情報</h3><dl><div><dt>読みたい本</dt><dd>{state.books.length} 冊</dd></div><div><dt>登録図書館</dt><dd>{state.systems.length} 件</dd></div><div><dt>最終同期</dt><dd>{state.lastSyncedAt ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.lastSyncedAt)) : '未同期'}</dd></div></dl></section>
      <section><h3>表示設定</h3><label className="per-page"><span>1ページの冊数</span><input type="number" min="5" max="100" value={perPage} onChange={(event) => setPerPage(event.target.valueAsNumber)} /></label><button className="button small" onClick={savePerPage}>設定を保存</button></section>
      <section className="diagnostics"><h3>診断ログ</h3><p>通信先、HTTPステータス、処理時間、エラーを記録します。Cookieやトークンは記録しません。</p><button className="button small" onClick={openLogs}>ログをFinderで表示</button></section>
      <section className="danger-zone"><h3>ローカルデータ</h3><p>本・蔵書キャッシュ・NDCを削除します。カーリル上のデータは変わりません。</p><button onClick={clearData}>ローカルデータを削除</button></section>
    </div>}
  </aside>
}

function Pagination({ page, maxPage, disabled, onPage }: { page: number; maxPage: number; disabled: boolean; onPage: (page: number) => void }) {
  const pages = paginationPages(page, maxPage)
  return <nav className="pagination" aria-label="ページ">
    <button className="page-direction" disabled={disabled || page === 1} onClick={() => onPage(page - 1)}>← 前へ</button>
    {pages.map((value, index) => <span key={value}>{index > 0 && value - pages[index - 1] > 1 && <i>…</i>}<button disabled={disabled || value === page} className={value === page ? 'active' : ''} onClick={() => onPage(value)}>{value}</button></span>)}
    <button className="page-direction" disabled={disabled || page === maxPage} onClick={() => onPage(page + 1)}>次へ →</button>
    <label className="page-jump"><span>ページ</span><select aria-label="移動先ページ" value={page} disabled={disabled} onChange={(event) => onPage(Number(event.target.value))}>{Array.from({ length: maxPage }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><small>/ {maxPage}</small></label>
  </nav>
}

function Spinner() { return <span className="spinner" aria-hidden="true" /> }

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

function openExternal(url: string) {
  void window.calil.openExternal(url).catch((error) => window.alert(messageOf(error)))
}

function openReservePage(isbn: string, systemId: string) {
  void window.calil.openReservePage(isbn, systemId).catch((error) => window.alert(messageOf(error)))
}

export default App
