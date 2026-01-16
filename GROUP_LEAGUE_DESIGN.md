# グループリーグ表示機能 - 設計書

## 📋 目次
1. [概要](#概要)
2. [表示形式](#表示形式)
3. [データ構造](#データ構造)
4. [UIコンポーネント設計](#uiコンポーネント設計)
5. [参考資料](#参考資料)

---

## 概要

### 目的
グループリーグの試合結果を総当たり表（マトリックス形式）で表示し、順位を自動計算・表示する機能。

### 対応する試合形式
- **個人戦**: BC1, BC2, BC3, BC4
- **ペア戦**: Pair BC3, Pair BC4
- **チーム戦**: Team BC1/BC2, Team Friendly

### 主な機能
- 総当たり表（対戦マトリックス）の表示
- 順位表の表示
- リアルタイム更新（Polling: 5秒ごと）
- 複数グループの同時表示

---

## 表示形式

### 1. 総当たり表（マトリックス形式）

```
┌─────────────────────────────────────────────────────────────┐
│                    BC4 Male - Group A                        │
├──────────┬──────┬──────┬──────┬──────┬────┬────┬────┬────┤
│          │選手A  │選手B  │選手C  │選手D  │勝敗│得失│総得│順位│
├──────────┼──────┼──────┼──────┼──────┼────┼────┼────┼────┤
│ 選手A    │  ×   │ 1-0  │ 2-1  │ 3-0  │ 3  │ +5 │ 6  │ 1  │
├──────────┼──────┼──────┼──────┼──────┼────┼────┼────┼────┤
│ 選手B    │ 0-1  │  ×   │ 0-4  │ 2-1  │ 1  │ -3 │ 2  │ 3  │
├──────────┼──────┼──────┼──────┼──────┼────┼────┼────┼────┤
│ 選手C    │ 1-2  │ 4-0  │  ×   │ 1-0  │ 2  │ +4 │ 6  │ 2  │
├──────────┼──────┼──────┼──────┼──────┼────┼────┼────┼────┤
│ 選手D    │ 0-3  │ 1-2  │ 0-1  │  ×   │ 0  │ -6 │ 1  │ 4  │
└──────────┴──────┴──────┴──────┴──────┴────┴────┴────┴────┘
```

**特徴**:
- 縦軸・横軸に選手名
- 交点にスコア表示（「赤-青」形式）
- 対角線は「×」（自分自身との対戦なし）
- 未対戦は空欄
- 右側に集計（勝敗数、得失点差、総得点、順位）

### 2. 表示レイアウト

#### 複数グループの表示

```
┌────────────────────────────────────────┐
│           BC4 Male                      │
├────────────────────────────────────────┤
│  Group A           │  Group B          │
│  ┌──────────────┐ │  ┌──────────────┐│
│  │ 総当たり表   │ │  │ 総当たり表   ││
│  └──────────────┘ │  └──────────────┘│
└────────────────────────────────────────┘
```

#### スクロール対応

- グループが多い場合は横スクロール
- 選手が多い場合は縦スクロール
- ヘッダー（クラス名）は固定

---

## データ構造

### ディレクトリ構成

```
public/data/
├── classDefinitions.json          # クラス定義（共通）
└── {eventId}/                     # 大会ごと
    ├── init.json                  # 大会基本設定
    ├── schedule.json              # タイムスケジュール
    └── classes/                   # クラスごと
        └── {className}/           # 例: BC4-Male
            ├── players.json       # 選手一覧
            ├── groups.json        # グループ分け
            └── results.json       # 試合結果・順位表
```

### 1. players.json - 選手一覧

```json
{
  "classId": "BC4",
  "gender": "Male",
  "players": [
    {
      "playerId": "player001",
      "name": "山田太郎",
      "nameEn": "Taro Yamada",
      "country": "jp",
      "classification": "BC4",
      "gender": "Male",
      "profilePic": ""
    },
    {
      "playerId": "player002",
      "name": "佐藤花子",
      "nameEn": "Hanako Sato",
      "country": "jp",
      "classification": "BC4",
      "gender": "Female",
      "profilePic": ""
    }
  ]
}
```

### 2. groups.json - グループ分け

```json
{
  "classId": "BC4",
  "gender": "Male",
  "format": "groupStage",
  "groups": [
    {
      "groupId": "A",
      "groupName": "Group A",
      "playerIds": ["player001", "player002", "player003", "player004"]
    },
    {
      "groupId": "B",
      "groupName": "Group B",
      "playerIds": ["player005", "player006", "player007", "player008"]
    }
  ],
  "advanceToNextRound": 2,
  "matchFormat": "roundRobin"
}
```

**フィールド説明**:
- `format`: `"groupStage"` または `"tournament"` または `"roundRobin"`
- `advanceToNextRound`: 各グループから次のラウンドに進出する人数
- `matchFormat`: `"roundRobin"` (総当たり) または `"singleElimination"` (トーナメント)

### 3. results.json - 試合結果・順位表

```json
{
  "classId": "BC4",
  "gender": "Male",
  "groupStage": {
    "A": {
      "matches": [
        {
          "matchId": "match001",
          "red": {
            "playerId": "player001",
            "name": "山田太郎",
            "score": 5
          },
          "blue": {
            "playerId": "player002",
            "name": "佐藤花子",
            "score": 3
          },
          "totalEnds": 4,
          "status": "completed",
          "courtId": "A",
          "timestamp": "2026-06-15T10:00:00Z",
          "matchType": "group"
        },
        {
          "matchId": "match002",
          "red": {
            "playerId": "player001",
            "name": "山田太郎",
            "score": 4
          },
          "blue": {
            "playerId": "player003",
            "name": "田中一郎",
            "score": 2
          },
          "totalEnds": 4,
          "status": "completed",
          "courtId": "B",
          "timestamp": "2026-06-15T11:00:00Z",
          "matchType": "group"
        }
      ],
      "standings": [
        {
          "playerId": "player001",
          "name": "山田太郎",
          "wins": 3,
          "losses": 0,
          "pointsFor": 18,
          "pointsAgainst": 8,
          "pointDiff": 10,
          "rank": 1
        },
        {
          "playerId": "player002",
          "name": "佐藤花子",
          "pointsFor": 15,
          "pointsAgainst": 12,
          "pointDiff": 3,
          "rank": 2
        },
        {
          "playerId": "player003",
          "name": "田中一郎",
          "wins": 1,
          "losses": 2,
          "pointsFor": 10,
          "pointsAgainst": 14,
          "pointDiff": -4,
          "rank": 3
        },
        {
          "playerId": "player004",
          "name": "鈴木次郎",
          "wins": 0,
          "losses": 3,
          "pointsFor": 7,
          "pointsAgainst": 16,
          "pointDiff": -9,
          "rank": 4
        }
      ]
    },
    "B": {
      "matches": [],
      "standings": []
    }
  }
}
```

**フィールド説明**:
- `matches`: 試合結果の配列
- `standings`: 順位表（自動計算された結果）
- `wins`: 勝利数
- `losses`: 敗北数
- `pointsFor`: 総得点
- `pointsAgainst`: 総失点
- `pointDiff`: 得失点差
- `rank`: 順位

### 順位決定ルール

1. **勝利数**が多い方が上位
2. 勝利数が同じ場合、**得失点差**が大きい方が上位
3. 得失点差も同じ場合、**総得点**が多い方が上位
4. それでも同じ場合、**直接対決の結果**で決定

---

## UIコンポーネント設計

### コンポーネント構成

```
GroupLeagueDisplay/
├── GroupLeagueDisplay.jsx     # メインコンポーネント
├── GroupLeagueDisplay.css
└── components/
    ├── MatchMatrix.jsx        # 総当たり表（マトリックス）
    ├── StandingsTable.jsx     # 順位表
    └── GroupSelector.jsx      # グループ切替
```

### 1. GroupLeagueDisplay.jsx - メインコンポーネント

**役割**:
- データの取得（Polling: 5秒ごと）
- グループの切り替え
- レイアウト管理

**Props**:
```javascript
{
  eventId: string,      // 大会ID
  classId: string,      // クラスID (例: "BC4")
  gender: string,       // 性別 ("Male" | "Female" | "")
}
```

**State**:
```javascript
{
  players: [],          // 選手一覧
  groups: [],           // グループ分け
  results: {},          // 試合結果・順位表
  selectedGroup: "A",   // 選択中のグループ
  isLoading: false,
  error: null
}
```

### 2. MatchMatrix.jsx - 総当たり表

**役割**:
- マトリックス形式で対戦結果を表示
- 縦軸・横軸に選手名
- 交点にスコア表示

**Props**:
```javascript
{
  players: [],          // グループ内の選手
  matches: [],          // 試合結果
  standings: []         // 順位表（右側の集計用）
}
```

**表示ロジック**:
```javascript
// 選手Aと選手Bの対戦結果を取得
const getMatchResult = (playerAId, playerBId) => {
  const match = matches.find(m => 
    (m.red.playerId === playerAId && m.blue.playerId === playerBId) ||
    (m.red.playerId === playerBId && m.blue.playerId === playerAId)
  );
  
  if (!match) return null; // 未対戦
  
  // スコアを「赤-青」形式で返す
  if (match.red.playerId === playerAId) {
    return `${match.red.score}-${match.blue.score}`;
  } else {
    return `${match.blue.score}-${match.red.score}`;
  }
};
```

### 3. StandingsTable.jsx - 順位表（オプション）

総当たり表の右側に集計が表示されるが、独立した順位表も表示可能。

**役割**:
- 順位表のみを表示
- ソート機能

**Props**:
```javascript
{
  standings: [],        // 順位表
  showDetails: boolean  // 詳細情報の表示/非表示
}
```

---

## データフロー

### 1. 初回読み込み

```
GroupLeagueDisplay
  ↓ fetch
  ├─ /data/{eventId}/classes/{className}/players.json
  ├─ /data/{eventId}/classes/{className}/groups.json
  └─ /data/{eventId}/classes/{className}/results.json
  ↓
State更新
  ↓
MatchMatrix/StandingsTable に渡す
```

### 2. リアルタイム更新（Polling）

```
setInterval (5秒ごと)
  ↓ fetch
  /data/{eventId}/classes/{className}/results.json
  ↓
results の差分チェック
  ↓ 変更があれば
State更新
  ↓
再レンダリング
```

### 3. 順位の自動計算

**サーバー側で計算**（推奨）:
- 試合結果が確定したら、`results.json`の`standings`を自動更新
- フロントエンドは計算済みデータを表示するのみ

**フロントエンド側で計算**（代替案）:
- `matches`配列から`standings`を計算
- リアルタイム更新のたびに再計算

---

## URL設計

### グループリーグ表示画面

```
https://boccia.app/event/{eventId}/results/group?class={className}&gender={gender}
```

**例**:
```
https://boccia.app/event/2026-tokyo/results/group?class=BC4&gender=Male
https://boccia.app/event/2026-tokyo/results/group?class=PairBC3
```

**クエリパラメータ**:
- `class`: クラス名（BC1, BC2, BC3, BC4, PairBC3, PairBC4, etc.）
- `gender`: 性別（Male, Female, 空）※PairやTeamの場合は空

---

## CSS設計

### レスポンシブ対応

```css
/* デスクトップ（大型ディスプレイ） */
@media (min-width: 1920px) {
  .matchMatrix {
    font-size: 24px;
  }
}

/* タブレット */
@media (max-width: 1024px) {
  .matchMatrix {
    font-size: 16px;
    overflow-x: auto;
  }
}

/* スマホ */
@media (max-width: 768px) {
  .matchMatrix {
    display: none; /* マトリックスは非表示 */
  }
  .standingsTable {
    display: block; /* 順位表のみ表示 */
  }
}
```

### カラースキーム

```css
/* グループAの色 */
.groupA {
  --group-color: #FFD700; /* ゴールド */
}

/* グループBの色 */
.groupB {
  --group-color: #87CEEB; /* スカイブルー */
}

/* 勝利（自分が左側） */
.winScore {
  font-weight: bold;
  color: #4CAF50; /* 緑 */
}

/* 敗北 */
.loseScore {
  color: #F44336; /* 赤 */
}

/* 未対戦 */
.noMatch {
  color: #9E9E9E; /* グレー */
}
```

---

## 実装の優先順位

### フェーズ3-1: 基本表示（最優先）

- [ ] テストデータの作成（2グループ、各4人）
- [ ] `MatchMatrix.jsx`の実装（総当たり表）
- [ ] `StandingsTable.jsx`の実装（順位表）
- [ ] 静的データでの表示確認

### フェーズ3-2: データ取得

- [ ] データ取得API（fetch）の実装
- [ ] ローディング状態の表示
- [ ] エラーハンドリング

### フェーズ3-3: リアルタイム更新

- [ ] Polling機能の実装（5秒ごと）
- [ ] 差分検知と自動更新
- [ ] アニメーション（順位変動時）

### フェーズ3-4: 拡張機能

- [ ] 複数グループの表示
- [ ] グループ切り替え機能
- [ ] 試合詳細の表示（クリック時）
- [ ] フルスクリーンモード

---

## 参考資料

### 旧バージョン（2023年）

**確認できた内容**:
- 大型ディスプレイでスコア表示
- ノートPCでリーグ表と進行管理を統合
- タブレットでスコア入力

**旧バージョンの特徴**:
- リーグ表表示と進行管理が1つの画面
- 黒背景でチーム名が一覧表示
- 試合結果がリアルタイムで反映

### 手書きのグループリーグ表

**Aグループ**:
- 花一学園
- Team 神南
- 府中ユナイテッドB

**Bグループ**:
- ニコニコたっしー
- 柏木ファイターズ
- BBT Casa Jr.

**表示内容**:
- 対戦マトリックス（総当たり表）
- 勝敗数
- 得失点差
- 総得点
- 順位

---

## テストデータ例

### 最小構成（開発用）

**2グループ、各4人、計12試合**

```
Group A: 山田太郎、佐藤花子、田中一郎、鈴木次郎
Group B: 高橋三郎、渡辺四郎、伊藤五郎、中村六郎

各グループ内で総当たり戦（6試合 × 2グループ = 12試合）
```

### 試合結果サンプル（Group A）

```
試合1: 山田太郎 5 - 3 佐藤花子
試合2: 山田太郎 4 - 2 田中一郎
試合3: 山田太郎 3 - 0 鈴木次郎
試合4: 佐藤花子 0 - 4 田中一郎
試合5: 佐藤花子 2 - 1 鈴木次郎
試合6: 田中一郎 1 - 0 鈴木次郎
```

### 順位表サンプル（Group A）

```
1位: 山田太郎    3勝0敗  得点12 失点5  得失+7
2位: 田中一郎    2勝1敗  得点7  失点5  得失+2
3位: 佐藤花子    1勝2敗  得点5  失点10 得失-5
4位: 鈴木次郎    0勝3敗  得点1  失点5  得失-4
```

---

## 今後の課題

### データ生成の自動化

将来的には、以下の機能が必要：

1. **1) 大会管理画面**で選手登録
2. **自動グループ分け**（選手数に応じて）
3. **自動対戦組み合わせ生成**（総当たり）
4. **2) 進捗管理画面**で試合割当
5. **順位の自動計算**（試合結果から）

### トーナメント表との連携

- グループリーグの上位者がトーナメントへ進出
- 自動でトーナメント表に反映

---

## 関連ドキュメント

- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) - システム全体設計
- [AI_HANDOVER.md](./AI_HANDOVER.md) - 開発の経緯

---

**最終更新**: 2026-01-15
**ステータス**: 設計中
