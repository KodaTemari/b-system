/**
 * デザイン・検証用: schedule.json を読み、指定時刻スロットを「いまここ」として大会進行っぽいデータを SQLite に書き込む。
 *
 * - 指定時刻より前に開始する試合: すべて勝敗確定（hq_approved + results に勝者あり）
 * - 指定時刻の試合: 試合中・勝者未確定（in_progress）。2エンド想定で合計点が常に 2 以上になるスコアのみ（1-0/0-1 は出さない）
 *
 * 使い方:
 *   cd server && node scripts/seedInProgressAtSlot.js <eventId> [HH:MM]
 * 例:
 *   node scripts/seedInProgressAtSlot.js bgp-2026-preliminary 11:30
 *
 * データルート: 環境変数 B_SYSTEM_DATA_ROOT がなければ private/data → public/data（server.js と同様）
 */

const fs = require('fs-extra');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PUBLIC_DATA_ROOT = path.join(__dirname, '../../public/data');
const PRIVATE_DATA_ROOT = path.join(__dirname, '../../private/data');

const SEED_APPROVER = 'seed-preview';
const SEED_REFEREE = 'seed-preview';

function resolveDataRoot() {
  if (process.env.B_SYSTEM_DATA_ROOT) {
    return path.resolve(process.env.B_SYSTEM_DATA_ROOT);
  }
  return fs.existsSync(PRIVATE_DATA_ROOT) ? PRIVATE_DATA_ROOT : PUBLIC_DATA_ROOT;
}

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

function openDb(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(db);
    });
  });
}

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

/** schedule の scheduledStart が Asia/Tokyo で指定の時刻か */
function isTokyoTimeSlot(iso, hour, minute) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  return h === hour && m === minute;
}

function randomIntInclusive(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** 同点以外のスコアと勝者 playerId。2エンド相当で合計が常に 2 以上（1-0 / 0-1 は除外） */
function randomDecisiveScores(redPlayerId, bluePlayerId) {
  let redScore;
  let blueScore;
  do {
    redScore = randomIntInclusive(0, 5);
    blueScore = randomIntInclusive(0, 5);
  } while (redScore === blueScore || redScore + blueScore < 2);
  const winnerPlayerId = redScore > blueScore ? redPlayerId : bluePlayerId;
  return { redScore, blueScore, winnerPlayerId };
}

/**
 * 終了試合用: 通常勝ち・または同点からのタイブレーク勝ち（1-1 / 2-2 など）を混在
 */
function randomFinishedMatchScores(redPlayerId, bluePlayerId) {
  const roll = Math.random();
  if (roll < 0.35) {
    const tiedLevel = [1, 2, 3][randomIntInclusive(0, 2)];
    const redScore = tiedLevel;
    const blueScore = tiedLevel;
    const winnerPlayerId = Math.random() < 0.5 ? redPlayerId : bluePlayerId;
    return { redScore, blueScore, winnerPlayerId, pattern: 'tiebreak' };
  }
  const dec = randomDecisiveScores(redPlayerId, bluePlayerId);
  return { ...dec, pattern: 'decisive' };
}

async function resolveSchedulePath(eventId, dataRoot) {
  const primary = path.join(dataRoot, eventId, 'schedule.json');
  if (await fs.pathExists(primary)) {
    return primary;
  }
  const fallback = path.join(PUBLIC_DATA_ROOT, eventId, 'schedule.json');
  if (await fs.pathExists(fallback)) {
    return fallback;
  }
  return null;
}

/** server.js の ensureProgressionSchema と同様（古いDBに列を足す） */
async function ensureSchema(db) {
  const schemaPath = path.join(__dirname, '../sql/progression-schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  await execSql(db, schemaSql);
  const columns = await allSql(db, 'PRAGMA table_info(matches)');
  const columnNames = new Set(columns.map((item) => String(item.name)));
  if (!columnNames.has('warmup_started_at')) {
    await runSql(db, 'ALTER TABLE matches ADD COLUMN warmup_started_at TEXT');
  }
  if (!columnNames.has('warmup_finished_at')) {
    await runSql(db, 'ALTER TABLE matches ADD COLUMN warmup_finished_at TEXT');
  }
  if (!columnNames.has('finished_at')) {
    await runSql(db, 'ALTER TABLE matches ADD COLUMN finished_at TEXT');
  }
  const resultColumns = await allSql(db, 'PRAGMA table_info(results)');
  const resultColumnNames = new Set(resultColumns.map((item) => String(item.name)));
  if (!resultColumnNames.has('red_ends_won')) {
    await runSql(db, 'ALTER TABLE results ADD COLUMN red_ends_won INTEGER');
  }
  if (!resultColumnNames.has('blue_ends_won')) {
    await runSql(db, 'ALTER TABLE results ADD COLUMN blue_ends_won INTEGER');
  }
}

/**
 * 指定スロットより前の試合を本部承認済み・結果確定で上書き
 */
async function upsertFinishedMatch(db, eventId, match, now) {
  const matchId = String(match.matchId ?? '').trim();
  const courtId = String(match.courtId ?? '').trim();
  const redPlayerId = String(match.redPlayerId ?? '').trim();
  const bluePlayerId = String(match.bluePlayerId ?? '').trim();
  const scheduledAt = String(match.scheduledStart ?? '').trim();
  const { redScore, blueScore, winnerPlayerId, pattern } = randomFinishedMatchScores(
    redPlayerId,
    bluePlayerId,
  );

  const t0 = new Date(now);
  const startedAt = new Date(t0.getTime() - 45 * 60 * 1000).toISOString();
  const finishedAt = new Date(t0.getTime() - 20 * 60 * 1000).toISOString();
  const courtApprovedAt = new Date(t0.getTime() - 15 * 60 * 1000).toISOString();
  const hqApprovedAt = new Date(t0.getTime() - 10 * 60 * 1000).toISOString();
  const warmupStartedAt = new Date(t0.getTime() - 55 * 60 * 1000).toISOString();
  const warmupFinishedAt = new Date(t0.getTime() - 50 * 60 * 1000).toISOString();

  await runSql(db, `DELETE FROM active_locks WHERE event_id = ? AND match_id = ?`, [eventId, matchId]);

  const existing = await getSql(
    db,
    `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
    [eventId, matchId],
  );

  if (!existing) {
    await runSql(
      db,
      `INSERT INTO matches (
        event_id, match_id, court_id, red_player_id, blue_player_id,
        scheduled_at, status,
        warmup_started_at, warmup_finished_at, started_at,
        finished_at, court_approved_at, court_referee_name,
        hq_approved_at, hq_approver_name, reflected_at,
        version, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 'hq_approved',
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, NULL,
        1, ?
      )`,
      [
        eventId,
        matchId,
        courtId,
        redPlayerId,
        bluePlayerId,
        scheduledAt,
        warmupStartedAt,
        warmupFinishedAt,
        startedAt,
        finishedAt,
        courtApprovedAt,
        SEED_REFEREE,
        hqApprovedAt,
        SEED_APPROVER,
        now,
      ],
    );
  } else {
    await runSql(
      db,
      `UPDATE matches SET
        status = 'hq_approved',
        warmup_started_at = COALESCE(warmup_started_at, ?),
        warmup_finished_at = COALESCE(warmup_finished_at, ?),
        started_at = COALESCE(started_at, ?),
        finished_at = ?,
        court_approved_at = ?,
        court_referee_name = ?,
        hq_approved_at = ?,
        hq_approver_name = ?,
        reflected_at = NULL,
        version = version + 1,
        updated_at = ?
      WHERE event_id = ? AND match_id = ?`,
      [
        warmupStartedAt,
        warmupFinishedAt,
        startedAt,
        finishedAt,
        courtApprovedAt,
        SEED_REFEREE,
        hqApprovedAt,
        SEED_APPROVER,
        now,
        eventId,
        matchId,
      ],
    );
  }

  await runSql(
    db,
    `INSERT INTO results (
      event_id, match_id, red_score, blue_score, red_ends_won, blue_ends_won, winner_player_id,
      is_correction, correction_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, NULL, ?, ?)
    ON CONFLICT(event_id, match_id) DO UPDATE SET
      red_score = excluded.red_score,
      blue_score = excluded.blue_score,
      red_ends_won = excluded.red_ends_won,
      blue_ends_won = excluded.blue_ends_won,
      winner_player_id = excluded.winner_player_id,
      updated_at = excluded.updated_at`,
    [eventId, matchId, redScore, blueScore, winnerPlayerId, now, now],
  );

  const tbNote = pattern === 'tiebreak' ? '（同点・TB勝）' : '';
  console.log(
    `[完了] ${matchId} court=${courtId} → hq_approved ${redScore}-${blueScore}${tbNote} 勝者 ${winnerPlayerId}`,
  );
}

/**
 * 指定スロットの試合: 対戦カードは schedule どおり・試合中・勝者なし（winner_player_id NULL）。
 * 2エンド想定で合計点が常に 2 以上（1-0/0-1 は含めない）。
 */
async function upsertCurrentSlotInProgressMidMatch(db, eventId, match, now) {
  const matchId = String(match.matchId ?? '').trim();
  const courtId = String(match.courtId ?? '').trim();
  const redPlayerId = String(match.redPlayerId ?? '').trim();
  const bluePlayerId = String(match.bluePlayerId ?? '').trim();
  const scheduledAt = String(match.scheduledStart ?? '').trim();

  const inProgressPatterns = [
    [2, 0],
    [0, 2],
    [0, 3],
    [3, 0],
    [2, 1],
    [1, 2],
    [3, 1],
    [1, 3],
    [2, 2],
    [4, 2],
    [2, 4],
  ];
  const pick = inProgressPatterns[randomIntInclusive(0, inProgressPatterns.length - 1)];
  const redScore = pick[0];
  const blueScore = pick[1];

  const startedAt = new Date(new Date(now).getTime() - 12 * 60 * 1000).toISOString();
  const startedMs = new Date(startedAt).getTime();
  const warmupStartedAt = new Date(startedMs - 22 * 60 * 1000).toISOString();
  const warmupFinishedAt = new Date(startedMs - 6 * 60 * 1000).toISOString();

  await runSql(db, `DELETE FROM active_locks WHERE event_id = ? AND match_id = ?`, [eventId, matchId]);

  const existing = await getSql(
    db,
    `SELECT * FROM matches WHERE event_id = ? AND match_id = ?`,
    [eventId, matchId],
  );

  if (!existing) {
    await runSql(
      db,
      `INSERT INTO matches (
        event_id, match_id, court_id, red_player_id, blue_player_id,
        scheduled_at, status,
        warmup_started_at, warmup_finished_at, started_at,
        finished_at, court_approved_at, court_referee_name,
        hq_approved_at, hq_approver_name, reflected_at,
        version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 1, ?)`,
      [
        eventId,
        matchId,
        courtId,
        redPlayerId,
        bluePlayerId,
        scheduledAt,
        warmupStartedAt,
        warmupFinishedAt,
        startedAt,
        now,
      ],
    );
  } else {
    await runSql(
      db,
      `UPDATE matches SET
        status = 'in_progress',
        warmup_started_at = ?,
        warmup_finished_at = ?,
        started_at = COALESCE(started_at, ?),
        finished_at = NULL,
        court_approved_at = NULL,
        court_referee_name = NULL,
        hq_approved_at = NULL,
        hq_approver_name = NULL,
        reflected_at = NULL,
        version = version + 1,
        updated_at = ?
      WHERE event_id = ? AND match_id = ?`,
      [warmupStartedAt, warmupFinishedAt, startedAt, now, eventId, matchId],
    );
  }

  await runSql(
    db,
    `INSERT INTO results (
      event_id, match_id, red_score, blue_score, red_ends_won, blue_ends_won, winner_player_id,
      is_correction, correction_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, NULL, ?, ?)
    ON CONFLICT(event_id, match_id) DO UPDATE SET
      red_score = excluded.red_score,
      blue_score = excluded.blue_score,
      red_ends_won = excluded.red_ends_won,
      blue_ends_won = excluded.blue_ends_won,
      winner_player_id = NULL,
      updated_at = excluded.updated_at`,
    [eventId, matchId, redScore, blueScore, now, now],
  );

  console.log(
    `[進行中] ${matchId} court=${courtId} → in_progress ${redScore}-${blueScore}（WU済・試合中・勝者なし）`,
  );
}

async function run() {
  const eventId = process.argv[2];
  const timeArg = process.argv[3] || '11:30';
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeArg).trim());
  if (!eventId) {
    console.error('使い方: node scripts/seedInProgressAtSlot.js <eventId> [HH:MM]');
    process.exit(1);
  }
  if (!timeMatch) {
    console.error(`時刻の形式が不正です: ${timeArg}（例: 11:30）`);
    process.exit(1);
  }
  const targetH = parseInt(timeMatch[1], 10);
  const targetM = parseInt(timeMatch[2], 10);

  const dataRoot = resolveDataRoot();
  const schedulePath = await resolveSchedulePath(eventId, dataRoot);
  if (!schedulePath) {
    console.error(`schedule.json が見つかりません: eventId=${eventId}`);
    process.exit(1);
  }

  const schedule = await fs.readJson(schedulePath);
  const matches = Array.isArray(schedule.matches) ? schedule.matches : [];
  const slotMatches = matches.filter((m) => isTokyoTimeSlot(m.scheduledStart, targetH, targetM));

  if (slotMatches.length === 0) {
    console.error(
      `該当スロットの試合がありません（Asia/Tokyo ${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}）。schedule を確認してください。`,
    );
    console.error(`schedulePath=${schedulePath}`);
    process.exit(1);
  }

  const pivotMs = Math.min(...slotMatches.map((m) => new Date(m.scheduledStart).getTime()));

  const beforeMatches = matches.filter((m) => {
    const t = new Date(m.scheduledStart).getTime();
    return Number.isFinite(t) && t < pivotMs;
  });

  const dbPath = path.join(dataRoot, eventId, 'hq-progress.sqlite3');
  await fs.ensureDir(path.dirname(dbPath));

  const db = await openDb(dbPath);
  await runSql(db, 'PRAGMA foreign_keys = ON');
  await ensureSchema(db);

  const now = toIsoNow();
  console.log(`eventId=${eventId}`);
  console.log(`dataRoot=${dataRoot}`);
  console.log(`dbPath=${dbPath}`);
  console.log(`schedulePath=${schedulePath}`);
  console.log(
    `基準スロット=Asia/Tokyo ${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}（${slotMatches.length} 試合）`,
  );
  console.log(`それより前の試合: ${beforeMatches.length} 件 → すべて hq_approved（勝敗確定）`);
  console.log('---');

  for (const match of beforeMatches) {
    const matchId = String(match.matchId ?? '').trim();
    const courtId = String(match.courtId ?? '').trim();
    const redPlayerId = String(match.redPlayerId ?? '').trim();
    const bluePlayerId = String(match.bluePlayerId ?? '').trim();
    if (!matchId || !courtId || !redPlayerId || !bluePlayerId) {
      console.warn(`[SKIP 過去枠] 欠損フィールド: ${JSON.stringify(match)}`);
      continue;
    }
    await upsertFinishedMatch(db, eventId, match, now);
  }

  console.log('--- 基準スロット（試合中・複数スコアパターン・勝者なし） ---');
  for (const match of slotMatches) {
    const matchId = String(match.matchId ?? '').trim();
    const courtId = String(match.courtId ?? '').trim();
    const redPlayerId = String(match.redPlayerId ?? '').trim();
    const bluePlayerId = String(match.bluePlayerId ?? '').trim();
    if (!matchId || !courtId || !redPlayerId || !bluePlayerId) {
      console.warn(`[SKIP スロット] 欠損フィールド: ${JSON.stringify(match)}`);
      continue;
    }
    await upsertCurrentSlotInProgressMidMatch(db, eventId, match, now);
  }

  await new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log('完了（サーバーを動かしている場合は進行DBキャッシュのため一度再起動すると確実です）。');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
