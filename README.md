# Calil Enhancer

Firefox 拡張版 Calil Enhancer 1.2 を Electron + React に移植したデスクトップアプリです。

## 開発

```bash
npm install
npm run dev
```

## ビルドとテスト

```bash
npm test
npm run build
npm run package
```

初回はアプリ内の「カーリルにログイン」からログインし、その後「読みたいリストを同期」を実行します。ログイン用ウィンドウと API 通信は同じ永続セッションを利用します。

データは Electron の userData 配下に保存されます。カーリルのログイン Cookie は React からアクセスできません。

## 診断ログ

「データ・設定」→「ログをFinderで表示」から実行ログを開けます。通信先（クエリ文字列を除く）、HTTPステータス、処理時間、IPCエラー、Reactの未処理エラーをJSON Lines形式で記録します。

ログは2MBごとに最大3世代までローテーションします。Cookie、認証トークン、APIキー、リクエスト本文は記録しません。
