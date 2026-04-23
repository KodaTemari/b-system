const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3001;

// 大会データのルート（既定: ../public/data）
// 開発時に本番相当データを使う場合は、環境変数 B_SYSTEM_DATA_ROOT にディレクトリを指定する
// 例: B_SYSTEM_DATA_ROOT=C:\path\to\private\data
const PUBLIC_DATA_ROOT = path.join(__dirname, '../public/data');
const DATA_ROOT = process.env.B_SYSTEM_DATA_ROOT
  ? path.resolve(process.env.B_SYSTEM_DATA_ROOT)
  : PUBLIC_DATA_ROOT;
const DB_SCHEMA_PATH = path.join(__dirname, 'sql', 'progression-schema.sql');
const ACTIVE_STATUSES = ['announced', 'in_progress', 'court_approved'];
const DB_CACHE = new Map();
/** 進行DBスキーマ（複文は db.run では先頭1文しか実行されないため db.exec で一括実行する） */
let cachedProgressionSchemaText = null;

// ローカルIPアドレスを取得する関数
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部ループバックでない、かつ有効なアドレス
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ミドルウェア
app.use(cors());
app.use(express.json());

function toIsoNow() {
  return new Date().toISOString();
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/** スキーマ全体など、複数のSQL文をそのまま実行する（db.run では1文目のみになるため） */
function execSql(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function getSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row ?? null);
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

async function withTransaction(db, callback) {
  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    const result = await callback();
    await runSql(db, 'COMMIT');
    return result;
  } catch (error) {
    await runSql(db, 'ROLLBACK');
    throw error;
  }
}

function getEventDbPath(eventId) {
  return path.join(DATA_ROOT, eventId, 'hq-progress.sqlite3');
}

async function getProgressionSchemaText() {
  if (!cachedProgressionSchemaText) {
    cachedProgressionSchemaText = await fs.readFile(DB_SCHEMA_PATH, 'utf8');
  }
  return cachedProgressionSchemaText;
}

/** 古い接続（run で matches しか作れていないDB）向け、毎回 idempotent にスキーマを揃える */
async function ensureProgressionSchema(db) {
  const schemaSql = await getProgressionSchemaText();
  await execSql(db, schemaSql);
  const columns = await allSql(db, `PRAGMA table_info(matches)`);
  const columnNames = new Set(columns.map((item) => String(item.name)));
  if (!columnNames.has('warmup_started_at')) {
    await runSql(db, `ALTER TABLE matches ADD COLUMN warmup_started_at TEXT`);
  }
  if (!columnNames.has('warmup_finished_at')) {
    await runSql(db, `ALTER TABLE matches ADD COLUMN warmup_finished_at TEXT`);
  }
}

async function getEventDb(eventId) {
  if (DB_CACHE.has(eventId)) {
    const cached = DB_CACHE.get(eventId);
    await runSql(cached, 'PRAGMA foreign_keys = ON');
    await runSql(cached, 'PRAGMA busy_timeout = 5000');
    await ensureProgressionSchema(cached);
    return cached;
  }

  const dbPath = getEventDbPath(eventId);
  await fs.ensureDir(path.dirname(dbPath));

  const db = await new Promise((resolve, reject) => {
    const created = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(created);
    });
  });

  await runSql(db, 'PRAGMA foreign_keys = ON');
  await runSql(db, 'PRAGMA busy_timeout = 5000');
  await ensureProgressionSchema(db);

  DB_CACHE.set(eventId, db);
  return db;
}

function normalizeMatchRow(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    matchId: row.match_id,
    courtId: row.court_id,
    redPlayerId: row.red_player_id,
    bluePlayerId: row.blue_player_id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    warmupStartedAt: row.warmup_started_at,
    warmupFinishedAt: row.warmup_finished_at,
    startedAt: row.started_at,
    courtApprovedAt: row.court_approved_at,
    courtRefereeName: row.court_referee_name,
    hqApprovedAt: row.hq_approved_at,
    hqApproverName: row.hq_approver_name,
    reflectedAt: row.reflected_at,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** 読み取り: DATA_ROOT を優先し、無ければ public/data（共有 JSON・別 eventId のデモ用） */
async function readJsonUnderEvent(eventId, ...pathSegments) {
  const rel = path.join(eventId, ...pathSegments);
  const primary = path.join(DATA_ROOT, rel);
  if (await fs.pathExists(primary)) {
    return fs.readJson(primary);
  }
  const fallback = path.join(PUBLIC_DATA_ROOT, rel);
  if (await fs.pathExists(fallback)) {
    return fs.readJson(fallback);
  }
  return null;
}

async function resolveCourtDir(eventId) {
  const d1 = path.join(DATA_ROOT, eventId, 'court');
  if (await fs.pathExists(d1)) return d1;
  const d2 = path.join(PUBLIC_DATA_ROOT, eventId, 'court');
  if (await fs.pathExists(d2)) return d2;
  return null;
}

async function registerMatchIfNeeded(db, eventId, payload) {
  const {
    matchId,
    courtId,
    redPlayerId,
    bluePlayerId,
    scheduledAt = null,
  } = payload;

  if (!matchId || !courtId || !redPlayerId || !bluePlayerId) {
    throw createHttpError(400, 'matchId, courtId, redPlayerId, bluePlayerId は必須です');
  }

  const existing = await getSql(
    db,
    `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
    [eventId, matchId],
  );
  if (existing) {
    return normalizeMatchRow(existing);
  }

  const now = toIsoNow();
  await runSql(
    db,
    `INSERT INTO matches (
      event_id, match_id, court_id, red_player_id, blue_player_id,
      scheduled_at, status, version, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 1, ?)`,
    [eventId, matchId, courtId, redPlayerId, bluePlayerId, scheduledAt, now],
  );

  const created = await getSql(
    db,
    `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
    [eventId, matchId],
  );
  return normalizeMatchRow(created);
}

async function getMatchOrFail(db, eventId, matchId) {
  const row = await getSql(
    db,
    `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
    [eventId, matchId],
  );
  if (!row) {
    throw createHttpError(404, `matchId=${matchId} が見つかりません`);
  }
  return row;
}

async function assertNoActiveConflicts(db, eventId, match) {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ');
  const conflicts = await allSql(
    db,
    `SELECT match_id, red_player_id, blue_player_id, status
     FROM matches
     WHERE event_id = ?
       AND status IN (${placeholders})
       AND match_id <> ?
       AND (
         match_id = ?
         OR red_player_id IN (?, ?)
         OR blue_player_id IN (?, ?)
       )`,
    [
      eventId,
      ...ACTIVE_STATUSES,
      match.match_id,
      match.match_id,
      match.red_player_id,
      match.blue_player_id,
      match.red_player_id,
      match.blue_player_id,
    ],
  );

  if (conflicts.length > 0) {
    const summary = conflicts
      .map((item) => `${item.match_id}(${item.status})`)
      .join(', ');
    throw createHttpError(409, `重複する進行中試合があります: ${summary}`);
  }

  const lockConflicts = await allSql(
    db,
    `SELECT lock_type, lock_key, match_id
     FROM active_locks
     WHERE event_id = ?
       AND ((lock_type = 'match' AND lock_key = ?)
         OR (lock_type = 'player' AND lock_key IN (?, ?)))`,
    [eventId, match.match_id, match.red_player_id, match.blue_player_id],
  );
  if (lockConflicts.length > 0) {
    throw createHttpError(409, 'ロック競合が発生しました。別の端末で進行操作が行われています');
  }
}

async function lockMatchAndPlayers(db, eventId, match) {
  const now = toIsoNow();
  await runSql(
    db,
    `INSERT INTO active_locks (event_id, lock_type, lock_key, match_id, created_at)
     VALUES (?, 'match', ?, ?, ?)`,
    [eventId, match.match_id, match.match_id, now],
  );
  await runSql(
    db,
    `INSERT INTO active_locks (event_id, lock_type, lock_key, match_id, created_at)
     VALUES (?, 'player', ?, ?, ?), (?, 'player', ?, ?, ?)`,
    [
      eventId, match.red_player_id, match.match_id, now,
      eventId, match.blue_player_id, match.match_id, now,
    ],
  );
}

async function releaseLocksByMatch(db, eventId, matchId) {
  await runSql(
    db,
    `DELETE FROM active_locks WHERE event_id = ? AND match_id = ?`,
    [eventId, matchId],
  );
}

/** player.json から id → 表示名 */
async function buildPlayerIdToNameMap(eventId) {
  const scheduleJson = await readJsonUnderEvent(eventId, 'schedule.json');
  const classCode = scheduleJson?.classCode != null ? String(scheduleJson.classCode) : 'FRD';
  const playersJson = await readJsonUnderEvent(eventId, 'classes', classCode, 'player.json');
  const map = new Map();
  if (Array.isArray(playersJson)) {
    for (const p of playersJson) {
      if (p == null || p.id == null) continue;
      const id = String(p.id);
      const name = String(p.name ?? '').trim();
      map.set(id, name || id);
    }
  }
  return map;
}

/**
 * スコアボードの settings.matchName 用。matchId は使わない。
 * 1) schedule.json の当該試合に matchName があればその文字列
 * 2) なければ両者の poolId が同一なら `Pool{poolId} {round}回戦`
 * 3) それ以外は `{round}回戦`（round が取れなければ空）
 */
async function resolveAnnounceMatchDisplayName(eventId, matchId) {
  const schedule = await readJsonUnderEvent(eventId, 'schedule.json');
  if (!schedule || !Array.isArray(schedule.matches)) {
    return '';
  }
  const sm = schedule.matches.find((entry) => String(entry.matchId ?? '') === String(matchId ?? ''));
  if (!sm) {
    return '';
  }
  const explicit = String(sm.matchName ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const classCode = schedule.classCode != null ? String(schedule.classCode) : 'FRD';
  const playersJson = await readJsonUnderEvent(eventId, 'classes', classCode, 'player.json');
  const roundNum = sm.round != null && !Number.isNaN(Number(sm.round)) ? Number(sm.round) : null;
  const redPlayerId = String(sm.redPlayerId ?? '').trim();
  const bluePlayerId = String(sm.bluePlayerId ?? '').trim();
  if (roundNum == null || !redPlayerId || !bluePlayerId) {
    return '';
  }
  if (!Array.isArray(playersJson)) {
    return `${roundNum}回戦`;
  }
  const redP = playersJson.find((p) => String(p.id) === redPlayerId);
  const blueP = playersJson.find((p) => String(p.id) === bluePlayerId);
  const rPool = redP?.poolId != null ? String(redP.poolId).trim() : '';
  const bPool = blueP?.poolId != null ? String(blueP.poolId).trim() : '';
  if (rPool && rPool === bPool) {
    return `Pool${rPool} ${roundNum}回戦`;
  }
  return `${roundNum}回戦`;
}

/**
 * 配信（announced）確定後に、該当コートの settings.json / game.json を更新してスコアボードに選手名を反映する
 * （useDataSync は settings の red.name / blue.name を優先してマージする）
 */
async function syncAnnounceToCourtFiles(eventId, match) {
  const courtId = String(match.courtId ?? '').trim();
  if (!courtId) {
    throw new Error('courtId が空です');
  }
  const idToName = await buildPlayerIdToNameMap(eventId);
  const redId = String(match.redPlayerId ?? '').trim();
  const blueId = String(match.bluePlayerId ?? '').trim();
  const redName = idToName.get(redId) || redId;
  const blueName = idToName.get(blueId) || blueId;
  const matchIdStr = String(match.matchId ?? '').trim();
  const matchDisplayName = await resolveAnnounceMatchDisplayName(eventId, matchIdStr);

  const courtDir = path.join(DATA_ROOT, eventId, 'court', courtId);
  await fs.ensureDir(courtDir);
  const settingsPath = path.join(courtDir, 'settings.json');
  const gamePath = path.join(courtDir, 'game.json');

  const defaultSettings = {
    classification: '',
    category: '',
    matchName: '',
    match: {
      totalEnds: 6,
      warmup: 'simultaneous',
      interval: 'enabled',
      rules: 'worldBoccia',
      resultApproval: 'enabled',
      tieBreak: 'finalShot',
    },
    red: { name: '', limit: 300000, country: '', profilePic: '' },
    blue: { name: '', limit: 300000, country: '', profilePic: '' },
    warmup: { limit: 120000 },
    interval: { limit: 60000 },
  };

  let settings = { ...defaultSettings };
  if (await fs.pathExists(settingsPath)) {
    const existing = await fs.readJson(settingsPath);
    settings = {
      ...defaultSettings,
      ...existing,
      match: { ...defaultSettings.match, ...(existing.match || {}) },
      red: { ...defaultSettings.red, ...(existing.red || {}) },
      blue: { ...defaultSettings.blue, ...(existing.blue || {}) },
      warmup: { ...defaultSettings.warmup, ...(existing.warmup || {}) },
      interval: { ...defaultSettings.interval, ...(existing.interval || {}) },
    };
  }
  settings.red = { ...settings.red, name: redName };
  settings.blue = { ...settings.blue, name: blueName };
  settings.matchName = matchDisplayName;
  await fs.writeJson(settingsPath, settings, { spaces: 2 });

  let game = {};
  if (await fs.pathExists(gamePath)) {
    game = await fs.readJson(gamePath);
  }
  const nextGame = {
    ...game,
    matchID: matchIdStr || game.matchID || '',
    matchName: matchDisplayName,
    red: {
      ...(game.red || {}),
      name: redName,
      playerID: redId,
    },
    blue: {
      ...(game.blue || {}),
      name: blueName,
      playerID: blueId,
    },
    courtId: courtId || game.courtId || '',
    lastUpdated: toIsoNow(),
  };
  await fs.writeJson(gamePath, nextGame, { spaces: 2 });
}

/** 配信取り消し時: コートの表示名をスコアボード初期表示に近づける（DEFAULT_GAME_DATA と揃える） */
const SCOREBOARD_DEFAULT_RED_NAME = 'Red';
const SCOREBOARD_DEFAULT_BLUE_NAME = 'Blue';

async function syncUnannounceToCourtFiles(eventId, match) {
  const courtId = String(match.courtId ?? '').trim();
  if (!courtId) {
    throw new Error('courtId が空です');
  }
  const courtDir = path.join(DATA_ROOT, eventId, 'court', courtId);
  const settingsPath = path.join(courtDir, 'settings.json');
  const gamePath = path.join(courtDir, 'game.json');

  if (await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    settings.red = { ...(settings.red || {}), name: SCOREBOARD_DEFAULT_RED_NAME };
    settings.blue = { ...(settings.blue || {}), name: SCOREBOARD_DEFAULT_BLUE_NAME };
    settings.matchName = '';
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
  }

  if (await fs.pathExists(gamePath)) {
    const game = await fs.readJson(gamePath);
    const nextGame = {
      ...game,
      matchID: '',
      red: {
        ...(game.red || {}),
        name: SCOREBOARD_DEFAULT_RED_NAME,
        playerID: '',
      },
      blue: {
        ...(game.blue || {}),
        name: SCOREBOARD_DEFAULT_BLUE_NAME,
        playerID: '',
      },
      lastUpdated: toIsoNow(),
    };
    await fs.writeJson(gamePath, nextGame, { spaces: 2 });
  }
}

/** 再テスト向け: 全コートのスコアボードファイルを初期状態へ戻す */
async function resetAllCourtFilesForRetest(eventId) {
  const courtDir = await resolveCourtDir(eventId);
  if (!courtDir) {
    return { courtCount: 0, updatedSettings: 0, updatedGames: 0 };
  }
  const entries = await fs.readdir(courtDir, { withFileTypes: true });
  const courtIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  let updatedSettings = 0;
  let updatedGames = 0;

  for (const courtId of courtIds) {
    const baseDir = path.join(courtDir, courtId);
    const settingsPath = path.join(baseDir, 'settings.json');
    const gamePath = path.join(baseDir, 'game.json');

    if (await fs.pathExists(settingsPath)) {
      const settings = await fs.readJson(settingsPath);
      settings.red = { ...(settings.red || {}), name: SCOREBOARD_DEFAULT_RED_NAME };
      settings.blue = { ...(settings.blue || {}), name: SCOREBOARD_DEFAULT_BLUE_NAME };
      settings.matchName = '';
      await fs.writeJson(settingsPath, settings, { spaces: 2 });
      updatedSettings += 1;
    }

    if (await fs.pathExists(gamePath)) {
      const game = await fs.readJson(gamePath);
      const redLimit = Number(game?.red?.limit) || 300000;
      const blueLimit = Number(game?.blue?.limit) || 300000;
      const warmupLimit = Number(game?.warmup?.limit) || 120000;
      const intervalLimit = Number(game?.interval?.limit) || 60000;
      const resetGame = {
        ...game,
        matchID: '',
        matchName: '',
        match: {
          ...(game.match || {}),
          end: 0,
          ends: [],
          sectionID: 0,
          section: 'standby',
          approvals: {
            red: false,
            referee: false,
            blue: false,
          },
        },
        screen: {
          ...(game.screen || {}),
          active: '',
          isColorSet: false,
          isScoreAdjusting: false,
          isPenaltyThrow: false,
        },
        warmup: {
          ...(game.warmup || {}),
          isRunning: false,
          time: warmupLimit,
        },
        interval: {
          ...(game.interval || {}),
          isRunning: false,
          time: intervalLimit,
        },
        red: {
          ...(game.red || {}),
          name: SCOREBOARD_DEFAULT_RED_NAME,
          playerID: '',
          score: 0,
          scores: [],
          ball: 6,
          isRunning: false,
          time: redLimit,
          isTieBreak: false,
          result: '',
          yellowCard: 0,
          penaltyBall: 0,
          redCard: 0,
        },
        blue: {
          ...(game.blue || {}),
          name: SCOREBOARD_DEFAULT_BLUE_NAME,
          playerID: '',
          score: 0,
          scores: [],
          ball: 6,
          isRunning: false,
          time: blueLimit,
          isTieBreak: false,
          result: '',
          yellowCard: 0,
          penaltyBall: 0,
          redCard: 0,
        },
        lastUpdated: toIsoNow(),
      };
      await fs.writeJson(gamePath, resetGame, { spaces: 2 });
      updatedGames += 1;
    }
  }

  return {
    courtCount: courtIds.length,
    updatedSettings,
    updatedGames,
  };
}

// 静的ファイルの提供（B_SYSTEM_DATA_ROOT 利用時は DATA_ROOT を優先し、無いパスは public/data にフォールバック）
app.use('/data', express.static(DATA_ROOT));
app.use('/data', express.static(PUBLIC_DATA_ROOT));

// 進行システム: 試合登録（最小移行向け）
app.post('/api/progress/:eventId/matches/register', async (req, res) => {
  try {
    const { eventId } = req.params;
    const db = await getEventDb(eventId);
    const match = await registerMatchIfNeeded(db, eventId, req.body ?? {});
    res.json({ success: true, match });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: 試合一覧取得
app.get('/api/progress/:eventId/matches', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query;
    const db = await getEventDb(eventId);

    const rows = status
      ? await allSql(
        db,
        `SELECT * FROM matches WHERE event_id = ? AND status = ? ORDER BY scheduled_at ASC, updated_at ASC`,
        [eventId, status],
      )
      : await allSql(
        db,
        `SELECT * FROM matches WHERE event_id = ? ORDER BY scheduled_at ASC, updated_at ASC`,
        [eventId],
      );
    res.json({ matches: rows.map(normalizeMatchRow) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 再テスト向け: 全コートと進行DBを初期状態へ戻す
app.post('/api/progress/:eventId/reset-all', async (req, res) => {
  try {
    const { eventId } = req.params;
    const db = await getEventDb(eventId);
    await withTransaction(db, async () => {
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET status = 'scheduled',
             warmup_started_at = NULL,
             warmup_finished_at = NULL,
             started_at = NULL,
             court_approved_at = NULL,
             court_referee_name = NULL,
             hq_approved_at = NULL,
             hq_approver_name = NULL,
             reflected_at = NULL,
             version = version + 1,
             updated_at = ?`,
        [now],
      );
      await runSql(db, `DELETE FROM results WHERE event_id = ?`, [eventId]);
      await runSql(db, `DELETE FROM approvals WHERE event_id = ?`, [eventId]);
      await runSql(db, `DELETE FROM active_locks WHERE event_id = ?`, [eventId]);
    });
    const fileResetSummary = await resetAllCourtFilesForRetest(eventId);
    res.json({ success: true, fileResetSummary });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: announced へ遷移（ロック確保）
app.post('/api/progress/:eventId/matches/:matchId/announce', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);

    const result = await withTransaction(db, async () => {
      await registerMatchIfNeeded(db, eventId, { ...req.body, matchId });
      const row = await getMatchOrFail(db, eventId, matchId);
      if (row.status !== 'scheduled') {
        throw createHttpError(409, `scheduled のみ announce 可能です（現在: ${row.status}）`);
      }

      // 一時対応: 配信不能の切り分けのため、announce 時の重複チェック/ロック確保を無効化
      // 안정後に再有効化する前提。

      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET status = 'announced',
             warmup_started_at = NULL,
             warmup_finished_at = NULL,
             started_at = NULL,
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });

    const matchPayload = normalizeMatchRow(result);
    let scoreboardSync = { ok: true };
    try {
      await syncAnnounceToCourtFiles(eventId, matchPayload);
    } catch (syncError) {
      console.error('announce: スコアボード用ファイル同期に失敗', syncError);
      scoreboardSync = { ok: false, error: syncError.message };
    }

    res.json({ success: true, match: matchPayload, scoreboardSync });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: 配信取り消し（announced → scheduled、ロック解放・テスト用再配信向け）
app.post('/api/progress/:eventId/matches/:matchId/unannounce', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);

    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (row.status !== 'announced') {
        throw createHttpError(409, `announced のみ unannounce 可能です（現在: ${row.status}）`);
      }
      await releaseLocksByMatch(db, eventId, matchId);
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET status = 'scheduled',
             warmup_started_at = NULL,
             warmup_finished_at = NULL,
             started_at = NULL,
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });

    const matchPayload = normalizeMatchRow(result);
    let scoreboardSync = { ok: true };
    try {
      await syncUnannounceToCourtFiles(eventId, matchPayload);
    } catch (syncError) {
      console.error('unannounce: スコアボード用ファイル同期に失敗', syncError);
      scoreboardSync = { ok: false, error: syncError.message };
    }

    res.json({ success: true, match: matchPayload, scoreboardSync });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: スコアボードの section 状態を本部進行へ同期
app.post('/api/progress/:eventId/matches/:matchId/sync-section', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const section = String(req.body?.section ?? '').trim();
    if (!section) {
      throw createHttpError(400, 'section は必須です');
    }
    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (!['announced', 'in_progress'].includes(row.status)) {
        throw createHttpError(409, `announced / in_progress のみ同期可能です（現在: ${row.status}）`);
      }

      const isStandby = section === 'standby';
      const isWarmup = ['warmup', 'warmup1', 'warmup2'].includes(section);
      const isInProgressSection =
        /^end\d+$/i.test(section) ||
        ['interval', 'tieBreak', 'finalShot', 'matchFinished', 'resultApproval'].includes(section);
      if (!isStandby && !isWarmup && !isInProgressSection) {
        return row;
      }

      const now = toIsoNow();
      const nextStatus = isInProgressSection ? 'in_progress' : 'announced';
      const nextWarmupStartedAt = isStandby ? null : (isWarmup ? (row.warmup_started_at || now) : (row.warmup_started_at || now));
      const nextWarmupFinishedAt = isInProgressSection ? (row.warmup_finished_at || now) : null;
      const nextStartedAt = isInProgressSection ? (row.started_at || now) : null;
      const isNoop =
        row.status === nextStatus &&
        (row.warmup_started_at || null) === nextWarmupStartedAt &&
        (row.warmup_finished_at || null) === nextWarmupFinishedAt &&
        (row.started_at || null) === nextStartedAt;
      if (isNoop) {
        return row;
      }

      await runSql(
        db,
        `UPDATE matches
         SET status = ?,
             warmup_started_at = ?,
             warmup_finished_at = ?,
             started_at = ?,
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [
          nextStatus,
          nextWarmupStartedAt,
          nextWarmupFinishedAt,
          nextStartedAt,
          now,
          eventId,
          matchId,
        ],
      );
      return getMatchOrFail(db, eventId, matchId);
    });
    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: ウォームアップ開始時刻を記録（コート側通知）
app.post('/api/progress/:eventId/matches/:matchId/warmup-started', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (!['announced', 'in_progress'].includes(row.status)) {
        throw createHttpError(409, `announced / in_progress のみ記録可能です（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET warmup_started_at = COALESCE(warmup_started_at, ?),
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });
    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: ウォームアップ終了時刻を記録（コート側通知）
app.post('/api/progress/:eventId/matches/:matchId/warmup-finished', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (!['announced', 'in_progress'].includes(row.status)) {
        throw createHttpError(409, `announced / in_progress のみ記録可能です（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET warmup_finished_at = COALESCE(warmup_finished_at, ?),
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });
    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: in_progress へ遷移
app.post('/api/progress/:eventId/matches/:matchId/start', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);

    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (row.status === 'in_progress') {
        return row;
      }
      if (row.status !== 'announced') {
        throw createHttpError(409, `announced のみ start 可能です（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET status = 'in_progress', started_at = COALESCE(started_at, ?), version = version + 1, updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });

    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: court_approved へ遷移（審判名と結果保存）
app.post('/api/progress/:eventId/matches/:matchId/court-approve', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const {
      refereeName,
      redScore = null,
      blueScore = null,
      winnerPlayerId = null,
    } = req.body ?? {};
    if (!refereeName) {
      throw createHttpError(400, 'refereeName は必須です');
    }

    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (row.status !== 'in_progress') {
        throw createHttpError(409, `in_progress のみ court-approve 可能です（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `INSERT INTO results (
          event_id, match_id, red_score, blue_score, winner_player_id, is_correction, correction_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
        ON CONFLICT(event_id, match_id) DO UPDATE SET
          red_score = excluded.red_score,
          blue_score = excluded.blue_score,
          winner_player_id = excluded.winner_player_id,
          updated_at = excluded.updated_at`,
        [eventId, matchId, redScore, blueScore, winnerPlayerId, now, now],
      );
      await runSql(
        db,
        `INSERT INTO approvals (event_id, match_id, stage, approver_name, approved_at, meta_json)
         VALUES (?, ?, 'court', ?, ?, ?)`,
        [eventId, matchId, refereeName, now, JSON.stringify({ source: 'scoreboard' })],
      );
      await runSql(
        db,
        `UPDATE matches
         SET status = 'court_approved', court_approved_at = ?, court_referee_name = ?, version = version + 1, updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, refereeName, now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });

    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: hq_approved へ遷移（本部承認）
app.post('/api/progress/:eventId/matches/:matchId/hq-approve', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const { approverName } = req.body ?? {};
    if (!approverName) {
      throw createHttpError(400, 'approverName は必須です');
    }
    const db = await getEventDb(eventId);

    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (row.status !== 'court_approved') {
        throw createHttpError(409, `court_approved のみ hq-approve 可能です（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `INSERT INTO approvals (event_id, match_id, stage, approver_name, approved_at, meta_json)
         VALUES (?, ?, 'hq', ?, ?, ?)`,
        [eventId, matchId, approverName, now, JSON.stringify({ source: 'hq' })],
      );
      await runSql(
        db,
        `UPDATE matches
         SET status = 'hq_approved', hq_approved_at = ?, hq_approver_name = ?, version = version + 1, updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, approverName, now, eventId, matchId],
      );
      return getMatchOrFail(db, eventId, matchId);
    });

    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: reflected へ遷移（順位表示向け公開）
app.post('/api/progress/:eventId/matches/:matchId/reflect', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (row.status !== 'hq_approved') {
        throw createHttpError(409, `hq_approved のみ reflect 可能です（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET status = 'reflected', reflected_at = ?, version = version + 1, updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, now, eventId, matchId],
      );
      await releaseLocksByMatch(db, eventId, matchId);
      return getMatchOrFail(db, eventId, matchId);
    });
    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: 本部のみ結果修正
app.patch('/api/progress/:eventId/matches/:matchId/result', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const {
      approverName,
      correctionReason,
      redScore = null,
      blueScore = null,
      winnerPlayerId = null,
    } = req.body ?? {};
    if (!approverName || !correctionReason) {
      throw createHttpError(400, 'approverName と correctionReason は必須です');
    }
    const db = await getEventDb(eventId);
    const data = await withTransaction(db, async () => {
      const row = await getMatchOrFail(db, eventId, matchId);
      if (!['court_approved', 'hq_approved', 'reflected'].includes(row.status)) {
        throw createHttpError(409, `現在の状態では修正できません（現在: ${row.status}）`);
      }
      const now = toIsoNow();
      await runSql(
        db,
        `INSERT INTO results (
          event_id, match_id, red_score, blue_score, winner_player_id, is_correction, correction_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(event_id, match_id) DO UPDATE SET
          red_score = excluded.red_score,
          blue_score = excluded.blue_score,
          winner_player_id = excluded.winner_player_id,
          is_correction = 1,
          correction_reason = excluded.correction_reason,
          updated_at = excluded.updated_at`,
        [eventId, matchId, redScore, blueScore, winnerPlayerId, correctionReason, now, now],
      );
      await runSql(
        db,
        `INSERT INTO approvals (event_id, match_id, stage, approver_name, approved_at, meta_json)
         VALUES (?, ?, 'hq', ?, ?, ?)`,
        [
          eventId,
          matchId,
          approverName,
          now,
          JSON.stringify({ correctionReason, action: 'result_correction' }),
        ],
      );
      await runSql(
        db,
        `UPDATE matches
         SET version = version + 1, updated_at = ?, hq_approver_name = ?
         WHERE event_id = ? AND match_id = ?`,
        [now, approverName, eventId, matchId],
      );
      const match = await getMatchOrFail(db, eventId, matchId);
      const result = await getSql(
        db,
        `SELECT event_id, match_id, red_score, blue_score, winner_player_id, is_correction, correction_reason, updated_at
         FROM results
         WHERE event_id = ? AND match_id = ?`,
        [eventId, matchId],
      );
      return { match, result };
    });
    res.json({ success: true, match: normalizeMatchRow(data.match), result: data.result });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: /pool/standings 用の最小データ取得
app.get('/api/progress/:eventId/pool/standings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { includeHqApproved = 'true' } = req.query;
    const db = await getEventDb(eventId);
    const statuses = includeHqApproved === 'true'
      ? ['hq_approved', 'reflected']
      : ['reflected'];
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = await allSql(
      db,
      `SELECT
         m.event_id,
         m.match_id,
         m.court_id,
         m.red_player_id,
         m.blue_player_id,
         m.status,
         m.hq_approved_at,
         m.reflected_at,
         r.red_score,
         r.blue_score,
         r.winner_player_id,
         r.is_correction,
         r.correction_reason,
         r.updated_at
       FROM matches m
       LEFT JOIN results r
         ON r.event_id = m.event_id AND r.match_id = m.match_id
       WHERE m.event_id = ?
         AND m.status IN (${placeholders})
       ORDER BY COALESCE(m.reflected_at, m.hq_approved_at, m.updated_at) ASC`,
      [eventId, ...statuses],
    );
    res.json({ matches: rows });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// データを更新する汎用APIエンドポイント
app.put('/api/data/:eventId/court/:courtId/:filename', async (req, res) => {
  try {
    const { eventId, courtId, filename } = req.params;
    const data = req.body;

    // ファイルパスを構築
    const filePath = path.join(DATA_ROOT, eventId, 'court', courtId, `${filename}.json`);
    
    // ディレクトリが存在しない場合は作成
    await fs.ensureDir(path.dirname(filePath));
    
    // インデント設定
    let jsonString = JSON.stringify(data, null, 2);

    // match.ends 配列内の整形（game.jsonの場合のみ）
    if (filename === 'game') {
      // インデントを保持しつつ、"shots" を含むオブジェクト（各エンドの記録）のみを1行化
      jsonString = jsonString.replace(
        /(\s+)\{\s+"end":\s+("[^"]+"|\d+),\s+"shots":[\s\S]+?\}/g,
        (match, indent) => {
          return indent + match.replace(/\n/g, '').replace(/\s\s+/g, ' ').trim();
        }
      );
    }
    
    await fs.writeFile(filePath, jsonString, 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// データを取得する汎用APIエンドポイント
app.get('/api/data/:eventId/court/:courtId/:filename', async (req, res) => {
  try {
    const { eventId, courtId, filename } = req.params;
    const data = await readJsonUnderEvent(eventId, 'court', courtId, `${filename}.json`);
    if (data != null) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 大会の全コート一覧を取得
app.get('/api/data/:eventId/courts', async (req, res) => {
  try {
    const { eventId } = req.params;
    const courtDir = await resolveCourtDir(eventId);
    if (!courtDir) {
      return res.json([]);
    }
    const entries = await fs.readdir(courtDir, { withFileTypes: true });
    const courts = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    res.json(courts);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 大会の全コートの game.json を一括取得（グループリーグ結果表示用）
app.get('/api/data/:eventId/results/all-games', async (req, res) => {
  try {
    const { eventId } = req.params;
    const courtDir = await resolveCourtDir(eventId);
    if (!courtDir) {
      return res.json({ games: [] });
    }
    const entries = await fs.readdir(courtDir, { withFileTypes: true });
    const courtIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const games = [];
    for (const courtId of courtIds) {
      const gamePath = path.join(courtDir, courtId, 'game.json');
      if (await fs.pathExists(gamePath)) {
        const game = await fs.readJson(gamePath);
        games.push({ courtId, game });
      }
    }
    res.json({ games });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 後方互換性のための既存エンドポイント
app.get('/api/game/:eventId/court/:courtId', async (req, res) => {
  const { eventId, courtId } = req.params;
  const data = await readJsonUnderEvent(eventId, 'court', courtId, 'game.json');
  if (data != null) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.put('/api/game/:eventId/court/:courtId', async (req, res) => {
  // 既存のPUT処理（必要に応じて残す、またはリダイレクト）
  // ...
});


// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIPAddress();
  console.log(`Data root (primary): ${DATA_ROOT}`);
  if (path.resolve(DATA_ROOT) !== path.resolve(PUBLIC_DATA_ROOT)) {
    console.log(`Data root (fallback): ${PUBLIC_DATA_ROOT}`);
  }
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server running on http://${localIP}:${PORT}`);
  console.log(`IP: ${localIP}:${PORT}`);
});
