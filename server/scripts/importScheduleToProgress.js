const fs = require('fs-extra');
const path = require('path');

const API_BASE = process.env.B_SYSTEM_API_BASE || 'http://127.0.0.1:3001';
const PUBLIC_DATA_ROOT = path.join(__dirname, '../../public/data');
const DATA_ROOT = process.env.B_SYSTEM_DATA_ROOT
  ? path.resolve(process.env.B_SYSTEM_DATA_ROOT)
  : PUBLIC_DATA_ROOT;

function normalizePlayerId(value) {
  return String(value ?? '').trim();
}

async function resolveSchedulePath(eventId) {
  const primary = path.join(DATA_ROOT, eventId, 'schedule.json');
  if (await fs.pathExists(primary)) {
    return primary;
  }
  const fallback = path.join(PUBLIC_DATA_ROOT, eventId, 'schedule.json');
  if (await fs.pathExists(fallback)) {
    return fallback;
  }
  return null;
}

async function registerMatch(eventId, match) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/progress/${eventId}/matches/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(match),
    });
  } catch (error) {
    throw new Error(`API接続失敗 (${API_BASE}): ${error.message}`);
  }
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`register failed (${response.status}): ${errorBody}`);
  }
  return response.json();
}

async function checkApiHealth(eventId) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/progress/${eventId}/matches`);
  } catch (error) {
    throw new Error(`API接続失敗 (${API_BASE}): ${error.message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API応答エラー (${response.status}): ${body}`);
  }
}

async function run() {
  const eventId = process.argv[2];
  if (!eventId) {
    console.error('使い方: node scripts/importScheduleToProgress.js <eventId>');
    process.exit(1);
  }

  const schedulePath = await resolveSchedulePath(eventId);
  if (!schedulePath) {
    console.error(`schedule.json が見つかりません: eventId=${eventId}`);
    process.exit(1);
  }

  const schedule = await fs.readJson(schedulePath);
  const matches = Array.isArray(schedule.matches) ? schedule.matches : [];

  let registered = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`eventId=${eventId}`);
  console.log(`schedule=${schedulePath}`);
  console.log(`total matches=${matches.length}`);
  console.log(`apiBase=${API_BASE}`);

  await checkApiHealth(eventId);

  for (const match of matches) {
    const redPlayerId = normalizePlayerId(match.redPlayerId);
    const bluePlayerId = normalizePlayerId(match.bluePlayerId);

    if (!match.matchId || !match.courtId || !redPlayerId || !bluePlayerId) {
      skipped += 1;
      continue;
    }

    const payload = {
      matchId: String(match.matchId),
      courtId: String(match.courtId),
      redPlayerId,
      bluePlayerId,
      scheduledAt: String(match.scheduledStart ?? ''),
    };

    try {
      await registerMatch(eventId, payload);
      registered += 1;
    } catch (error) {
      failed += 1;
      console.error(`[FAILED] ${payload.matchId}: ${error.message}`);
    }
  }

  console.log('--- import result ---');
  console.log(`registered=${registered}`);
  console.log(`skipped=${skipped}`);
  console.log(`failed=${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
