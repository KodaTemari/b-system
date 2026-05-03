const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3001;

// 大会データのルート（既定: ../public/data）
// 開発時に本番相当データを使う場合は、環境変数 B_SYSTEM_DATA_ROOT にディレクトリを指定する
// 例: B_SYSTEM_DATA_ROOT=C:\path\to\private\data
const PUBLIC_DATA_ROOT = path.join(__dirname, '../public/data');
const PRIVATE_DATA_ROOT = path.join(__dirname, '../private/data');

function resolveDataRoot() {
  if (process.env.B_SYSTEM_DATA_ROOT) {
    return path.resolve(process.env.B_SYSTEM_DATA_ROOT);
  }
  if (fs.existsSync(PRIVATE_DATA_ROOT)) {
    return PRIVATE_DATA_ROOT;
  }
  return PUBLIC_DATA_ROOT;
}

const DATA_ROOT = resolveDataRoot();
const DB_SCHEMA_PATH = path.join(__dirname, 'sql', 'progression-schema.sql');
const ACTIVE_STATUSES = ['announced', 'in_progress', 'court_approved'];
const DB_CACHE = new Map();
const realtimeClients = new Set();
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
  if (!columnNames.has('finished_at')) {
    await runSql(db, `ALTER TABLE matches ADD COLUMN finished_at TEXT`);
  }
  const resultColumns = await allSql(db, `PRAGMA table_info(results)`);
  const resultColumnNames = new Set(resultColumns.map((item) => String(item.name)));
  if (!resultColumnNames.has('red_ends_won')) {
    await runSql(db, `ALTER TABLE results ADD COLUMN red_ends_won INTEGER`);
  }
  if (!resultColumnNames.has('blue_ends_won')) {
    await runSql(db, `ALTER TABLE results ADD COLUMN blue_ends_won INTEGER`);
  }
  const tblManual = await getSql(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='manual_result_requests'`);
  if (!tblManual) {
    await execSql(
      db,
      `CREATE TABLE manual_result_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        red_player_id TEXT NOT NULL,
        blue_player_id TEXT NOT NULL,
        red_score INTEGER NOT NULL,
        blue_score INTEGER NOT NULL,
        red_ends_won INTEGER,
        blue_ends_won INTEGER,
        winner_player_id TEXT NOT NULL,
        referee_name TEXT NOT NULL,
        operator_name TEXT,
        note TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewer_name TEXT,
        rejection_reason TEXT,
        FOREIGN KEY (event_id, match_id) REFERENCES matches(event_id, match_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_manual_result_event_status ON manual_result_requests(event_id, status);
      CREATE INDEX IF NOT EXISTS idx_manual_result_event_match ON manual_result_requests(event_id, match_id);`,
    );
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
    finishedAt: row.finished_at,
    courtApprovedAt: row.court_approved_at,
    courtRefereeName: row.court_referee_name,
    hqApprovedAt: row.hq_approved_at,
    hqApproverName: row.hq_approver_name,
    reflectedAt: row.reflected_at,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

const MATCH_STATUS_VALUES = new Set([
  'scheduled',
  'announced',
  'in_progress',
  'court_approved',
  'hq_approved',
  'reflected',
]);

function normalizeResultRow(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    matchId: row.match_id,
    redScore: row.red_score,
    blueScore: row.blue_score,
    redEndsWon: row.red_ends_won,
    blueEndsWon: row.blue_ends_won,
    winnerPlayerId: row.winner_player_id,
    isCorrection: Boolean(row.is_correction),
    correctionReason: row.correction_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeApprovalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    matchId: row.match_id,
    stage: row.stage,
    approverName: row.approver_name,
    approvedAt: row.approved_at,
    metaJson: row.meta_json,
  };
}

function normalizeLockRow(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    lockType: row.lock_type,
    lockKey: row.lock_key,
    matchId: row.match_id,
    createdAt: row.created_at,
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function registerRealtimeClient(ws, filters = {}) {
  realtimeClients.add({ ws, filters });
}

function unregisterRealtimeClient(ws) {
  for (const client of realtimeClients) {
    if (client.ws === ws) {
      realtimeClients.delete(client);
      break;
    }
  }
}

/** 次試合の announce 時に view の CM 静止画オーバーレイを解除する */
async function clearCmOverlayForCourt(eventId, courtId) {
  const cid = String(courtId ?? '').trim();
  if (!cid) {
    return;
  }
  try {
    const courtDir = path.join(DATA_ROOT, eventId, 'court', cid);
    await fs.ensureDir(courtDir);
    const cmPath = path.join(courtDir, 'cm-overlay.json');
    const jsonString = JSON.stringify({ active: false }, null, 2);
    await queueCourtFileWrite(cmPath, () => writeTextFileAtomicResilient(cmPath, jsonString));
    broadcastRealtimeUpdate({ eventId, courtId: cid, filename: 'cm-overlay' });
  } catch (error) {
    console.error('[cm-overlay] clear failed', eventId, courtId, error);
  }
}

function broadcastRealtimeUpdate(payload) {
  const message = JSON.stringify({
    type: 'scoreboard-updated',
    updatedAt: toIsoNow(),
    ...payload,
  });
  for (const client of realtimeClients) {
    const { ws, filters } = client;
    if (ws.readyState !== ws.OPEN) {
      continue;
    }
    if (filters.eventId && filters.eventId !== payload.eventId) {
      continue;
    }
    if (filters.courtId && filters.courtId !== payload.courtId) {
      continue;
    }
    ws.send(message);
  }
}

/** 他プロセス・同一プロセスの書き込み直後に空／途中までのファイルを読むと JSON パースが失敗するためリトライする */
async function readJsonFileWithRetry(absolutePath, attempts = 5, delayMs = 20) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fs.readJson(absolutePath);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

/** 書き込み中に GET されないよう、一時ファイルへ書いてから rename（fs-extra move）で置換 */
async function writeTextFileAtomic(filePath, text) {
  const dir = path.dirname(filePath);
  await fs.ensureDir(dir);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tmpPath, text, 'utf8');
    await fs.move(tmpPath, filePath, { overwrite: true });
  } catch (error) {
    await fs.remove(tmpPath).catch(() => {});
    throw error;
  }
}

/** 複数タブ・複数コート同時稼働やウイルス対策のロックで rename が一時失敗することがある */
async function writeTextFileAtomicResilient(filePath, text, options = {}) {
  const maxAttempts = options.maxAttempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 15;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await writeTextFileAtomic(filePath, text);
      return;
    } catch (error) {
      lastError = error;
      const code = error && error.code;
      const retryable =
        code === 'EBUSY' ||
        code === 'EPERM' ||
        code === 'EACCES' ||
        code === 'ENOTEMPTY' ||
        code === 'UNKNOWN' ||
        (typeof error.message === 'string' && /EBUSY|resource busy|being used/i.test(error.message));
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * 同一ファイルへの並行 write（tmp + rename）が重なると Windows 等で失敗しやすいため直列化する
 */
const courtFileWriteQueues = new Map();

function queueCourtFileWrite(filePath, task) {
  const prev = courtFileWriteQueues.get(filePath) || Promise.resolve();
  const next = prev.then(
    () => task(),
    () => task()
  );
  courtFileWriteQueues.set(
    filePath,
    next.then(
      () => {},
      () => {}
    )
  );
  return next;
}

async function writeJsonFileAtomic(filePath, data, options = {}) {
  const spaces = options.spaces ?? 2;
  const jsonString = JSON.stringify(data, null, spaces);
  await writeTextFileAtomic(filePath, jsonString);
}

/** 廃止した red/blue フィールドを除外してから spread（match.ends / 選手マスタで代替） */
function omitLegacyGameTeamFields(side) {
  if (!side || typeof side !== 'object') {
    return {};
  }
  const { scores, affiliation, ...rest } = side;
  return rest;
}

/** game.json 用: match.ends の shots を1行化（PUT /api/data とスナップショットで共通） */
function stringifyGameJsonForDisk(data) {
  let jsonString = JSON.stringify(data, null, 2);
  jsonString = jsonString.replace(
    /(\s+)\{\s+"end":\s+("[^"]+"|\d+),\s+"shots":[\s\S]+?\}/g,
    (full, indent) => {
      return indent + full.replace(/\n/g, '').replace(/\s\s+/g, ' ').trim();
    },
  );
  return jsonString;
}

/**
 * match-snapshots 用: 試合後に不要な UI・タイマー系を除き、視認性のため軽量化する（court の game.json はそのまま）。
 */
function pruneGameSnapshotForDisk(game) {
  if (!game || typeof game !== 'object') {
    return game;
  }
  const out = { ...game };
  delete out.profilePic;
  delete out.screen;
  delete out.warmup;
  delete out.interval;

  if (out.match && typeof out.match === 'object') {
    const m = { ...out.match };
    delete m.end;
    delete m.sectionID;
    delete m.approvals;
    out.match = m;
  }

  const stripSide = (side) => {
    if (!side || typeof side !== 'object') {
      return side;
    }
    const s = { ...side };
    delete s.ball;
    delete s.isRunning;
    delete s.time;
    delete s.scores;
    delete s.affiliation;
    return s;
  };
  if (out.red) {
    out.red = stripSide(out.red);
  }
  if (out.blue) {
    out.blue = stripSide(out.blue);
  }
  return out;
}

/**
 * コート承認直後: 当該コートの game.json を {matchId}-game-snapshot.json に保存（分析用）。
 * 失敗しても court-approve 自体は成功させるため、呼び出し側で try/catch する。
 */
async function writeMatchGameSnapshotAfterCourtApprove(eventId, matchId, courtId) {
  const game = await readJsonUnderEvent(eventId, 'court', courtId, 'game.json');
  if (!game || typeof game !== 'object') {
    console.warn(
      `[game-snapshot] game.json がありません（スキップ） eventId=${eventId} courtId=${courtId} matchId=${matchId}`,
    );
    return { ok: false, reason: 'missing_game' };
  }
  const fileMatchId = game.matchID != null && game.matchID !== '' ? String(game.matchID) : '';
  if (fileMatchId && fileMatchId !== String(matchId)) {
    console.warn(
      `[game-snapshot] matchID が一致しないためスキップ expected=${matchId} actual=${fileMatchId} courtId=${courtId}`,
    );
    return { ok: false, reason: 'match_id_mismatch' };
  }
  const dir = path.join(DATA_ROOT, eventId, 'match-snapshots');
  await fs.ensureDir(dir);
  const filePath = path.join(dir, `${matchId}-game-snapshot.json`);
  const pruned = pruneGameSnapshotForDisk(game);
  const jsonString = stringifyGameJsonForDisk(pruned);
  await writeTextFileAtomic(filePath, jsonString);
  return { ok: true, path: filePath };
}

/**
 * match.ends から規定エンドの勝ちエンド数（タイブレイク用エンドは除外）
 * @param {unknown} ends
 * @returns {{ red: number, blue: number }}
 */
function countRegulationEndsWonFromMatchEnds(ends) {
  if (!Array.isArray(ends)) {
    return { red: 0, blue: 0 };
  }
  let red = 0;
  let blue = 0;
  for (const entry of ends) {
    if (typeof entry?.end !== 'number') {
      continue;
    }
    const rs = Number(entry.redScore ?? 0);
    const bs = Number(entry.blueScore ?? 0);
    if (rs > bs) {
      red += 1;
    } else if (bs > rs) {
      blue += 1;
    }
  }
  return { red, blue };
}

/** コート game.json から勝ちエンドを取得（matchID が一致しない場合は null） */
async function resolveEndsWonFromCourtGame(eventId, courtId, matchId) {
  const cid = String(courtId ?? '').trim();
  const mid = String(matchId ?? '').trim();
  if (!cid || !mid) {
    return { redEndsWon: null, blueEndsWon: null };
  }
  const game = await readJsonUnderEvent(eventId, 'court', cid, 'game.json');
  if (!game || typeof game !== 'object') {
    return { redEndsWon: null, blueEndsWon: null };
  }
  const fileMid = game.matchID != null && game.matchID !== '' ? String(game.matchID) : '';
  if (fileMid && fileMid !== mid) {
    return { redEndsWon: null, blueEndsWon: null };
  }
  const { red, blue } = countRegulationEndsWonFromMatchEnds(game.match?.ends);
  return { redEndsWon: red, blueEndsWon: blue };
}

/** 読み取り: DATA_ROOT を優先し、無ければ public/data（共有 JSON・別 eventId のデモ用） */
async function readJsonUnderEvent(eventId, ...pathSegments) {
  const rel = path.join(eventId, ...pathSegments);
  const primary = path.join(DATA_ROOT, rel);
  if (await fs.pathExists(primary)) {
    return readJsonFileWithRetry(primary);
  }
  const fallback = path.join(PUBLIC_DATA_ROOT, rel);
  if (await fs.pathExists(fallback)) {
    return readJsonFileWithRetry(fallback);
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

async function loadEventInitMatchDefaults(eventId) {
  const initJson = await readJsonUnderEvent(eventId, 'init.json');
  const initMatch = initJson?.match || {};
  const profilePicMode = String(initJson?.profilePic ?? 'enabled');
  const redLimit = Number(initJson?.red?.limit);
  const blueLimit = Number(initJson?.blue?.limit);
  const warmupLimit = Number(initJson?.warmup?.limit);
  const intervalLimit = Number(initJson?.interval?.limit);
  return {
    totalEnds: Number(initMatch.totalEnds) || 6,
    warmup: String(initMatch.warmup || 'simultaneous'),
    interval: String(initMatch.interval || 'enabled'),
    rules: String(initMatch.rules || 'worldBoccia'),
    resultApproval: String(initMatch.resultApproval || 'enabled'),
    tieBreak: String(initMatch.tieBreak || 'finalShot'),
    sections: Array.isArray(initMatch.sections) ? initMatch.sections : undefined,
    profilePicMode,
    redLimit: Number.isFinite(redLimit) ? redLimit : 300000,
    blueLimit: Number.isFinite(blueLimit) ? blueLimit : 300000,
    warmupLimit: Number.isFinite(warmupLimit) ? warmupLimit : 120000,
    intervalLimit: Number.isFinite(intervalLimit) ? intervalLimit : 60000,
  };
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
    // schedule.json / player 変更後も announce が古い SQLite 行を参照しないよう、待機中はペイロードで上書きする
    const canSyncFromSchedule = existing.status === 'scheduled';
    const courtSame = String(existing.court_id ?? '') === String(courtId);
    const redSame = String(existing.red_player_id ?? '') === String(redPlayerId);
    const blueSame = String(existing.blue_player_id ?? '') === String(bluePlayerId);
    const schedSame =
      (scheduledAt == null &&
        (existing.scheduled_at == null || String(existing.scheduled_at).trim() === '')) ||
      String(existing.scheduled_at ?? '') === String(scheduledAt ?? '');
    if (canSyncFromSchedule && !(courtSame && redSame && blueSame && schedSame)) {
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE matches
         SET court_id = ?,
             red_player_id = ?,
             blue_player_id = ?,
             scheduled_at = ?,
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [courtId, redPlayerId, bluePlayerId, scheduledAt, now, eventId, matchId],
      );
      const updated = await getSql(
        db,
        `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
        [eventId, matchId],
      );
      return normalizeMatchRow(updated);
    }
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

/**
 * コート承認の DB 更新（同一 SQLite トランザクション内で呼ぶ）
 * @param {object} manualEnds null のときはコート game.json から勝ちエンドを推定
 */
async function performCourtApproveInTransaction(db, eventId, matchId, options) {
  const {
    refereeName,
    redScore,
    blueScore,
    winnerPlayerId,
    manualEnds = null,
    approvalMeta = { source: 'scoreboard' },
    relaxAnnouncedWithoutFinished = false,
  } = options;
  if (!refereeName) {
    throw createHttpError(400, 'refereeName は必須です');
  }
  const row = await getMatchOrFail(db, eventId, matchId);
  let canCourtApprove =
    row.status === 'in_progress' ||
    (row.status === 'announced' && row.finished_at);
  if (relaxAnnouncedWithoutFinished) {
    canCourtApprove = row.status === 'in_progress' || row.status === 'announced';
  }
  if (!canCourtApprove) {
    throw createHttpError(
      409,
      relaxAnnouncedWithoutFinished
        ? `この試合状態では紙の結果をコート承認できません（現在: ${row.status}）。配信済みまたは試合中のみです。`
        : `court-approve は試合進行中（in_progress）、または終了記録済みの announced のみ可能です（現在: ${row.status}）`,
    );
  }

  let redEndsWon;
  let blueEndsWon;
  if (manualEnds != null && typeof manualEnds === 'object') {
    const r = manualEnds.redEndsWon;
    const b = manualEnds.blueEndsWon;
    redEndsWon = r === '' || r === undefined || r === null ? null : Number(r);
    blueEndsWon = b === '' || b === undefined || b === null ? null : Number(b);
    if (
      (redEndsWon !== null && !Number.isFinite(redEndsWon)) ||
      (blueEndsWon !== null && !Number.isFinite(blueEndsWon))
    ) {
      throw createHttpError(400, '勝ちエンド数が不正です');
    }
  } else {
    const fromCourt = await resolveEndsWonFromCourtGame(eventId, row.court_id, matchId);
    redEndsWon = fromCourt.redEndsWon;
    blueEndsWon = fromCourt.blueEndsWon;
  }

  const now = toIsoNow();
  await runSql(
    db,
    `INSERT INTO results (
          event_id, match_id, red_score, blue_score, red_ends_won, blue_ends_won, winner_player_id, is_correction, correction_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
        ON CONFLICT(event_id, match_id) DO UPDATE SET
          red_score = excluded.red_score,
          blue_score = excluded.blue_score,
          red_ends_won = excluded.red_ends_won,
          blue_ends_won = excluded.blue_ends_won,
          winner_player_id = excluded.winner_player_id,
          updated_at = excluded.updated_at`,
    [eventId, matchId, redScore, blueScore, redEndsWon, blueEndsWon, winnerPlayerId, now, now],
  );
  await runSql(
    db,
    `INSERT INTO approvals (event_id, match_id, stage, approver_name, approved_at, meta_json)
         VALUES (?, ?, 'court', ?, ?, ?)`,
    [eventId, matchId, refereeName, now, JSON.stringify(approvalMeta)],
  );
  await runSql(
    db,
    `UPDATE matches
         SET status = 'court_approved', court_approved_at = ?, court_referee_name = ?, version = version + 1, updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
    [now, refereeName, now, eventId, matchId],
  );
  return getMatchOrFail(db, eventId, matchId);
}

function normalizeManualResultRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    matchId: row.match_id,
    redPlayerId: row.red_player_id,
    bluePlayerId: row.blue_player_id,
    redScore: row.red_score,
    blueScore: row.blue_score,
    redEndsWon: row.red_ends_won,
    blueEndsWon: row.blue_ends_won,
    winnerPlayerId: row.winner_player_id,
    refereeName: row.referee_name,
    operatorName: row.operator_name,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewerName: row.reviewer_name,
    rejectionReason: row.rejection_reason,
  };
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

function parsePlayerThinkingTimeToMs(rawValue) {
  if (rawValue == null) {
    return null;
  }
  if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
    return Math.floor(rawValue);
  }
  const text = String(rawValue).trim();
  if (!text) {
    return null;
  }
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
  }
  const matched = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!matched) {
    return null;
  }
  const minutes = Number(matched[1]);
  const seconds = Number(matched[2]);
  return (minutes * 60 + seconds) * 1000;
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

/** player.json から id → 持ち時間(ms)。値は thinkingTime / thinkingTimeMs を優先 */
async function buildPlayerIdToThinkingTimeMsMap(eventId) {
  const scheduleJson = await readJsonUnderEvent(eventId, 'schedule.json');
  const classCode = scheduleJson?.classCode != null ? String(scheduleJson.classCode) : 'FRD';
  const playersJson = await readJsonUnderEvent(eventId, 'classes', classCode, 'player.json');
  const map = new Map();
  if (Array.isArray(playersJson)) {
    for (const player of playersJson) {
      if (player == null || player.id == null) continue;
      const id = String(player.id).trim();
      if (!id) continue;
      const timeMs =
        parsePlayerThinkingTimeToMs(player.thinkingTime) ??
        parsePlayerThinkingTimeToMs(player.thinkingTimeMs);
      if (timeMs != null) {
        map.set(id, timeMs);
      }
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
  const idToThinkingTimeMs = await buildPlayerIdToThinkingTimeMsMap(eventId);
  const redId = String(match.redPlayerId ?? '').trim();
  const blueId = String(match.bluePlayerId ?? '').trim();
  const redName = idToName.get(redId) || redId;
  const blueName = idToName.get(blueId) || blueId;
  const matchIdStr = String(match.matchId ?? '').trim();
  const matchDisplayName = await resolveAnnounceMatchDisplayName(eventId, matchIdStr);
  const initDefaults = await loadEventInitMatchDefaults(eventId);
  const redLimitMs = idToThinkingTimeMs.get(redId) ?? initDefaults.redLimit;
  const blueLimitMs = idToThinkingTimeMs.get(blueId) ?? initDefaults.blueLimit;

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
  settings.match = {
    ...settings.match,
    totalEnds: initDefaults.totalEnds,
    warmup: initDefaults.warmup,
    interval: initDefaults.interval,
    rules: initDefaults.rules,
    resultApproval: initDefaults.resultApproval,
    tieBreak: initDefaults.tieBreak,
    ...(initDefaults.sections ? { sections: initDefaults.sections } : {}),
  };
  settings.red = { ...settings.red, name: redName, limit: redLimitMs };
  settings.blue = { ...settings.blue, name: blueName, limit: blueLimitMs };
  if (initDefaults.profilePicMode === 'none') {
    settings.red.profilePic = '';
    settings.blue.profilePic = '';
  }
  settings.warmup = { ...settings.warmup, limit: initDefaults.warmupLimit };
  settings.interval = { ...settings.interval, limit: initDefaults.intervalLimit };
  settings.matchName = matchDisplayName;
  await writeJsonFileAtomic(settingsPath, settings, { spaces: 2 });
  broadcastRealtimeUpdate({ eventId, courtId, filename: 'settings' });

  let game = {};
  if (await fs.pathExists(gamePath)) {
    game = await fs.readJson(gamePath);
  }
  const nextGame = {
    ...game,
    matchID: matchIdStr || game.matchID || '',
    matchName: matchDisplayName,
    match: {
      ...(game.match || {}),
      totalEnds: initDefaults.totalEnds,
      warmup: initDefaults.warmup,
      interval: initDefaults.interval,
      rules: initDefaults.rules,
      resultApproval: initDefaults.resultApproval,
      tieBreak: initDefaults.tieBreak,
      ...(initDefaults.sections ? { sections: initDefaults.sections } : {}),
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
      isMatchStarted: false,
    },
    warmup: {
      ...(game.warmup || {}),
      limit: initDefaults.warmupLimit,
      isRunning: false,
      time: initDefaults.warmupLimit,
    },
    interval: {
      ...(game.interval || {}),
      limit: initDefaults.intervalLimit,
      isRunning: false,
      time: initDefaults.intervalLimit,
    },
    red: {
      ...omitLegacyGameTeamFields(game.red),
      name: redName,
      playerID: redId,
      limit: redLimitMs,
      ...(initDefaults.profilePicMode === 'none' ? { profilePic: '' } : {}),
      score: 0,
      ball: 6,
      isRunning: false,
      time: redLimitMs,
      isTieBreak: false,
      result: '',
      yellowCard: 0,
      penaltyBall: 0,
      redCard: 0,
    },
    blue: {
      ...omitLegacyGameTeamFields(game.blue),
      name: blueName,
      playerID: blueId,
      limit: blueLimitMs,
      ...(initDefaults.profilePicMode === 'none' ? { profilePic: '' } : {}),
      score: 0,
      ball: 6,
      isRunning: false,
      time: blueLimitMs,
      isTieBreak: false,
      result: '',
      yellowCard: 0,
      penaltyBall: 0,
      redCard: 0,
    },
    courtId: courtId || game.courtId || '',
    lastUpdated: toIsoNow(),
  };
  await writeJsonFileAtomic(gamePath, nextGame, { spaces: 2 });
  broadcastRealtimeUpdate({ eventId, courtId, filename: 'game' });
  await clearCmOverlayForCourt(eventId, courtId);
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
    await writeJsonFileAtomic(settingsPath, settings, { spaces: 2 });
    broadcastRealtimeUpdate({ eventId, courtId, filename: 'settings' });
  }

  if (await fs.pathExists(gamePath)) {
    const game = await fs.readJson(gamePath);
    const nextGame = {
      ...game,
      matchID: '',
      red: {
        ...omitLegacyGameTeamFields(game.red),
        name: SCOREBOARD_DEFAULT_RED_NAME,
        playerID: '',
      },
      blue: {
        ...omitLegacyGameTeamFields(game.blue),
        name: SCOREBOARD_DEFAULT_BLUE_NAME,
        playerID: '',
      },
      lastUpdated: toIsoNow(),
    };
    await writeJsonFileAtomic(gamePath, nextGame, { spaces: 2 });
    broadcastRealtimeUpdate({ eventId, courtId, filename: 'game' });
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
      await writeJsonFileAtomic(settingsPath, settings, { spaces: 2 });
      broadcastRealtimeUpdate({ eventId, courtId, filename: 'settings' });
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
          isMatchStarted: false,
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
          ...omitLegacyGameTeamFields(game.red),
          name: SCOREBOARD_DEFAULT_RED_NAME,
          playerID: '',
          score: 0,
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
          ...omitLegacyGameTeamFields(game.blue),
          name: SCOREBOARD_DEFAULT_BLUE_NAME,
          playerID: '',
          score: 0,
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
      await writeJsonFileAtomic(gamePath, resetGame, { spaces: 2 });
      broadcastRealtimeUpdate({ eventId, courtId, filename: 'game' });
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

// 進行 SQLite 全テーブル参照（本部デバッグ・救済用）
app.get('/api/progress/:eventId/db-overview', async (req, res) => {
  try {
    const { eventId } = req.params;
    const db = await getEventDb(eventId);
    const matchRows = await allSql(
      db,
      `SELECT * FROM matches WHERE event_id = ? ORDER BY scheduled_at ASC, match_id ASC`,
      [eventId],
    );
    const resultRows = await allSql(
      db,
      `SELECT * FROM results WHERE event_id = ? ORDER BY match_id ASC`,
      [eventId],
    );
    const approvalRows = await allSql(
      db,
      `SELECT * FROM approvals WHERE event_id = ? ORDER BY id DESC`,
      [eventId],
    );
    const lockRows = await allSql(
      db,
      `SELECT * FROM active_locks WHERE event_id = ? ORDER BY lock_type ASC, lock_key ASC`,
      [eventId],
    );
    res.json({
      success: true,
      dbPath: getEventDbPath(eventId),
      matches: matchRows.map(normalizeMatchRow),
      results: resultRows.map(normalizeResultRow),
      approvals: approvalRows.map(normalizeApprovalRow),
      activeLocks: lockRows.map(normalizeLockRow),
    });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行 SQLite matches 行の直接更新（状態不整合の救済・検証用。通常フローは専用 API を利用）
app.patch('/api/progress/:eventId/matches/:matchId', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const body = req.body ?? {};
    const patchMap = {
      courtId: 'court_id',
      redPlayerId: 'red_player_id',
      bluePlayerId: 'blue_player_id',
      scheduledAt: 'scheduled_at',
      status: 'status',
      warmupStartedAt: 'warmup_started_at',
      warmupFinishedAt: 'warmup_finished_at',
      startedAt: 'started_at',
      finishedAt: 'finished_at',
      courtApprovedAt: 'court_approved_at',
      courtRefereeName: 'court_referee_name',
      hqApprovedAt: 'hq_approved_at',
      hqApproverName: 'hq_approver_name',
      reflectedAt: 'reflected_at',
    };
    const setParts = [];
    const values = [];
    for (const [camel, snake] of Object.entries(patchMap)) {
      if (!Object.prototype.hasOwnProperty.call(body, camel)) {
        continue;
      }
      let v = body[camel];
      if (v === '') {
        v = null;
      }
      if (camel === 'status' && v != null && !MATCH_STATUS_VALUES.has(String(v))) {
        throw createHttpError(400, `無効な status: ${v}`);
      }
      setParts.push(`${snake} = ?`);
      values.push(v);
    }
    if (setParts.length === 0) {
      throw createHttpError(400, '更新フィールドがありません');
    }
    const now = toIsoNow();
    setParts.push('version = version + 1');
    setParts.push('updated_at = ?');
    values.push(now, eventId, matchId);
    const db = await getEventDb(eventId);
    const updateRun = await runSql(
      db,
      `UPDATE matches SET ${setParts.join(', ')} WHERE event_id = ? AND match_id = ?`,
      values,
    );
    if (!updateRun || Number(updateRun.changes) === 0) {
      throw createHttpError(404, `matchId=${matchId} が見つかりません`);
    }
    const updated = await getSql(
      db,
      `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
      [eventId, matchId],
    );
    res.json({ success: true, match: normalizeMatchRow(updated) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行 SQLite results 行の直接更新
app.patch('/api/progress/:eventId/results/:matchId', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const body = req.body ?? {};
    const patchMap = {
      redScore: 'red_score',
      blueScore: 'blue_score',
      redEndsWon: 'red_ends_won',
      blueEndsWon: 'blue_ends_won',
      winnerPlayerId: 'winner_player_id',
      isCorrection: 'is_correction',
      correctionReason: 'correction_reason',
    };
    const setParts = [];
    const values = [];
    for (const [camel, snake] of Object.entries(patchMap)) {
      if (!Object.prototype.hasOwnProperty.call(body, camel)) {
        continue;
      }
      let v = body[camel];
      if (camel === 'correctionReason' && v === '') {
        v = null;
      }
      if (camel === 'winnerPlayerId' && v === '') {
        v = null;
      }
      if (camel === 'isCorrection') {
        v = v ? 1 : 0;
      }
      if (camel === 'redScore' || camel === 'blueScore' || camel === 'redEndsWon' || camel === 'blueEndsWon') {
        if (v === '' || v === null || v === undefined) {
          v = null;
        } else {
          const n = Number(v);
          v = Number.isFinite(n) ? Math.trunc(n) : null;
        }
      }
      setParts.push(`${snake} = ?`);
      values.push(v);
    }
    if (setParts.length === 0) {
      throw createHttpError(400, '更新フィールドがありません');
    }
    const now = toIsoNow();
    setParts.push('updated_at = ?');
    values.push(now, eventId, matchId);
    const db = await getEventDb(eventId);
    const updateRun = await runSql(
      db,
      `UPDATE results SET ${setParts.join(', ')} WHERE event_id = ? AND match_id = ?`,
      values,
    );
    if (!updateRun || Number(updateRun.changes) === 0) {
      throw createHttpError(404, `results に matchId=${matchId} がありません`);
    }
    const updated = await getSql(
      db,
      `SELECT * FROM results WHERE event_id = ? AND match_id = ?`,
      [eventId, matchId],
    );
    res.json({ success: true, result: normalizeResultRow(updated) });
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
             finished_at = NULL,
             court_approved_at = NULL,
             court_referee_name = NULL,
             hq_approved_at = NULL,
             hq_approver_name = NULL,
             reflected_at = NULL,
             version = version + 1,
             updated_at = ?`,
        [now],
      );
      await runSql(db, `DELETE FROM manual_result_requests WHERE event_id = ?`, [eventId]);
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
             finished_at = NULL,
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
             finished_at = NULL,
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
    const matchStarted = req.body?.matchStarted === true;
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
      const shouldBeInProgress = isInProgressSection && (matchStarted || Boolean(row.started_at));
      const nextStatus = shouldBeInProgress ? 'in_progress' : 'announced';
      const nextWarmupStartedAt = isStandby ? null : (isWarmup ? (row.warmup_started_at || now) : (row.warmup_started_at || now));
      const nextWarmupFinishedAt = isInProgressSection ? (row.warmup_finished_at || now) : null;
      const nextStartedAt = isStandby || isWarmup
        ? null
        : (matchStarted ? (row.started_at || now) : (row.started_at || null));
      const nextFinishedAt = isStandby || isWarmup
        ? null
        : (section === 'matchFinished' ? (row.finished_at || now) : (row.finished_at || null));
      const isNoop =
        row.status === nextStatus &&
        (row.warmup_started_at || null) === nextWarmupStartedAt &&
        (row.warmup_finished_at || null) === nextWarmupFinishedAt &&
        (row.started_at || null) === nextStartedAt &&
        (row.finished_at || null) === nextFinishedAt;
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
             finished_at = ?,
             version = version + 1,
             updated_at = ?
         WHERE event_id = ? AND match_id = ?`,
        [
          nextStatus,
          nextWarmupStartedAt,
          nextWarmupFinishedAt,
          nextStartedAt,
          nextFinishedAt,
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

    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () =>
      performCourtApproveInTransaction(db, eventId, matchId, {
        refereeName,
        redScore,
        blueScore,
        winnerPlayerId,
        manualEnds: null,
        approvalMeta: { source: 'scoreboard' },
        relaxAnnouncedWithoutFinished: false,
      }),
    );

    try {
      await writeMatchGameSnapshotAfterCourtApprove(eventId, matchId, result.court_id);
    } catch (snapshotError) {
      console.error('[game-snapshot] 書き込み失敗（court-approve は成功のまま）', snapshotError);
    }

    res.json({ success: true, match: normalizeMatchRow(result) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 紙スコアシート用: 承認待ち一覧
app.get('/api/progress/:eventId/manual-result-requests/pending', async (req, res) => {
  try {
    const { eventId } = req.params;
    const db = await getEventDb(eventId);
    const rows = await allSql(
      db,
      `SELECT * FROM manual_result_requests
       WHERE event_id = ? AND status = 'pending'
       ORDER BY created_at ASC`,
      [eventId],
    );
    res.json({ requests: rows.map(normalizeManualResultRequestRow) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 紙スコアシート用: 当該試合の承認待ち（1件）
app.get('/api/progress/:eventId/matches/:matchId/manual-result-request', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const db = await getEventDb(eventId);
    const row = await getSql(
      db,
      `SELECT * FROM manual_result_requests
       WHERE event_id = ? AND match_id = ? AND status = 'pending'`,
      [eventId, matchId],
    );
    res.json({ request: normalizeManualResultRequestRow(row) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 紙スコアシート用: オペレーターが内容を送信（前回の pending は上書き）
app.post('/api/progress/:eventId/matches/:matchId/manual-result-request', async (req, res) => {
  try {
    const { eventId, matchId } = req.params;
    const {
      redPlayerId,
      bluePlayerId,
      redScore,
      blueScore,
      redEndsWon,
      blueEndsWon,
      winnerPlayerId,
      refereeName,
      operatorName = null,
      note = null,
    } = req.body ?? {};
    if (!refereeName || String(refereeName).trim() === '') {
      throw createHttpError(400, 'refereeName（審判名）は必須です');
    }
    const rs = Number(redScore);
    const bs = Number(blueScore);
    if (!Number.isFinite(rs) || !Number.isFinite(bs) || rs < 0 || bs < 0) {
      throw createHttpError(400, 'redScore / blueScore は 0 以上の数値で指定してください');
    }
    const wid = String(winnerPlayerId ?? '').trim();
    if (!wid) {
      throw createHttpError(400, 'winnerPlayerId は必須です');
    }
    const db = await getEventDb(eventId);
    const out = await withTransaction(db, async () => {
      const m = await getMatchOrFail(db, eventId, matchId);
      if (m.status !== 'announced' && m.status !== 'in_progress') {
        throw createHttpError(
          409,
          `紙の結果の入力は配信済み（announced）または試合中（in_progress）の試合のみ可能です（現在: ${m.status}）`,
        );
      }
      const rId = String(redPlayerId ?? '').trim();
      const bId = String(bluePlayerId ?? '').trim();
      if (rId !== String(m.red_player_id).trim() || bId !== String(m.blue_player_id).trim()) {
        throw createHttpError(400, 'redPlayerId / bluePlayerId は進行DBの当該試合と一致させてください');
      }
      if (wid !== rId && wid !== bId) {
        throw createHttpError(400, 'winnerPlayerId は赤または青の選手IDのいずれかにしてください');
      }
      const re = redEndsWon === '' || redEndsWon === undefined || redEndsWon === null ? null : Number(redEndsWon);
      const be = blueEndsWon === '' || blueEndsWon === undefined || blueEndsWon === null ? null : Number(blueEndsWon);
      if (re != null && (!Number.isFinite(re) || re < 0)) {
        throw createHttpError(400, 'redEndsWon が不正です');
      }
      if (be != null && (!Number.isFinite(be) || be < 0)) {
        throw createHttpError(400, 'blueEndsWon が不正です');
      }
      const now = toIsoNow();
      await runSql(
        db,
        `DELETE FROM manual_result_requests
         WHERE event_id = ? AND match_id = ? AND status = 'pending'`,
        [eventId, matchId],
      );
      await runSql(
        db,
        `INSERT INTO manual_result_requests (
          event_id, match_id, red_player_id, blue_player_id,
          red_score, blue_score, red_ends_won, blue_ends_won,
          winner_player_id, referee_name, operator_name, note,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          eventId,
          matchId,
          rId,
          bId,
          Math.trunc(rs),
          Math.trunc(bs),
          re,
          be,
          wid,
          String(refereeName).trim(),
          operatorName != null && String(operatorName).trim() !== '' ? String(operatorName).trim() : null,
          note != null && String(note).trim() !== '' ? String(note).trim() : null,
          now,
        ],
      );
      const created = await getSql(
        db,
        `SELECT * FROM manual_result_requests
         WHERE event_id = ? AND match_id = ? AND status = 'pending'
         ORDER BY id DESC LIMIT 1`,
        [eventId, matchId],
      );
      return created;
    });
    res.json({ success: true, request: normalizeManualResultRequestRow(out) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 紙スコアシート用: エディタ承認 → 通常のコート承認と同じ results / 承認記録
app.post('/api/progress/:eventId/manual-result-requests/:requestId/approve', async (req, res) => {
  try {
    const { eventId, requestId: requestIdRaw } = req.params;
    const requestId = Number(requestIdRaw);
    const { reviewerName } = req.body ?? {};
    if (!reviewerName || String(reviewerName).trim() === '') {
      throw createHttpError(400, 'reviewerName（承認者名）は必須です');
    }
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw createHttpError(400, 'requestId が不正です');
    }
    const db = await getEventDb(eventId);
    const result = await withTransaction(db, async () => {
      const reqRow = await getSql(
        db,
        `SELECT * FROM manual_result_requests WHERE id = ? AND event_id = ?`,
        [requestId, eventId],
      );
      if (!reqRow) {
        throw createHttpError(404, '申請が見つかりません');
      }
      if (reqRow.status !== 'pending') {
        throw createHttpError(409, 'この申請は既に処理済みです');
      }
      const m = await getMatchOrFail(db, eventId, reqRow.match_id);
      if (
        String(m.red_player_id) !== String(reqRow.red_player_id) ||
        String(m.blue_player_id) !== String(reqRow.blue_player_id)
      ) {
        throw createHttpError(409, '進行上の当該試合の選手IDと申請内容が一致しません。申請を取り下げて再送してください。');
      }
      const matchResult = await performCourtApproveInTransaction(db, eventId, reqRow.match_id, {
        refereeName: reqRow.referee_name,
        redScore: reqRow.red_score,
        blueScore: reqRow.blue_score,
        winnerPlayerId: reqRow.winner_player_id,
        manualEnds: { redEndsWon: reqRow.red_ends_won, blueEndsWon: reqRow.blue_ends_won },
        approvalMeta: { source: 'manual_paper', manualResultRequestId: requestId, reviewedBy: String(reviewerName).trim() },
        relaxAnnouncedWithoutFinished: true,
      });
      const now = toIsoNow();
      await runSql(
        db,
        `UPDATE manual_result_requests
         SET status = 'approved', reviewed_at = ?, reviewer_name = ?
         WHERE id = ? AND event_id = ?`,
        [now, String(reviewerName).trim(), requestId, eventId],
      );
      return matchResult;
    });
    try {
      await writeMatchGameSnapshotAfterCourtApprove(eventId, result.match_id, result.court_id);
    } catch (snapshotError) {
      console.error('[game-snapshot] 書き込み失敗（manual-result approve は成功のまま）', snapshotError);
    }
    res.json({ success: true, match: normalizeMatchRow(result), requestId });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 紙スコアシート用: エディタ却下
app.post('/api/progress/:eventId/manual-result-requests/:requestId/reject', async (req, res) => {
  try {
    const { eventId, requestId: requestIdRaw } = req.params;
    const requestId = Number(requestIdRaw);
    const { reviewerName, rejectionReason = '' } = req.body ?? {};
    if (!reviewerName || String(reviewerName).trim() === '') {
      throw createHttpError(400, 'reviewerName（承認者名）は必須です');
    }
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw createHttpError(400, 'requestId が不正です');
    }
    const db = await getEventDb(eventId);
    const now = toIsoNow();
    const run = await runSql(
      db,
      `UPDATE manual_result_requests
       SET status = 'rejected',
           reviewed_at = ?,
           reviewer_name = ?,
           rejection_reason = ?
       WHERE id = ? AND event_id = ? AND status = 'pending'`,
      [
        now,
        String(reviewerName).trim(),
        rejectionReason != null && String(rejectionReason).trim() !== ''
          ? String(rejectionReason).trim()
          : null,
        requestId,
        eventId,
      ],
    );
    if (!run || Number(run.changes) === 0) {
      throw createHttpError(404, 'pending の申請が見つかりません');
    }
    const row = await getSql(db, `SELECT * FROM manual_result_requests WHERE id = ? AND event_id = ?`, [
      requestId,
      eventId,
    ]);
    res.json({ success: true, request: normalizeManualResultRequestRow(row) });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: 本部承認時に hq_approved へ遷移
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
         SET status = 'hq_approved',
             hq_approved_at = ?,
             hq_approver_name = ?,
             version = version + 1,
             updated_at = ?
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
      const { redEndsWon, blueEndsWon } = await resolveEndsWonFromCourtGame(eventId, row.court_id, matchId);
      await runSql(
        db,
        `INSERT INTO results (
          event_id, match_id, red_score, blue_score, red_ends_won, blue_ends_won, winner_player_id, is_correction, correction_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(event_id, match_id) DO UPDATE SET
          red_score = excluded.red_score,
          blue_score = excluded.blue_score,
          red_ends_won = excluded.red_ends_won,
          blue_ends_won = excluded.blue_ends_won,
          winner_player_id = excluded.winner_player_id,
          is_correction = 1,
          correction_reason = excluded.correction_reason,
          updated_at = excluded.updated_at`,
        [eventId, matchId, redScore, blueScore, redEndsWon, blueEndsWon, winnerPlayerId, correctionReason, now, now],
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
        `SELECT event_id, match_id, red_score, blue_score, red_ends_won, blue_ends_won, winner_player_id, is_correction, correction_reason, updated_at
         FROM results
         WHERE event_id = ? AND match_id = ?`,
        [eventId, matchId],
      );
      return { match, result };
    });
    res.json({
      success: true,
      match: normalizeMatchRow(data.match),
      result: normalizeResultRow(data.result),
    });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 掲示スケジュール用: 本部承認前だが results にスコアがある試合（試合中・コート承認済みなど）
// ※ all-games は game.json 依存のため、DBのみ更新したプレビューや配信前の暫定結果を表示するために使う
app.get('/api/progress/:eventId/schedule-overlay-scores', async (req, res) => {
  try {
    const { eventId } = req.params;
    const db = await getEventDb(eventId);
    const rows = await allSql(
      db,
      `SELECT
         m.match_id,
         m.red_player_id,
         m.blue_player_id,
         m.status,
         r.red_score,
         r.blue_score,
         r.winner_player_id
       FROM matches m
       INNER JOIN results r
         ON r.event_id = m.event_id AND r.match_id = m.match_id
       WHERE m.event_id = ?
         AND m.status IN ('announced', 'in_progress', 'court_approved')
         AND r.red_score IS NOT NULL
         AND r.blue_score IS NOT NULL`,
      [eventId],
    );
    res.json({ matches: rows });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 進行システム: /pool/standings 用の最小データ取得
app.get('/api/progress/:eventId/pool/standings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const db = await getEventDb(eventId);
    const statuses = ['hq_approved', 'reflected'];
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
         r.red_ends_won,
         r.blue_ends_won,
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

// 選手一覧: player.json を取得（classCode は schedule.json から解決）
app.get('/api/data/:eventId/players', async (req, res) => {
  try {
    const { eventId } = req.params;
    const scheduleJson = await readJsonUnderEvent(eventId, 'schedule.json');
    const classCode = scheduleJson?.classCode != null ? String(scheduleJson.classCode) : 'FRD';
    const players = await readJsonUnderEvent(eventId, 'classes', classCode, 'player.json');
    if (!Array.isArray(players)) {
      throw createHttpError(404, 'player.json が見つかりません');
    }
    res.json({ classCode, players });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// 選手一覧: player.json を更新（本部 HQ 用）
app.put('/api/hq/:eventId/players', async (req, res) => {
  try {
    const { eventId } = req.params;
    const players = req.body?.players;
    if (!Array.isArray(players)) {
      throw createHttpError(400, 'players は配列で指定してください');
    }

    const scheduleJson = await readJsonUnderEvent(eventId, 'schedule.json');
    const classCode = scheduleJson?.classCode != null ? String(scheduleJson.classCode) : 'FRD';
    const filePath = path.join(DATA_ROOT, eventId, 'classes', classCode, 'player.json');
    await fs.ensureDir(path.dirname(filePath));
    await writeJsonFileAtomic(filePath, players, { spaces: 2 });

    res.json({ success: true, classCode, count: players.length });
  } catch (error) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
});

// データを更新する汎用APIエンドポイント
app.put('/api/data/:eventId/court/:courtId/:filename', async (req, res) => {
  try {
    const { eventId, courtId, filename } = req.params;
    let data = req.body;

    if (filename === 'game' && (data == null || typeof data !== 'object' || Array.isArray(data))) {
      throw createHttpError(400, 'game 更新は JSON オブジェクトの body が必要です');
    }

    // ファイルパスを構築
    const filePath = path.join(DATA_ROOT, eventId, 'court', courtId, `${filename}.json`);
    
    // ディレクトリが存在しない場合は作成
    await fs.ensureDir(path.dirname(filePath));
    
    if (filename === 'settings' && data && typeof data === 'object') {
      const existing = await readJsonUnderEvent(eventId, 'court', courtId, 'settings.json');
      if (existing && typeof existing === 'object') {
        const next = {
          ...existing,
          ...data,
          match: { ...(existing.match || {}), ...(data.match || {}) },
          red: { ...(existing.red || {}), ...(data.red || {}) },
          blue: { ...(existing.blue || {}), ...(data.blue || {}) },
          warmup: { ...(existing.warmup || {}), ...(data.warmup || {}) },
          interval: { ...(existing.interval || {}), ...(data.interval || {}) },
        };
        const incomingRedName = String(data?.red?.name ?? '').trim();
        const incomingBlueName = String(data?.blue?.name ?? '').trim();
        const existingRedName = String(existing?.red?.name ?? '').trim();
        const existingBlueName = String(existing?.blue?.name ?? '').trim();
        const shouldKeepRedName =
          ['Red', ''].includes(incomingRedName) &&
          existingRedName !== '' &&
          existingRedName !== 'Red';
        const shouldKeepBlueName =
          ['Blue', ''].includes(incomingBlueName) &&
          existingBlueName !== '' &&
          existingBlueName !== 'Blue';
        if (shouldKeepRedName) {
          next.red = { ...(next.red || {}), name: existingRedName };
        }
        if (shouldKeepBlueName) {
          next.blue = { ...(next.blue || {}), name: existingBlueName };
        }
        data = next;
      }
    }

    const jsonString =
      filename === 'game' ? stringifyGameJsonForDisk(data) : JSON.stringify(data, null, 2);

    await queueCourtFileWrite(filePath, () => writeTextFileAtomicResilient(filePath, jsonString));
    broadcastRealtimeUpdate({ eventId, courtId, filename });
    res.json({ success: true });
  } catch (error) {
    console.error('[PUT /api/data]', req.params?.eventId, req.params?.courtId, req.params?.filename, error);
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
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

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/api/realtime') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } catch {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const eventId = String(url.searchParams.get('eventId') || '').trim();
  const courtId = String(url.searchParams.get('courtId') || '').trim();
  registerRealtimeClient(ws, { eventId, courtId });
  ws.send(JSON.stringify({ type: 'connected', eventId, courtId, updatedAt: toIsoNow() }));
  ws.on('close', () => {
    unregisterRealtimeClient(ws);
  });
  ws.on('error', () => {
    unregisterRealtimeClient(ws);
  });
});

// サーバー起動
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIPAddress();
  console.log(`Data root (primary): ${DATA_ROOT}`);
  if (path.resolve(DATA_ROOT) !== path.resolve(PUBLIC_DATA_ROOT)) {
    console.log(`Data root (fallback): ${PUBLIC_DATA_ROOT}`);
  }
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server running on http://${localIP}:${PORT}`);
  console.log(`Realtime WS: ws://localhost:${PORT}/api/realtime`);
  console.log(`IP: ${localIP}:${PORT}`);
});
