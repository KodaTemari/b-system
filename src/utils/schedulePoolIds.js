/**
 * プール順位表（PoolStandings）とスケジュールヘッダーで共通のプールID収集・色相割り当て。
 * 色相はプール数で色相環を等分（index * 360 / count）。
 */

export const parsePoolMeta = (poolText) => {
  const raw = String(poolText ?? '').trim();
  if (!raw) {
    return { groupId: '', order: null };
  }
  const dashMatch = raw.match(/^([A-Za-z]+)[-_](\d+)$/);
  if (dashMatch) {
    return {
      groupId: dashMatch[1].toUpperCase(),
      order: Number(dashMatch[2]),
    };
  }
  return {
    groupId: raw.toUpperCase(),
    order: null,
  };
};

/**
 * @param {{ poolId?: string, poolOrder?: number }[]} players
 * @param {{ poolId?: string }[]} schedulePools
 * @param {{ poolId?: string }[]} matches
 * @returns {string[]} ソート済みプールID（大文字）
 */
export const collectPoolIds = (players, schedulePools, matches) => {
  const poolSet = new Set();
  for (const pool of schedulePools ?? []) {
    const id = String(pool.poolId ?? '').trim().toUpperCase();
    if (id) {
      poolSet.add(id);
    }
  }
  for (const player of players ?? []) {
    const parsed = parsePoolMeta(player.poolId);
    if (parsed.groupId) {
      poolSet.add(parsed.groupId);
    }
  }
  for (const match of matches ?? []) {
    const id = String(match.poolId ?? '').trim().toUpperCase();
    if (id) {
      poolSet.add(id);
    }
  }
  return Array.from(poolSet).sort((a, b) => a.localeCompare(b, 'ja'));
};

/**
 * @param {string[]} sortedPoolIds collectPoolIds の戻り値
 * @returns {Map<string, number>} poolId → hue (0–360)
 */
export const buildPoolHueMap = (sortedPoolIds) => {
  const map = new Map();
  const count = sortedPoolIds.length;
  if (count === 0) {
    return map;
  }
  const step = 360 / count;
  sortedPoolIds.forEach((id, index) => {
    map.set(id, Math.round(index * step));
  });
  return map;
};

/**
 * PoolStandings ヘッダーと同一の色相・彩度・明度（HSL）。
 * alpha を指定すると同じ色の半透明（スケジュール表ヘッダー用など）。
 * @param {number} hue
 * @param {number} [alpha=1]
 */
export const poolStandingsHeaderHsl = (hue, alpha = 1) => {
  if (alpha >= 1) {
    return `hsl(${hue} 45% 68%)`;
  }
  return `hsl(${hue} 45% 68% / ${alpha})`;
};

/** スケジュールのコート列ヘッダー（プール面の透明度） */
export const SCHEDULE_POOL_SURFACE_ALPHA = 0.3;

/**
 * 進行 DB が in_progress の試合セル、およびプール順位表の行見出し列（同じ 0.2）
 */
export const SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA = 0.2;

/** プール順位表の左上「プール A」セルのみ、やや濃いプール面 */
export const POOL_STANDINGS_TOP_LEFT_HEADER_ALPHA = 0.6;
