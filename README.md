# ボッチャスコアボードシステム

ボッチャ（Boccia）競技用のデジタルスコアボードシステムです。

## 📚 ドキュメント

- **[AI_HANDOVER.md](./AI_HANDOVER.md)** - 開発の経緯と現在のバグ状況
- **[SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)** - システム全体の設計書
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - デプロイ前のチェックリスト
- **[SERVER_SETUP_GUIDE.md](./SERVER_SETUP_GUIDE.md)** - サーバーセットアップガイド

## 🚀 クイックスタート

### 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# サーバーの依存関係をインストール
cd server
npm install
cd ..
```

### 開発サーバーの起動

```bash
# ターミナル1: フロントエンド（Vite）
npm run dev
# → http://localhost:5173

# ターミナル2: バックエンド（Express）
cd server
node server.js
# → http://localhost:3001
```

### アクセスURL

#### スタンドアロンモード（ローカルのみ、サーバー不要）
```
タブレット: http://localhost:5173/scoreboard?p=ctrl
ディスプレイ: http://localhost:5173/scoreboard
```

#### 大会モード（サーバー連携）
```
タブレット: http://localhost:5173/event/0-TEST/court/A/scoreboard?p=ctrl
ディスプレイ: http://localhost:5173/event/0-TEST/court/A/scoreboard
```

## 🏗️ ビルド

```bash
# 本番用ビルド
npm run build

# ビルド結果のプレビュー
npm run preview
```

## 🌐 デプロイ

詳細は [SERVER_SETUP_GUIDE.md](./SERVER_SETUP_GUIDE.md) を参照してください。

### 簡易デプロイ（Windows PowerShell）

```powershell
# ビルド
npm run build

# デプロイ
.\deploy.ps1 -Server "ユーザー名@boccia.app"
```

### 簡易デプロイ（Linux/Mac/WSL）

```bash
# deploy.shに実行権限を付与
chmod +x deploy.sh

# ビルド
npm run build

# デプロイ
./deploy.sh ユーザー名@boccia.app
```

## 📦 技術スタック

### フロントエンド
- **React** 19.1.1 - UIフレームワーク
- **React Router** 7.9.3 - ルーティング
- **Vite** 7.1.7 - ビルドツール

### バックエンド
- **Express** 4.x - Webサーバー
- **Node.js** 18+ - ランタイム

### データストレージ
- **JSONファイル** - データ永続化
- **LocalStorage** - ブラウザ内同期

## 🎯 主な機能

### 3) スコアボード入力（タブレット）✅ 実装済み
- スコア入力
- タイマー管理
- 反則記録
- セクション進行管理
- 試合結果承認

### 4) スコアボード表示（ディスプレイ）✅ 実装済み
- リアルタイムスコア表示
- タイマー表示
- 選手情報表示
- エンドスコア履歴

### スタンドアロンモード ✅ 実装済み
- サーバー不要で動作
- LocalStorageのみ使用
- 練習試合やデモに最適

## 📝 開発時の注意事項

### コーディング規約

詳細は [.cursorrules](./.cursorrules) を参照してください。

- コメントはすべて日本語
- スタイルは外部CSSファイルに記述
- CSSクラス名はcamelCase

### データファイル

```
public/data/
├── classDefinitions.json    # クラス定義（共通）
└── {eventId}/               # 大会ごと
    └── court/
        └── {courtId}/
            ├── settings.json # 試合設定
            └── game.json     # 試合進行データ
```

## 🔧 トラブルシューティング

### 開発サーバーが起動しない

```bash
# ポート5173が使用されている場合
npm run dev -- --port 5174
```

### サーバーAPIが404エラー

```bash
# サーバーが起動しているか確認
cd server
node server.js
```

### データが保存されない

- **大会モード**: サーバーが起動しているか確認
- **スタンドアロンモード**: ブラウザのLocalStorageを確認

## 🌟 今後の開発予定

- [ ] 1) 大会管理画面
- [ ] 2) 全コート進捗管理画面
- [ ] 5) グループリーグ結果表示
- [ ] 6) トーナメント結果表示
- [ ] WebSocketによるリアルタイム通知

詳細は [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) を参照してください。

## 📄 ライセンス

未定

## 👥 貢献

バグ報告や機能要望は Issue でお願いします。

---

**プロジェクト開始日**: 2025年
**最終更新**: 2026年1月15日
