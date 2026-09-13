# Calil Enhancer

カーリルの「読みたいリスト」を、蔵書状況と一緒に検索・整理できるデスクトップアプリです。

> [!IMPORTANT]
> Calil Enhancerはカーリル公式ではない非公式アプリです。カーリルの運営元とは関係ありません。

現在のバージョンは `0.1.0` です。macOS、Windows、Linux向けのインストーラーはGitHub Releasesから配布します。

## 主な機能

- カーリルへのログインと「読みたいリスト」の同期
- タイトル・著者名によるキーワード検索
- NDC分類と3段階評価による絞り込み
- 図書館システムまたは分館ごとの蔵書有フィルター
- 複数図書館の蔵書状況を一覧へ逐次反映
- ローカルキャッシュと今回取得した結果の表示区別
- 本への評価設定
- 選択した本を「読んだリスト」へ移動、または「読みたいリスト」から削除
- カーリルの書籍ページと図書館の予約ページを外部ブラウザで表示
- 1ページあたり5〜100冊の表示件数設定
- ウィンドウの位置とサイズの保存・復元
- 通信やアプリエラーを調査するための診断ログ

## 使い方

1. 「カーリルにログイン」を押し、表示されたウィンドウでログインします。
2. 「読みたいリストを同期」を押します。
3. 「蔵書を確認」を押すと、現在のページにある本の蔵書状況を取得します。

一度蔵書確認を開始すると、以後のページ移動時にも表示中の本を自動確認します。取得中にページを移動した場合は、進行中の取得をキャンセルして移動先ページの取得へ切り替えます。

蔵書状況は20冊ずつ処理され、取得できた結果から一覧へ反映されます。完了した結果はローカルへ保存され、次回起動時にもキャッシュとして表示されます。

## 検索と絞り込み

検索欄では、タイトル・著者名に加えて次の検索条件を使用できます。

```text
ndc:913
star:2
star:1-2
```

- `ndc:` は指定したNDC分類で始まる本を検索します。
- `star:` は評価を指定します。ハイフンを使うと範囲検索になります。
- 複数の条件とキーワードは組み合わせて使用できます。
- サイドバーのNDC分類をクリックして絞り込むこともできます。

「蔵書有」では、保存済みのローカルキャッシュを対象に図書館システム全体または分館を選択できます。「蔵書なし」と未確認の本は除外され、貸出中・館内のみ・準備中などは蔵書有として扱われます。

## 必要なもの

- Node.js
- npm
- カーリルのアカウント
- インターネット接続

## 開発

依存パッケージをインストールします。

```bash
npm install
```

ViteとElectronを開発モードで起動します。

```bash
npm run dev
```

## テストとビルド

```bash
npm test
npm run build
```

配布前の展開済みアプリを `release` に生成します。

```bash
npm run package
```

インストーラーを生成します。

```bash
npm run dist
```

## CI・リリース・Webサイト

- `.github/workflows/ci.yml`: `main`へのpushとPull Requestでテスト・ビルドを実行
- `.github/workflows/release.yml`: `v0.1.0`のようなタグからmacOS、Windows、Linux版を作成し、GitHub Releaseへ添付
- `.github/workflows/pages.yml`: `website/`をGitHub Pagesへ公開

GitHub Pagesを初めて公開するときは、リポジトリの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択してください。以後は`main`上のWebサイト変更が自動公開されます。

リリースするタグは`package.json`のバージョンと一致させます。

```bash
git tag v0.1.0
git push origin main v0.1.0
```

CIで生成するインストーラーはコード署名されていません。一般配布時は、各OS向けの署名証明書をGitHub Actionsへ設定してください。

macOS用ICNSを `build/icon.png` から再生成する場合は、macOS上で次を実行します。

```bash
npm run icon:mac
```

## データ保存

本、登録図書館、評価、NDC、蔵書キャッシュ、表示設定、ウィンドウ位置はElectronの `userData` ディレクトリにある `calil-enhancer-data.json` へ保存されます。

macOSでの標準的な保存先は次のとおりです。

```text
~/Library/Application Support/calil-enhancer-electron/calil-enhancer-data.json
```

カーリルのログイン情報は専用の永続セッションで管理されます。React側からCookieへ直接アクセスすることはできません。

「データ・設定」からローカルデータを削除できます。この操作では、本、図書館、NDC、蔵書キャッシュ、最終同期日時を削除し、評価と表示設定は残します。カーリル上のデータは変更しません。

## 診断ログ

「データ・設定」→「ログをFinderで表示」からログファイルを開けます。

ログには通信先、HTTPステータス、処理時間、キャンセル、IPCエラー、未処理エラーなどをJSON Lines形式で記録します。Cookie、認証トークン、APIキー、リクエスト本文は記録しません。

ログは2MBごとにローテーションし、最大3世代まで保持します。macOSでの標準的な保存先は次のとおりです。

```text
~/Library/Logs/calil-enhancer-electron/main.log
```

## 技術構成

- Electron
- React
- TypeScript
- Vite
- Vitest
- electron-builder

主要なディレクトリは次のとおりです。

```text
electron/  Electronメインプロセス、preload、通信、永続化、ログ
src/       React UI、検索、NDC、蔵書表示
build/     アプリアイコン
scripts/   ビルド補助スクリプト
```
