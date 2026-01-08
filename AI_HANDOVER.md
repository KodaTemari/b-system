# ボッチャスコアボードシステム - AI引き継ぎドキュメント

## 📋 目次
1. [アプリケーション概要](#アプリケーション概要)
2. [技術スタック](#技術スタック)
3. [プロジェクト構造](#プロジェクト構造)
4. [コンポーネント構造](#コンポーネント構造)
5. [ステート管理の仕組み](#ステート管理の仕組み)
6. [データフロー](#データフロー)
7. [現在のバグ状況](#現在のバグ状況)
8. [問題点とリファクタリング指針](#問題点とリファクタリング指針)
9. [データ形式と多言語対応](#データ形式と多言語対応)
10. [開発環境のセットアップ](#開発環境のセットアップ)

---

## アプリケーション概要

### 目的
ボッチャ（Boccia）競技用のデジタルスコアボードシステムです。試合の進行管理、スコア記録、タイマー管理、反則記録などの機能を提供します。

### 主な機能
- **試合進行管理**: スタンバイ、ウォームアップ、エンド、インターバル、試合終了などのセクション管理
- **スコア管理**: 赤チームと青チームのスコア記録（エンドごと）
- **タイマー機能**: 赤/青タイマー、ウォームアップタイマー、インターバルタイマー
- **反則管理**: 各種反則の記録（ペナルティボール、イエローカード、レッドカードなど）
- **タイムアウト管理**: メディカルタイムアウト、テクニカルタイムアウト
- **多言語対応**: 日本語と英語の切り替え
- **設定管理**: クラス分類、エンド数、ルール設定など
- **結果承認**: 試合終了後の結果承認機能

### 動作モード
- **Ctrlモード** (`?p=ctrl`): 操作可能な制御画面
- **Viewモード** (デフォルト): 表示専用のビュー画面

---

## 技術スタック

- **フロントエンド**: React 19.1.1 + Vite 7.1.7
- **ルーティング**: React Router DOM 7.9.3
- **バックエンド**: Express.js (Node.js)
- **データ保存**: JSONファイル（`public/data/{eventId}/court/{courtId}/game.json`）
- **ローカルストレージ**: ブラウザのLocalStorage（一時保存用）

---

## プロジェクト構造

```
b-system/
├── public/
│   ├── data/
│   │   ├── {eventId}/
│   │   │   ├── init.json          # 大会初期設定
│   │   │   └── court/
│   │   │       └── {courtId}/
│   │   │           └── game.json  # 試合データ（動的更新）
│   │   └── classDefinitions.json  # クラス定義（BC1, BC2, etc.）
│   ├── img/                        # 画像リソース
│   └── sound/                      # 音声リソース
├── server/
│   └── server.js                   # Expressサーバー（API提供）
├── src/
│   ├── components/
│   │   └── scoreboard/
│   │       ├── Scoreboard.jsx      # メインコンポーネント
│   │       ├── Scoreboard.css
│   │       └── ui/                 # UIサブコンポーネント
│   │           ├── Header.jsx
│   │           ├── SectionNav.jsx
│   │           ├── SettingModal.jsx
│   │           ├── PlayerInfoPanel.jsx
│   │           ├── ResultTable.jsx
│   │           ├── PenaltyModal.jsx
│   │           ├── TimeoutModal.jsx
│   │           └── ...
│   ├── hooks/
│   │   └── scoreboard/
│   │       ├── useScoreboard.js         # メインフック（統合）
│   │       ├── useGameState.js          # ゲーム状態管理
│   │       ├── useDataSync.js           # データ同期（API/Storage）
│   │       ├── useTimerManagement.js    # タイマー管理
│   │       └── useScoreboardHandlers.js # イベントハンドラー
│   ├── utils/
│   │   └── scoreboard/
│   │       ├── constants.js        # 定数定義
│   │       ├── gameLogic.js        # ゲームロジック
│   │       └── timerUtils.js       # タイマー関連ユーティリティ
│   ├── locales/
│   │   ├── ja.json                # 日本語翻訳
│   │   ├── en.json                # 英語翻訳
│   │   └── index.js               # 多言語管理
│   ├── App.jsx
│   └── main.jsx
└── package.json
```

---

## コンポーネント構造

### メインコンポーネント階層

```
App
└── Scoreboard (メインコンポーネント)
    ├── Header (ヘッダー)
    ├── PlayerInfoPanel (プレイヤー情報パネル)
    ├── SectionNav (セクション進行ナビゲーション)
    ├── SettingModal (設定モーダル)
    │   └── 各種設定入力
    ├── PenaltyModal (反則選択モーダル)
    ├── TimeoutModal (タイムアウト選択モーダル)
    ├── ResultTable (結果表)
    └── その他のUIコンポーネント
```

### 主要コンポーネントの役割

#### `Scoreboard.jsx` (1,285行)
- メインのスコアボードコンポーネント
- `useScoreboard`フックから全ロジックを取得
- UIのレイアウトとイベントハンドリングを担当
- **問題**: 非常に大きなコンポーネントで、責務が分散していない

#### `SettingModal.jsx` (1,488行)
- 設定モーダルコンポーネント
- クラス選択、エンド数設定、タイマー設定など
- **問題**: 巨大なコンポーネントで、複数の責務を持っている
- **重要な状態**: `pendingChanges` - OKボタン押下前に変更を保持

#### `SectionNav.jsx` (432行)
- セクション進行を表示・制御
- `classification`の表示を担当（多言語対応）
- **問題**: `formatClassification`関数が複雑

---

## ステート管理の仕組み

### カスタムフックの階層構造

```
useScoreboard (統合フック)
├── useDataSync (データ同期)
│   └── localData (サーバー/Storageから取得)
├── useGameState (ゲーム状態管理)
│   └── gameData (メインのゲームデータ)
├── useTimerManagement (タイマー管理)
└── useScoreboardHandlers (イベントハンドラー)
```

### データフロー

1. **初期読み込み**:
   ```
   useDataSync.loadGameData() 
   → APIからgame.jsonを取得
   → setLocalData()
   → useGameStateの初期データとして使用
   → gameDataとして管理
   ```

2. **データ更新**:
   ```
   ユーザー操作
   → useScoreboardHandlersのハンドラー
   → useGameState.updateField() / updateDirectField()
   → gameData更新
   → useDataSync.saveData()
   → APIにPUTリクエスト
   → game.json更新
   → LocalStorageにも保存
   ```

3. **設定モーダルの特殊なフロー**:
   ```
   SettingModal内で変更
   → pendingChangesに保存（まだgameDataには反映されない）
   → onPendingChangesChange()で親に通知
   → Scoreboard.settingPendingChangesに保存
   → SectionNavに表示（pendingChanges優先）
   → OKボタン押下
   → handleSaveChanges()
   → finalChangesをgameDataに適用
   → saveData()で保存
   → pendingChanges.classificationを保持（gameData更新を待つ）
   → gameData.classificationが更新されたらpendingChangesをクリア
   ```

### 主要なステート

#### `gameData` (useGameState)
メインのゲームデータ。以下の構造:
```javascript
{
  match: {
    totalEnds: number,
    sectionID: number,
    section: string,
    end: number,
    sections: string[],
    tieBreak: string,
    warmup: string,
    interval: string,
    rules: string,
    resultApproval: string,
    approvals: { red: boolean, referee: boolean, blue: boolean }
  },
  screen: {
    active: string,
    isColorSet: boolean,
    isScoreAdjusting: boolean,
    isPenaltyThrow: boolean
  },
  red: {
    name: string,
    score: number,
    scores: Array<{ end: number, score: number, penalties?: string[] }>,
    limit: number,
    ball: number,
    time: number,
    isRunning: boolean,
    yellowCard: number,
    penaltyBall: number,
    redCard: number,
    // ...
  },
  blue: { /* 同様の構造 */ },
  classification: string,  // 英語形式で保存: "IND BC4 Male"
  category: string,
  matchName: string,
  lastUpdated: string
}
```

#### `pendingChanges` (SettingModal内)
設定モーダルで変更されたが、まだ保存されていない値:
```javascript
{
  'classification': string,        // "IND BC4 Male"
  'match.totalEnds': number,
  'match.warmup': string,
  'red.limit': number,
  // ...
}
```

#### `settingPendingChanges` (Scoreboard内)
SettingModalから通知されたpendingChanges:
```javascript
{
  classification?: string  // classificationのみ即座に反映
}
```

---

## 現在のバグ状況

### 🐛 主要バグ: classification表示の問題

#### 症状
1. `SettingModal`の`classificationInput`でクラスを選択しても、`SectionNav`の`id="classification"`に反映されない
2. OKボタンを押すと、選択した値ではなく古い値が表示される
3. 何度も再レンダリングが発生している

#### 根本原因
1. **非同期更新のタイミング問題**:
   - `handleSaveChanges`で`saveData()`を呼ぶと、`gameData.classification`は非同期で更新される
   - しかし、`pendingChanges`がクリアされるタイミングと、`gameData.classification`が更新されるタイミングがずれている
   - その結果、`gameData.classification`が更新される前に古い値が表示される

2. **複雑な状態管理**:
   - `pendingChanges` (SettingModal内)
   - `settingPendingChanges` (Scoreboard内)
   - `gameData.classification` (useGameState内)
   - これら3つの状態が同期されていない

3. **useEffectの競合**:
   - `SettingModal`内で`gameData.classification`から`selectedClassId`を逆引きする`useEffect`が、`pendingChanges.classification`がある場合でも実行される可能性がある
   - `selectedClassId`が設定されている場合のチェックが不十分

#### 現在の修正試行
- `pendingChanges.classification`を保持し続け、`gameData.classification`が更新されたらクリアする仕組みを実装
- `Scoreboard`側でも`gameData.classification`の更新を監視
- しかし、まだ完全には解決していない

#### ログから見える問題
```
OKを押した後:
- [SettingModal] handleSaveChanges: saved classification: PAIR Friendly
- [SettingModal] handleSaveChanges: keeping classification in pendingChanges: PAIR Friendly
- [Scoreboard] settingPendingChanges updated: {}  ← ここでクリアされている
- [Scoreboard] classification prop: IND BC4 Male  ← 古い値が表示される
```

`gameData.classification`が更新される前に、`settingPendingChanges`がクリアされている可能性がある。

---

## 問題点とリファクタリング指針

### ⚠️ 主要な問題点

#### 1. **コンポーネントの肥大化**
- `Scoreboard.jsx`: 1,285行
- `SettingModal.jsx`: 1,488行
- `useScoreboardHandlers.js`: 1,538行

**問題**: 単一責任の原則に違反。保守性が低い。

#### 2. **複雑な状態管理**
- 複数のフックが相互に依存
- `pendingChanges`と`gameData`の二重管理
- 非同期更新のタイミング問題

**問題**: 状態の同期が困難。バグが発生しやすい。

#### 3. **React初心者による実装の痕跡**
- `useEffect`の依存配列が不適切な箇所がある
- 状態更新のタイミングが複雑
- `setTimeout`を使った回避策が試みられている（現在は削除済み）

**問題**: パフォーマンス問題や予期しない動作の原因。

#### 4. **データ形式の不統一**
- `classification`: 英語形式で保存（"IND BC4 Male"）
- `penalties`: 英語のキーで保存（"retraction"）
- しかし、表示時に多言語対応が必要

**問題**: データと表示の分離が不十分。

### 🔧 リファクタリング指針

#### 1. **コンポーネントの分割**

**SettingModal.jsx の分割**:
```javascript
// 推奨構造
SettingModal/
├── SettingModal.jsx (コンテナ)
├── ClassificationSelector.jsx
├── MatchSettings.jsx
├── TimerSettings.jsx
└── hooks/
    ├── useClassification.js
    ├── useMatchSettings.js
    └── usePendingChanges.js
```

**Scoreboard.jsx の分割**:
```javascript
// 推奨構造
Scoreboard/
├── Scoreboard.jsx (コンテナ)
├── ScoreboardView.jsx (表示用)
├── ScoreboardControl.jsx (制御用)
└── hooks/
    └── useScoreboardSync.js
```

#### 2. **状態管理の簡素化**

**推奨アプローチ**:
- `pendingChanges`を`useReducer`で管理
- `gameData`と`pendingChanges`の同期を明確にする
- オプティミスティックUI更新を採用

**例**:
```javascript
// usePendingChanges.js
const usePendingChanges = (gameData, onSave) => {
  const [pendingChanges, dispatch] = useReducer(pendingChangesReducer, {});
  
  const applyChanges = useCallback(() => {
    const updatedData = { ...gameData, ...pendingChanges };
    onSave(updatedData);
    dispatch({ type: 'CLEAR' });
  }, [gameData, pendingChanges, onSave]);
  
  return { pendingChanges, dispatch, applyChanges };
};
```

#### 3. **データ形式の統一**

**推奨**:
- データは常に英語のキー/値で保存
- 表示層で多言語対応
- 型安全性のため、将来的にTypeScript導入を検討

#### 4. **非同期処理の改善**

**現在の問題**:
```javascript
saveData(updatedGameData);  // 非同期
// すぐにpendingChangesをクリアすると、gameData更新前に古い値が表示される
```

**推奨解決策**:
```javascript
// オプティミスティック更新
const saveWithOptimisticUpdate = async (data) => {
  // 1. 即座にローカル状態を更新
  setGameData(data);
  
  // 2. バックグラウンドで保存
  try {
    await saveData(data);
    // 3. 成功したらpendingChangesをクリア
    clearPendingChanges();
  } catch (error) {
    // 4. 失敗したらロールバック
    rollbackGameData();
  }
};
```

#### 5. **カスタムフックの整理**

**推奨構造**:
```javascript
// useScoreboard.js を簡素化
export const useScoreboard = () => {
  const gameData = useGameData();  // データ管理
  const handlers = useGameHandlers(gameData);  // イベントハンドラー
  const timers = useTimers(gameData);  // タイマー
  
  return {
    ...gameData,
    ...handlers,
    ...timers
  };
};
```

#### 6. **型安全性の導入**

**将来的にTypeScript導入を推奨**:
- データ構造の明確化
- 型エラーの早期発見
- IDEの補完機能向上

---

## データ形式と多言語対応

### データ保存形式

#### `classification`
- **保存形式**: 英語形式
  - 例: `"IND BC4 Male"`, `"PAIR BC3"`, `"TEAM BC1/BC2"`
- **表示**: `SectionNav.jsx`の`formatClassification`関数で多言語対応
- **問題**: パース処理が複雑で、バグが発生しやすい

#### `penalties` (scores配列内)
- **保存形式**: 英語のキー
  - 例: `["retraction", "penaltyBall"]`
- **表示**: `ResultTable.jsx`で`getLocalizedText('penalties.retraction')`を使用
- **状態**: まだ表示されていない（実装途中）

### 多言語対応の仕組み

```javascript
// locales/index.js
export const getText = (key, lang) => {
  // key例: "penalties.retraction", "classNames.BC4"
  // lang: "ja" | "en"
}

// 使用例
getText('penalties.retraction', 'ja')  // "リトラクション"
getText('penalties.retraction', 'en')  // "Retraction"
```

### クラス定義

`public/data/classDefinitions.json`:
```json
{
  "classifications": {
    "BC1": {
      "name": "BC1",
      "type": "individual",
      "ends": 4,
      "timer": 270000,
      "hasGender": true
    },
    // ...
  }
}
```

---

## 開発環境のセットアップ

### 必要な環境
- Node.js (推奨: v18以上)
- npm または yarn

### セットアップ手順

```bash
# 依存関係のインストール
npm install

# サーバーの起動（別ターミナル）
cd server
npm install
node server.js
# → http://localhost:3001 で起動

# 開発サーバーの起動
npm run dev
# → http://localhost:5173 で起動
```

### アクセスURL
- 制御画面: `http://localhost:5173/event/{eventId}/court/{courtId}/scoreboard?p=ctrl`
- 表示画面: `http://localhost:5173/event/{eventId}/court/{courtId}/scoreboard`

### データファイルの場所
- 試合データ: `public/data/{eventId}/court/{courtId}/game.json`
- 初期設定: `public/data/{eventId}/init.json`
- クラス定義: `public/data/classDefinitions.json`

---

## 現在のバグ修正の優先順位

### 🔴 高優先度

1. **classification表示の問題**
   - ユーザーが選択した値が即座に反映されない
   - OKボタン後に古い値が表示される
   - **推奨解決策**: オプティミスティック更新の実装

2. **過剰な再レンダリング**
   - `formatClassification`が何度も呼ばれる
   - **推奨解決策**: `useMemo`や`useCallback`の適切な使用

### 🟡 中優先度

3. **コンポーネントの肥大化**
   - 保守性の向上のため、分割が必要

4. **型安全性の欠如**
   - 将来的にTypeScript導入を検討

### 🟢 低優先度

5. **penaltiesの表示機能**
   - まだ実装されていないが、データ形式は準備済み

---

## 重要な注意事項

### ⚠️ React初心者による実装の痕跡

開発者がReactに不慣れなため、以下の問題が見られます：

1. **useEffectの依存配列**:
   - 一部の`useEffect`で依存配列が不適切
   - `eslint-disable-next-line`で警告を無視している箇所がある

2. **状態更新のタイミング**:
   - `setTimeout`を使った回避策が試みられていた（現在は削除）
   - 非同期処理の扱いが複雑

3. **コンポーネントの責務**:
   - 単一責任の原則に違反している箇所が多い
   - コンポーネントが大きすぎる

### 💡 推奨されるアプローチ

1. **段階的なリファクタリング**:
   - 一度に全てを変更せず、小さな単位でリファクタリング
   - 各変更後にテストを実施

2. **状態管理の簡素化**:
   - `pendingChanges`の管理を`useReducer`に移行
   - オプティミスティック更新の採用

3. **コンポーネントの分割**:
   - 大きなコンポーネントを小さな単位に分割
   - カスタムフックの活用

4. **型安全性の導入**:
   - 将来的にTypeScript導入を検討
   - まずはJSDocで型情報を追加

---

## 次のステップ

### 即座に対応すべきこと

1. **classification表示バグの修正**:
   - `Scoreboard.jsx`の`settingPendingChanges`管理を確認
   - `gameData.classification`の更新タイミングを正確に把握
   - オプティミスティック更新の実装を検討

2. **再レンダリングの最適化**:
   - `formatClassification`のメモ化
   - 不要な`useEffect`の削除

### 中長期的な改善

1. **コンポーネントの分割**
2. **状態管理の簡素化**
3. **TypeScript導入の検討**
4. **テストの追加**（現在テストコードなし）

---

## 参考情報

### 主要なファイル

- `src/components/scoreboard/Scoreboard.jsx` - メインコンポーネント
- `src/components/scoreboard/ui/SettingModal.jsx` - 設定モーダル（バグ発生箇所）
- `src/components/scoreboard/ui/SectionNav.jsx` - セクション表示（バグ発生箇所）
- `src/hooks/scoreboard/useScoreboard.js` - 統合フック
- `src/hooks/scoreboard/useGameState.js` - ゲーム状態管理
- `src/hooks/scoreboard/useDataSync.js` - データ同期

### デバッグログ

開発モードでは、以下のログが出力されます：
- `[SettingModal] pendingChanges.classification updated:`
- `[Scoreboard] settingPendingChanges updated:`
- `[SectionNav] formatClassification called with:`

これらのログを確認することで、状態の変化を追跡できます。

---

## まとめ

このアプリケーションは機能的には動作していますが、以下の問題があります：

1. **classification表示バグ**: 最も緊急に対応が必要
2. **コンポーネントの肥大化**: 保守性の向上が必要
3. **複雑な状態管理**: 簡素化が必要
4. **React初心者による実装**: リファクタリングが必要

特に、`classification`と`penalties`の多言語対応は、データを英語形式で保存し、表示時に多言語対応する設計になっていますが、状態管理の複雑さが原因でバグが発生しています。

次の開発者は、まずバグ修正に集中し、その後段階的にリファクタリングを進めることを推奨します。

