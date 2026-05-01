/**
 * プール（リーグ）の順位表を試合結果から計算する
 * game.json の配列を渡し、classification ごとにプールとして集計する
 */

import { countRegulationEndsWonFromMatchEnds, sortPoolRowsByBgpRules } from './bgpPoolRank';

/**
 * 試合が完了しているか
 */
export function isGameCompleted(game) {
  if (!game?.match) return false;
  const section = game.match.section || '';
  const redResult = game.red?.result;
  const blueResult = game.blue?.result;
  return (
    section === 'matchFinished' ||
    section === 'resultApproval' ||
    (redResult && blueResult)
  );
}

/**
 * 試合結果一覧用の1試合の要約を返す
 */
export function toMatchSummary({ courtId, game }) {
  const red = game.red || {};
  const blue = game.blue || {};
  const redScore = red.score ?? 0;
  const blueScore = blue.score ?? 0;
  let winner = null;
  if (red.result === 'win') winner = 'red';
  else if (blue.result === 'win') winner = 'blue';
  return {
    courtId,
    redName: red.name || '—',
    blueName: blue.name || '—',
    redScore,
    blueScore,
    winner
  };
}

/**
 * チーム名の略称（表ヘッダー用、最大4文字）
 */
export function getShortName(name, maxLen = 4) {
  const s = (name || '').trim();
  if (!s) return '—';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

/**
 * 対戦ペアを正規化（大小比較で一意キー）
 */
function pairKey(a, b) {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}

/**
 * 全試合から classification ごとの順位表と対戦マトリックスを計算
 * @param {{ courtId: string, game: object }[]} gamesList
 * @returns {{ classification: string, standings: object[], matches: object[], matrix: (object|null)[][], shortNames: string[] }[]}
 */
export function computeStandingsByClassification(gamesList) {
  const completed = gamesList.filter(({ game }) => isGameCompleted(game));
  const byClassification = new Map();

  for (const { courtId, game } of completed) {
    const classification = game.classification || game.category || '';
    const key = classification || '（未設定）';
    if (!byClassification.has(key)) {
      byClassification.set(key, { matches: [], tieMatches: [], players: new Map() });
    }
    const poolData = byClassification.get(key);
    poolData.matches.push(toMatchSummary({ courtId, game }));

    const red = game.red || {};
    const blue = game.blue || {};
    const redName = red.name?.trim() || '—';
    const blueName = blue.name?.trim() || '—';
    const redScore = red.score ?? 0;
    const blueScore = blue.score ?? 0;
    const regulationEnds = countRegulationEndsWonFromMatchEnds(game.match?.ends);
    let winnerId = null;
    if (red.result === 'win') {
      winnerId = redName;
    } else if (blue.result === 'win') {
      winnerId = blueName;
    }

    const ensurePlayer = (name) => {
      if (!poolData.players.has(name)) {
        poolData.players.set(name, {
          name,
          wins: 0,
          losses: 0,
          draws: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          endsWon: 0
        });
      }
      return poolData.players.get(name);
    };

    const redP = ensurePlayer(redName);
    const blueP = ensurePlayer(blueName);
    redP.pointsFor += redScore;
    redP.pointsAgainst += blueScore;
    blueP.pointsFor += blueScore;
    blueP.pointsAgainst += redScore;
    redP.endsWon += regulationEnds.red;
    blueP.endsWon += regulationEnds.blue;

    if (red.result === 'win') {
      redP.wins += 1;
      blueP.losses += 1;
    } else if (blue.result === 'win') {
      blueP.wins += 1;
      redP.losses += 1;
    } else {
      redP.draws += 1;
      blueP.draws += 1;
    }

    poolData.tieMatches.push({
      redId: redName,
      blueId: blueName,
      redScore,
      blueScore,
      winnerId,
      redEndsWon: regulationEnds.red,
      blueEndsWon: regulationEnds.blue
    });
  }

  const result = [];
  for (const [classification, { players, matches, tieMatches }] of byClassification.entries()) {
    const baseRows = Array.from(players.values()).map((p) => ({
      ...p,
      played: p.wins + p.losses + p.draws,
      pointDiff: p.pointsFor - p.pointsAgainst,
      id: p.name
    }));
    const sorted = sortPoolRowsByBgpRules(baseRows, tieMatches);
    const standings = sorted.map((row, index) => {
      const { id: _id, ...rest } = row;
      return { rank: index + 1, ...rest };
    });

    const teamOrder = standings.map((s) => s.name);
    const shortNames = teamOrder.map((name) => getShortName(name));
    const n = teamOrder.length;
    const pairToResult = new Map();
    for (const m of matches) {
      const redName = m.redName?.trim() || '—';
      const blueName = m.blueName?.trim() || '—';
      if (redName === blueName) continue;
      const key = pairKey(redName, blueName);
      if (pairToResult.has(key)) continue;
      pairToResult.set(key, {
        redName,
        blueName,
        redScore: m.redScore,
        blueScore: m.blueScore,
        winner: m.winner
      });
    }

    const matrix = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(null);
          continue;
        }
        const key = pairKey(teamOrder[i], teamOrder[j]);
        const r = pairToResult.get(key);
        if (!r) {
          row.push(null);
          continue;
        }
        const rowIsRed = r.redName === teamOrder[i] && r.blueName === teamOrder[j];
        const scoreRow = rowIsRed ? r.redScore : r.blueScore;
        const scoreCol = rowIsRed ? r.blueScore : r.redScore;
        const rowWon = rowIsRed ? r.winner === 'red' : r.winner === 'blue';
        row.push({ scoreRow, scoreCol, rowWon });
      }
      matrix.push(row);
    }

    result.push({
      classification,
      standings,
      matches,
      matrix,
      shortNames
    });
  }

  return result;
}
