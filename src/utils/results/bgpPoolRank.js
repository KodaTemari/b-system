/**
 * BGP 予選の大会申し合わせに基づくプール順位の比較
 * ①勝ち数 ②直接対決（同勝ち選手同士の対戦のみから算出した成績）
 * ③得失点差 ④総得点 ⑤総勝ちエンド数
 */

/**
 * match.ends から規定エンド（数値 end のみ）の勝ちエンド数を数える。タイブレイク用エンドは除外。
 * @param {unknown[]} ends
 * @returns {{ red: number, blue: number }}
 */
export function countRegulationEndsWonFromMatchEnds(ends) {
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

/**
 * 同勝ちグループ内の直接対決用ミニ成績
 * @param {string[]} groupIds
 * @param {Array<{ redId: string, blueId: string, redScore: number, blueScore: number, winnerId: string | null, redEndsWon: number, blueEndsWon: number }>} matchRecords
 * @returns {Map<string, { wins: number, pointsFor: number, pointsAgainst: number, endsWon: number }>}
 */
export function computeMiniStatsForTieBreak(groupIds, matchRecords) {
  const idSet = new Set(groupIds.map((id) => String(id ?? '').trim()).filter(Boolean));
  const stats = new Map();
  for (const id of idSet) {
    stats.set(id, { wins: 0, pointsFor: 0, pointsAgainst: 0, endsWon: 0 });
  }

  for (const m of matchRecords) {
    const redId = String(m.redId ?? '').trim();
    const blueId = String(m.blueId ?? '').trim();
    if (!idSet.has(redId) || !idSet.has(blueId)) {
      continue;
    }

    const redScore = Number(m.redScore ?? 0);
    const blueScore = Number(m.blueScore ?? 0);
    const redEw = Number(m.redEndsWon ?? 0);
    const blueEw = Number(m.blueEndsWon ?? 0);

    const sr = stats.get(redId);
    const sb = stats.get(blueId);
    if (!sr || !sb) {
      continue;
    }

    sr.pointsFor += redScore;
    sr.pointsAgainst += blueScore;
    sb.pointsFor += blueScore;
    sb.pointsAgainst += redScore;
    sr.endsWon += redEw;
    sb.endsWon += blueEw;

    const w = String(m.winnerId ?? '').trim();
    let redWin = false;
    let blueWin = false;
    if (redScore > blueScore) {
      redWin = true;
    } else if (blueScore > redScore) {
      blueWin = true;
    } else if (w === redId) {
      redWin = true;
    } else if (w === blueId) {
      blueWin = true;
    }

    if (redWin) {
      sr.wins += 1;
    } else if (blueWin) {
      sb.wins += 1;
    }
  }

  return stats;
}

/**
 * ③〜⑤（プール全体の得失点差・総得点・総勝ちエンド）
 * @param {Array<{ id: string, pointsFor: number, pointsAgainst: number, endsWon: number }>} rows
 */
function sortByFullPoolTiebreak(rows) {
  return [...rows].sort((a, b) => {
    const fd =
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst);
    if (fd !== 0) {
      return fd;
    }
    if (b.pointsFor !== a.pointsFor) {
      return b.pointsFor - a.pointsFor;
    }
    if (b.endsWon !== a.endsWon) {
      return b.endsWon - a.endsWon;
    }
    return String(a.id).localeCompare(String(b.id), 'ja');
  });
}

/**
 * ミニリーグ統計のタプル（降順ソート用）
 * @param {Map<string, { wins: number, pointsFor: number, pointsAgainst: number, endsWon: number }>} mini
 * @param {string} id
 */
function miniTupleFor(mini, id) {
  const m = mini.get(id) ?? {
    wins: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    endsWon: 0,
  };
  return [
    Number(m.wins ?? 0),
    Number(m.pointsFor ?? 0) - Number(m.pointsAgainst ?? 0),
    Number(m.pointsFor ?? 0),
    Number(m.endsWon ?? 0),
  ];
}

function lexCompareDesc(ta, tb) {
  for (let i = 0; i < ta.length; i++) {
    if (tb[i] !== ta[i]) {
      return tb[i] - ta[i];
    }
  }
  return 0;
}

/**
 * 同勝ちの選手だけで②直接対決（ミニリーグ）を適用し、まだ同順ならサブグループに再帰。
 * ミニリーグでも全員同一なら③〜⑤で決定。
 *
 * @param {Array<{ id: string, wins: number, pointsFor: number, pointsAgainst: number, endsWon: number }>} rows
 * @param {Array<{ redId: string, blueId: string, redScore: number, blueScore: number, winnerId: string | null, redEndsWon: number, blueEndsWon: number }>} matchRecords
 */
export function orderTiedSubgroupByBgpRules(rows, matchRecords) {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return rows;
  }
  const ids = rows.map((r) => String(r.id ?? '').trim()).filter(Boolean);
  const mini = computeMiniStatsForTieBreak(ids, matchRecords);
  const t0 = miniTupleFor(mini, ids[0]);
  const allMiniEqual = ids.every((id) => {
    const t = miniTupleFor(mini, id);
    return t.every((v, i) => v === t0[i]);
  });
  if (allMiniEqual) {
    return sortByFullPoolTiebreak(rows);
  }

  const sorted = [...rows].sort((a, b) => {
    const c = lexCompareDesc(miniTupleFor(mini, a.id), miniTupleFor(mini, b.id));
    if (c !== 0) {
      return c;
    }
    return String(a.id).localeCompare(String(b.id), 'ja');
  });

  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length) {
      const ti = miniTupleFor(mini, sorted[i].id);
      const tj = miniTupleFor(mini, sorted[j].id);
      if (ti.some((v, idx) => v !== tj[idx])) {
        break;
      }
      j++;
    }
    const run = sorted.slice(i, j);
    if (run.length === 1) {
      out.push(run[0]);
    } else {
      out.push(...orderTiedSubgroupByBgpRules(run, matchRecords));
    }
    i = j;
  }
  return out;
}

/**
 * 同勝ち帯の並び替え用（groupIds は同じ wins の選手 id の配列）
 * ペア比較では、その勝ち帯全体のミニリーグ統計で比較する（sortPoolRowsByBgpRules は orderTiedSubgroupByBgpRules を使用）。
 *
 * @param {{ id: string, wins: number, pointsFor: number, pointsAgainst: number, endsWon: number }} a
 * @param {{ id: string, wins: number, pointsFor: number, pointsAgainst: number, endsWon: number }} b
 * @param {string[]} groupIds
 * @param {Array<{ redId: string, blueId: string, redScore: number, blueScore: number, winnerId: string | null, redEndsWon: number, blueEndsWon: number }>} matchRecords
 * @returns {number} sort 用（a が上位なら負）
 */
export function compareBgpPoolStandingRows(a, b, groupIds, matchRecords) {
  if (b.wins !== a.wins) {
    return b.wins - a.wins;
  }
  const mini = computeMiniStatsForTieBreak(groupIds, matchRecords);
  const ma = mini.get(a.id);
  const mb = mini.get(b.id);
  if (!ma || !mb) {
    return String(a.id).localeCompare(String(b.id), 'ja');
  }
  if (mb.wins !== ma.wins) {
    return mb.wins - ma.wins;
  }
  const mdA = ma.pointsFor - ma.pointsAgainst;
  const mdB = mb.pointsFor - mb.pointsAgainst;
  if (mdB !== mdA) {
    return mdB - mdA;
  }
  if (mb.pointsFor !== ma.pointsFor) {
    return mb.pointsFor - ma.pointsFor;
  }
  if (mb.endsWon !== ma.endsWon) {
    return mb.endsWon - ma.endsWon;
  }

  const fdA = a.pointsFor - a.pointsAgainst;
  const fdB = b.pointsFor - b.pointsAgainst;
  if (fdB !== fdA) {
    return fdB - fdA;
  }
  if (b.pointsFor !== a.pointsFor) {
    return b.pointsFor - a.pointsFor;
  }
  if (b.endsWon !== a.endsWon) {
    return b.endsWon - a.endsWon;
  }
  return String(a.id).localeCompare(String(b.id), 'ja');
}

/**
 * @param {Array<{ id: string, wins: number, pointsFor: number, pointsAgainst: number, endsWon: number }>} rows
 * @param {Array<{ redId: string, blueId: string, redScore: number, blueScore: number, winnerId: string | null, redEndsWon: number, blueEndsWon: number }>} matchRecords
 * @returns {typeof rows}
 */
export function sortPoolRowsByBgpRules(rows, matchRecords) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }
  const byWin = new Map();
  for (const row of rows) {
    const w = Number(row.wins ?? 0);
    if (!byWin.has(w)) {
      byWin.set(w, []);
    }
    byWin.get(w).push(row);
  }
  const winLevels = [...byWin.keys()].sort((x, y) => y - x);
  const out = [];
  for (const w of winLevels) {
    const group = byWin.get(w);
    out.push(...orderTiedSubgroupByBgpRules(group, matchRecords));
  }
  return out;
}
