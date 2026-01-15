# ボッチャ大会管理システム - システム設計書

## 📋 目次
1. [システム全体像](#システム全体像)
2. [機能構成](#機能構成)
3. [システム運用フロー](#システム運用フロー)
4. [アーキテクチャ設計](#アーキテクチャ設計)
5. [URL構造](#url構造)
6. [データ同期戦略](#データ同期戦略)
7. [運用パターン](#運用パターン)
8. [実装の優先順位](#実装の優先順位)
9. [技術スタック](#技術スタック)
10. [デプロイ環境](#デプロイ環境)

---

## システム全体像

### 6つの機能モジュール

```
┌────────────────────────────────────────────────────────┐
│                 ボッチャ大会管理システム                │
└────────────────────────────────────────────────────────┘

1) 大会管理画面         ← 大会の基本情報設定（管理者）
2) 全コート進捗管理画面  ← 試合スケジュール管理（審判長）
3) スコア・タイマー入力  ← コートごとのスコア入力（審判）★実装済み
4) スコア・タイマー表示  ← 大型ディスプレイ表示（観客）★実装済み
5) グループリーグ結果    ← リアルタイム結果表示
6) トーナメント結果      ← トーナメント表表示
```

**現在の開発状況**:
- ✅ 3) スコアボード入力機能（タブレット）
- ✅ 4) スコアボード表示機能（ディスプレイ）
- 🔄 1), 2), 5), 6) は未実装

---

## 機能構成

### 1) 大会管理画面
**目的**: 大会の基本設定を管理者が入力

**機能**:
- 大会名、開催日時、会場情報
- クラス分類（BC1, BC2, BC3, BC4, Pair, Team）
- 選手登録（名前、国、クラス、写真）
- 試合形式設定（エンド数、タイマー設定）
- コート設定（コート数、名称）

**使用デバイス**: ノートPC（管理者用）

**データ生成**: `public/data/{eventId}/init.json`

---

### 2) 全コート進捗管理画面
**目的**: 全コートのタイムスケジュールと試合進行を管理

**機能**:
- タイムスケジュール表示・編集
- 各コートの現在の試合状況表示
- 次の試合を各コートに割当
- 試合結果の確認・承認
- 全コートの進捗状況一覧

**使用デバイス**: ノートPC（審判長用）

**データ管理**:
- 読込: `public/data/{eventId}/schedule.json`
- 読込: `public/data/{eventId}/court/{courtId}/game.json`（各コート）
- 通知: WebSocketで各コートに試合割当を通知

---

### 3) スコア・タイマー入力（Ctrlモード）
**目的**: 審判がスコアとタイマーを操作

**機能**: ✅ 実装済み
- スコア入力（赤・青）
- タイマー管理（個人タイマー、ウォームアップ、インターバル）
- 反則記録（ペナルティボール、イエローカード、レッドカード）
- タイムアウト管理
- セクション進行管理
- 試合結果承認

**使用デバイス**: タブレット（審判用）

**URL**: `https://boccia.app/event/{eventId}/court/{courtId}/scoreboard?p=ctrl`

**データ管理**:
- 保存先: `public/data/{eventId}/court/{courtId}/game.json`
- ローカル: LocalStorage（同一デバイスの4)と同期）

---

### 4) スコア・タイマー表示（Viewモード）
**目的**: 観客向けにスコアとタイマーを表示

**機能**: ✅ 実装済み
- スコア表示（赤・青）
- タイマー表示
- 選手情報表示（名前、国旗、写真）
- エンドスコア履歴
- 反則カード表示

**使用デバイス**: 大型ディスプレイ（観客向け）

**URL**: `https://boccia.app/event/{eventId}/court/{courtId}/scoreboard`

**データ管理**:
- 読込元: LocalStorage（3)と同期）
- フォールバック: `game.json`から読込

---

### 5) グループリーグ結果表示
**目的**: グループリーグの結果をリアルタイム表示

**機能**:
- グループ別の順位表
- 勝敗数、得失点差
- 試合結果一覧
- 自動更新（Polling）

**使用デバイス**: 大型ディスプレイ（観客向け）

**URL**: `https://boccia.app/event/{eventId}/results/group`

**データ管理**:
- 読込: `public/data/{eventId}/court/*/game.json`（全コート）
- 更新: 5秒ごとにPolling

---

### 6) トーナメント結果表示
**目的**: トーナメント表をリアルタイム表示

**機能**:
- トーナメント表（ブラケット形式）
- 試合結果の反映
- 次の対戦カード表示
- 自動更新（Polling）

**使用デバイス**: 大型ディスプレイ（観客向け）

**URL**: `https://boccia.app/event/{eventId}/results/tournament`

**データ管理**:
- 読込: `public/data/{eventId}/tournament.json`
- 更新: 5秒ごとにPolling

---

## システム運用フロー

### 標準的な運用手順

```
【大会開始前】
1) 大会管理画面で大会情報を入力
   ↓
   init.json, schedule.json 生成

【大会当日】
2) 進捗管理画面でタイムスケジュール1番目の試合を選択
   ↓ WebSocket/Polling で通知
3) タブレット（各コート）に試合情報が反映
   ↓ 同一デバイス内でLocalStorage同期
4) ディスプレイに試合情報が表示される

【試合中】
3) 審判がタブレットでスコア・タイマーを操作
   ↓ LocalStorageで即時同期
4) ディスプレイに結果が反映（遅延なし）
   ↓ 定期的にgame.jsonに保存
2) 進捗管理画面に結果が反映

【試合終了後】
3) タブレットで結果承認
   ↓ game.jsonに最終結果を保存
2) 進捗管理画面で結果確認
   ↓
5) グループリーグ結果表示に反映
6) トーナメント表に反映
   ↓
2) 進捗管理画面で次の試合を選択（繰り返し）
```

---

## アーキテクチャ設計

### システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                     VPSサーバー (boccia.app)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  1) 大会管理  │  │  2) 進捗管理  │  │ 5)6) 結果表示 │      │
│  │     画面      │  │     画面      │  │     画面      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│              ┌─────────────▼─────────────┐                   │
│              │   WebSocket / SSE サーバー │                   │
│              │   (リアルタイム通知)       │                   │
│              └─────────────┬─────────────┘                   │
│                            │                                 │
│              ┌─────────────▼─────────────┐                   │
│              │    Express API サーバー    │                   │
│              │  (JSONファイル管理)        │                   │
│              └─────────────┬─────────────┘                   │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ HTTPS
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼────────┐       ┌───────────▼───────────┐
    │  3) タブレット    │       │  4) ディスプレイ       │
    │  (スコア入力)     │◄──────┤  (スコア表示)         │
    │  ctrlモード       │ Local │  viewモード           │
    └───────────────────┘Storage└───────────────────────┘
```

### レイヤー構成

```
┌─────────────────────────────────────┐
│     プレゼンテーション層              │
│  (React コンポーネント)              │
├─────────────────────────────────────┤
│     ビジネスロジック層                │
│  (カスタムフック、ユーティリティ)     │
├─────────────────────────────────────┤
│     データ同期層                     │
│  (useDataSync, LocalStorage)        │
├─────────────────────────────────────┤
│     API通信層                        │
│  (Express REST API)                 │
├─────────────────────────────────────┤
│     データ永続化層                   │
│  (JSONファイル)                      │
└─────────────────────────────────────┘
```

---

## URL構造

### 大会モード（サーバー連携あり）

```
# 管理・運営用画面
https://boccia.app/event/{eventId}/admin
https://boccia.app/event/{eventId}/progress

# コートごとのスコアボード
https://boccia.app/event/{eventId}/court/{courtId}/scoreboard?p=ctrl  // タブレット
https://boccia.app/event/{eventId}/court/{courtId}/scoreboard         // ディスプレイ

# 結果表示
https://boccia.app/event/{eventId}/results/group      // グループリーグ
https://boccia.app/event/{eventId}/results/tournament // トーナメント
```

**例**:
```
https://boccia.app/event/2026-tokyo/court/A/scoreboard?p=ctrl
https://boccia.app/event/2026-tokyo/results/group
```

### スタンドアロンモード（ローカルのみ）

```
# スコアボード（サーバーに保存しない）
https://boccia.app/scoreboard?p=ctrl  // タブレット
https://boccia.app/scoreboard         // ディスプレイ
```

**動作**:
- LocalStorageのみ使用
- game.jsonには保存しない
- 練習試合やデモンストレーション向け

**注意**: データは保存されません（ブラウザのキャッシュクリアで消失）

---

## データ同期戦略

### 同期方式の選択

| 接続                        | 方式         | 頻度      | 理由                           |
|----------------------------|-------------|-----------|-------------------------------|
| 1)管理 → 2)進捗             | WebSocket   | 即時      | 設定変更を即座に反映            |
| 2)進捗 → 3)タブレット       | WebSocket   | 即時      | 試合割当を即座に通知            |
| 3)タブレット ↔ 4)ディスプレイ | LocalStorage| リアルタイム| 同一デバイス内で高速・確実      |
| 3)タブレット → サーバー     | Polling     | 3秒ごと    | スコア更新を定期的に保存        |
| 5)6)結果表示 ← サーバー     | Polling     | 5秒ごと    | 結果を定期的に取得             |

### 推奨：WebSocket + Polling のハイブリッド方式

**WebSocketを使用する場面**:
- 試合割当の通知（2 → 3）
- 大会設定の即時反映（1 → 2）

**Pollingを使用する場面**:
- スコアデータの定期保存（3 → サーバー）
- 結果表示の定期更新（サーバー → 5, 6）

**LocalStorageを使用する場面**:
- タブレット ↔ ディスプレイ（3 ↔ 4）

### データフロー詳細

#### 試合開始時
```
2) 進捗管理画面
  ↓ POST /api/court/assign
  ├─ WebSocket通知（優先）
  └─ 3) はPollingでも取得（フォールバック）
       ↓ LocalStorage更新
       4) ディスプレイに即時反映
```

#### スコア更新時
```
3) タブレット
  ├─ LocalStorage更新（即時）
  │    ↓
  │    4) ディスプレイに即時反映
  │
  └─ game.json保存（3秒ごと）
       ↓ API: PUT /api/data/{eventId}/court/{courtId}/game
       ├─ 2) 進捗管理画面がPolling取得
       └─ 5)6) 結果表示がPolling取得
```

---

## 運用パターン

### パターンA: フル機能モード（推奨）

**環境**: VPSサーバーあり、安定したネットワーク

**使用機能**: 1) ～ 6) すべて

**データフロー**:
```
1) 大会管理 → 2) 進捗管理 → 3) タブレット ↔ 4) ディスプレイ
                                ↓
                           5)6) 結果表示
```

**メリット**:
- 全機能が利用可能
- リアルタイムな結果表示
- 複数コートの一元管理

---

### パターンB: 簡易モード（予算制約時）

**環境**: 3)4)のみ運用、後から結果を手動で統合

**使用機能**: 3) タブレット、4) ディスプレイ

**データフロー**:
```
3) タブレット ↔ 4) ディスプレイ
     ↓ (試合後)
   game.jsonをUSBで回収
     ↓
2) 進捗管理画面で手動インポート
     ↓
5)6) 結果表示
```

**メリット**:
- 初期コストが低い
- ネットワーク不要（各コート独立）
- 段階的に機能追加可能

---

### パターンC: スタンドアロンモード（練習・トラブル時）

**環境**: ネットワーク障害時、練習試合、デモンストレーション

**使用機能**: 3) タブレット、4) ディスプレイ（ローカルのみ）

**URL**: `https://boccia.app/scoreboard?p=ctrl`

**データフロー**:
```
3) タブレット ↔ 4) ディスプレイ (LocalStorageのみ)
```

**メリット**:
- ネットワーク不要
- サーバー障害の影響を受けない
- オフライン環境でも動作
- 設定が簡単（URLアクセスのみ）

**用途**:
- 練習試合
- デモンストレーション
- システムの動作確認
- ネットワーク障害時の緊急対応

**注意事項**:
- ⚠️ データはLocalStorageのみに保存されます
- ⚠️ ブラウザのキャッシュをクリアするとデータが消えます
- ⚠️ 本番の大会では必ず「大会モード」を使用してください

**実装要件**:
- `App.jsx`に`/scoreboard`ルート追加
- `useDataSync.js`でスタンドアロンモード判定（`!id || !court`）
- game.json保存のスキップ処理

**UI**:
- 大会モードと全く同じ見た目・操作感
- 警告表示なし（ユーザーは結果記録を意識しない）

---

## 実装の優先順位

### フェーズ1: 基本機能（✅ 完了）

```
✅ 3) スコアボード入力機能（タブレット）
✅ 4) スコアボード表示機能（ディスプレイ）
✅ LocalStorageによる3)4)間の同期
✅ game.jsonへの保存機能
```

### フェーズ2: スタンドアロンモード（次のステップ）

```
□ スタンドアロンモード実装
  - App.jsxにルート追加
  - useDataSync.jsの修正
  - game.json保存の条件分岐
```

**開発期間**: 30分〜1時間

**設計方針**: 
- 極限までシンプルに
- UI変更なし（大会モードと全く同じ見た目・操作感）
- インポート/エクスポート機能なし
- 警告表示なし（審判は結果記録を意識しないため）

### フェーズ3: 結果表示機能

```
□ 5) グループリーグ結果表示画面
  - 順位表コンポーネント
  - 試合結果一覧
  - Pollingによる自動更新

□ 6) トーナメント結果表示画面
  - トーナメント表コンポーネント
  - ブラケット表示
  - Pollingによる自動更新
```

**開発期間**: 2-3週間

### フェーズ4: 進捗管理機能

```
□ 2) 全コート進捗管理画面
  - タイムスケジュール表示
  - 試合割当機能
  - 全コートの状況一覧
  - Pollingによるデータ取得
```

**開発期間**: 2週間

### フェーズ5: 大会管理機能

```
□ 1) 大会管理画面
  - 大会基本情報入力
  - 選手登録
  - クラス設定
  - コート設定
  - init.json生成
```

**開発期間**: 2週間

### フェーズ6: リアルタイム通信（高度な機能）

```
□ WebSocketサーバー実装
  - Socket.io導入
  - 試合割当通知
  - リアルタイム更新

□ Pollingの最適化
  - 差分取得
  - キャッシュ戦略
```

**開発期間**: 1-2週間

---

## 技術スタック

### フロントエンド

```javascript
{
  "react": "19.1.1",           // UIフレームワーク
  "react-router-dom": "7.9.3", // ルーティング
  "vite": "7.1.7"              // ビルドツール
}
```

**将来的な追加候補**:
- `socket.io-client` - WebSocket通信
- `react-query` - データフェッチングの最適化
- `zustand` - 状態管理（Reduxの軽量版）

### バックエンド

```javascript
{
  "express": "^4.x",    // Webサーバー
  "cors": "^2.x",       // CORS対応
  "fs-extra": "^11.x"   // ファイル操作
}
```

**将来的な追加候補**:
- `socket.io` - WebSocketサーバー
- `pm2` - プロセス管理
- `helmet` - セキュリティ強化

### データストレージ

**現在**: JSONファイル
- 小規模（〜10コート）に最適
- バックアップが容易
- デプロイが簡単

**将来の選択肢**:
- **SQLite**: 10〜50コート規模
- **PostgreSQL/MySQL**: 50コート以上の大規模大会

---

## デプロイ環境

### エックスサーバーVPSでの構成

#### サーバー環境

```bash
# OS: Ubuntu 20.04 / 22.04 推奨
# Node.js: v18以上
# メモリ: 2GB以上推奨
# ストレージ: 20GB以上
```

#### ディレクトリ構成

```
/var/www/boccia-app/
├── dist/               # Viteビルド後の静的ファイル
│   ├── index.html
│   ├── assets/
│   └── data/          # JSONファイル（シンボリックリンク）
├── server/            # Expressサーバー
│   ├── server.js
│   ├── package.json
│   └── node_modules/
└── data/              # JSONファイル本体
    └── {eventId}/
        ├── init.json
        ├── schedule.json
        └── court/
```

#### Nginx設定

```nginx
server {
    listen 443 ssl http2;
    server_name boccia.app;

    # SSL証明書（Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/boccia.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/boccia.app/privkey.pem;

    # 静的ファイル（React SPA）
    location / {
        root /var/www/boccia-app/dist;
        try_files $uri $uri/ /index.html;
    }

    # APIエンドポイント
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # データファイル（直接アクセス）
    location /data/ {
        root /var/www/boccia-app/dist;
        add_header Cache-Control "no-cache, must-revalidate";
    }
}

# HTTPからHTTPSへリダイレクト
server {
    listen 80;
    server_name boccia.app;
    return 301 https://$host$request_uri;
}
```

#### PM2設定（プロセス管理）

```json
{
  "name": "boccia-api",
  "script": "/var/www/boccia-app/server/server.js",
  "instances": 1,
  "exec_mode": "fork",
  "watch": false,
  "max_memory_restart": "500M",
  "env": {
    "NODE_ENV": "production",
    "PORT": 3001
  },
  "error_file": "/var/log/pm2/boccia-api-error.log",
  "out_file": "/var/log/pm2/boccia-api-out.log",
  "log_date_format": "YYYY-MM-DD HH:mm:ss Z"
}
```

起動コマンド:
```bash
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```

#### デプロイスクリプト

```bash
#!/bin/bash
# deploy.sh

# ビルド
npm run build

# サーバーにアップロード
rsync -avz --delete dist/ user@boccia.app:/var/www/boccia-app/dist/
rsync -avz server/ user@boccia.app:/var/www/boccia-app/server/

# サーバー側でNode.js再起動
ssh user@boccia.app "cd /var/www/boccia-app/server && npm install --production && pm2 restart boccia-api"
```

#### セキュリティ設定

```bash
# ファイアウォール設定
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# データディレクトリの権限設定
chown -R www-data:www-data /var/www/boccia-app/data
chmod -R 755 /var/www/boccia-app/data

# Let's Encrypt SSL証明書取得
certbot --nginx -d boccia.app
```

---

## データ構造

### ディレクトリ構造

```
public/data/
├── classDefinitions.json    # クラス定義（共通）
└── {eventId}/               # 大会ごと
    ├── init.json            # 大会基本設定
    ├── schedule.json        # タイムスケジュール
    ├── tournament.json      # トーナメント表
    ├── classes/             # クラスごとのデータ
    │   └── {className}/
    │       ├── players.json # 選手一覧
    │       └── results.json # 結果一覧
    └── court/               # コートごと
        └── {courtId}/
            ├── settings.json # 試合設定（固定）
            └── game.json     # 試合進行（動的）
```

### 主要なデータファイル

#### `init.json` - 大会基本設定
```json
{
  "eventName": "2026東京オープン",
  "date": "2026-06-15",
  "venue": "東京体育館",
  "courts": ["A", "B", "C", "D"],
  "classes": ["BC1", "BC2", "BC3", "BC4"],
  "match": {
    "totalEnds": 4,
    "warmup": "simultaneous",
    "interval": "enabled",
    "rules": "worldBoccia",
    "resultApproval": "enabled",
    "tieBreak": "finalShot"
  }
}
```

#### `schedule.json` - タイムスケジュール
```json
{
  "schedule": [
    {
      "id": "match-001",
      "time": "09:00",
      "court": "A",
      "classification": "IND BC4 Male",
      "red": { "name": "選手A", "country": "jp" },
      "blue": { "name": "選手B", "country": "kr" },
      "status": "scheduled" // scheduled | in_progress | completed
    }
  ]
}
```

#### `game.json` - 試合進行データ
```json
{
  "match": {
    "sectionID": 3,
    "section": "end1",
    "end": 1,
    "totalEnds": 4
  },
  "red": {
    "score": 2,
    "scores": [
      { "end": 1, "score": 2 }
    ],
    "time": 270000,
    "isRunning": false
  },
  "blue": {
    "score": 0,
    "scores": [
      { "end": 1, "score": 0 }
    ],
    "time": 270000,
    "isRunning": false
  },
  "lastUpdated": "2026-06-15T09:15:30Z"
}
```

---

## 今後の拡張性

### 段階的な機能追加

```
フェーズ1 ✅ スコアボード（3, 4）
    ↓
フェーズ2 □ スタンドアロンモード
    ↓
フェーズ3 □ 結果表示（5, 6）
    ↓
フェーズ4 □ 進捗管理（2）
    ↓
フェーズ5 □ 大会管理（1）
    ↓
フェーズ6 □ WebSocketによるリアルタイム通信
```

### 将来的な機能候補

- **統計機能**: 選手ごとの成績、勝率、平均得点
- **ライブストリーミング連携**: YouTubeライブへのスコア表示オーバーレイ
- **モバイルアプリ**: ネイティブアプリ化（React Native）
- **多言語対応**: 英語、中国語、韓国語など
- **アクセシビリティ**: 音声読み上げ、ハイコントラストモード
- **データ分析**: 試合データの分析ダッシュボード
- **データバックアップ**: スタンドアロンモードのエクスポート/インポート機能（必要に応じて）

---

## 参考資料

### 関連ドキュメント
- [AI_HANDOVER.md](./AI_HANDOVER.md) - 開発の経緯と現在のバグ状況
- [README.md](./README.md) - セットアップ手順
- [.cursorrules](./.cursorrules) - コーディング規約

### 外部リソース
- [World Boccia 公式ルール](https://www.worldboccia.org/)
- [React公式ドキュメント](https://react.dev/)
- [Express公式ドキュメント](https://expressjs.com/)

---

## 更新履歴

| 日付       | 内容                           | 担当者 |
|-----------|-------------------------------|-------|
| 2026-01-15 | 初版作成                       | AI    |

---

**このドキュメントは開発の進捗に応じて随時更新してください。**
