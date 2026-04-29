# SQLite移行: DDLと最小API仕様

## DBファイル

- 保存先: `{B_SYSTEM_DATA_ROOT or public/data}/{eventId}/hq-progress.sqlite3`
- 初回アクセス時に自動生成
- スキーマ: `server/sql/progression-schema.sql`

## 状態遷移

`scheduled -> announced -> in_progress -> court_approved -> hq_approved -> reflected`

## API一覧

### 1. 試合登録（最小移行向け）

- `POST /api/progress/:eventId/matches/register`
- body:
```json
{
  "matchId": "M001",
  "courtId": "A",
  "redPlayerId": "P001",
  "bluePlayerId": "P002",
  "scheduledAt": "2026-04-23T09:00:00+09:00"
}
```

### 2. 試合一覧

- `GET /api/progress/:eventId/matches`
- `GET /api/progress/:eventId/matches?status=in_progress`

### 3. アナウンス開始（ロック確保）

- `POST /api/progress/:eventId/matches/:matchId/announce`
- body（未登録matchの場合に利用）:
```json
{
  "courtId": "A",
  "redPlayerId": "P001",
  "bluePlayerId": "P002",
  "scheduledAt": "2026-04-23T09:00:00+09:00"
}
```
- 競合時は `409`
- 成功時、`{DATA_ROOT}/{eventId}/court/{courtId}/settings.json` と `game.json` に選手名・`matchID` を書き込み（`classes/{classCode}/player.json` と `schedule.json` の `classCode` を参照）
- `settings.matchName` は **matchId にはしない**。`schedule.json` の当該試合に `matchName` があればそれを使用。なければ両者の `poolId` が同じとき `Pool{poolId} {round}回戦`、それ以外は `{round}回戦`（例: `PoolA 1回戦`）
- `schedule.json` で明示する例: `"matchName": "PoolA 1回戦"`
- レスポンスに `scoreboardSync: { ok: true }` または `{ ok: false, error: "..." }` を付与（ファイル書き込み失敗時もDBは `announced` のまま）

### 3b. 配信取り消し（テスト・誤操作向け）

- `POST /api/progress/:eventId/matches/:matchId/unannounce`
- `announced` のみ可。`in_progress` 以降は `409`
- DB: `scheduled` に戻し、`active_locks` を当該試合分削除
- コートの `settings.json` / `game.json` を配信前に近い状態へ（表示名 `Red` / `Blue`、`matchID` 空など）

### 4. 試合開始

- `POST /api/progress/:eventId/matches/:matchId/start`

### 5. コート承認

- `POST /api/progress/:eventId/matches/:matchId/court-approve`
- body:
```json
{
  "refereeName": "審判A",
  "redScore": 4,
  "blueScore": 2,
  "winnerPlayerId": "P001"
}
```

### 6. 本部承認

- `POST /api/progress/:eventId/matches/:matchId/hq-approve`
- body:
```json
{
  "approverName": "本部B"
}
```

### 7. 結果修正（本部のみ想定）

- `PATCH /api/progress/:eventId/matches/:matchId/result`
- body:
```json
{
  "approverName": "本部B",
  "correctionReason": "スコア再確認",
  "redScore": 5,
  "blueScore": 2,
  "winnerPlayerId": "P001"
}
```

### 8. standings向けデータ

- `GET /api/progress/:eventId/pool/standings`
- `hq_approved`（互換のため `reflected` も含む）を返却

## 備考

- 競合防止は `active_locks` と状態チェックの二重化
- 本部修正は `approvals` に履歴を残す

## schedule.json 一括投入

- サーバー起動後に実行:
  - `cd server`
  - `npm run import:schedule -- bgp-2026-preliminary`
- 環境変数:
  - `B_SYSTEM_DATA_ROOT` を指定すると private 側の `schedule.json` を優先
  - `B_SYSTEM_API_BASE` でAPI先を変更可能（既定: `http://localhost:3001`）
- 仕様:
  - `redPlayerId` と `bluePlayerId` が両方ある試合のみ `matches/register` へ投入
  - 勝者待ち（TBD）試合はスキップ
