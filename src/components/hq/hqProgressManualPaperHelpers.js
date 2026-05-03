import {
  MANUAL_PAPER_DEFAULT_REFEREE_NAME,
  MANUAL_PAPER_DEFAULT_TOTAL_ENDS,
  MANUAL_PAPER_MAX_TOTAL_ENDS,
} from './hqProgressConstants.js';

export async function fetchManualPaperTotalEnds(eventId) {
  if (!eventId) {
    return MANUAL_PAPER_DEFAULT_TOTAL_ENDS;
  }
  try {
    const res = await fetch(`/data/${encodeURIComponent(eventId)}/init.json`);
    if (!res.ok) {
      return MANUAL_PAPER_DEFAULT_TOTAL_ENDS;
    }
    const initJson = await res.json();
    const te = Number(initJson?.match?.totalEnds);
    if (Number.isFinite(te) && te >= 1) {
      return Math.min(Math.floor(te), MANUAL_PAPER_MAX_TOTAL_ENDS);
    }
  } catch {
    /* init 未取得時は既定エンド数 */
  }
  return MANUAL_PAPER_DEFAULT_TOTAL_ENDS;
}

export function createEmptyManualPaperMatchEnds(rowCount) {
  const n =
    Number.isFinite(Number(rowCount)) && Number(rowCount) >= 1
      ? Math.min(Math.floor(Number(rowCount)), MANUAL_PAPER_MAX_TOTAL_ENDS)
      : MANUAL_PAPER_DEFAULT_TOTAL_ENDS;
  return Array.from({ length: n }, () => ({ redScore: 0, blueScore: 0 }));
}

/** 公式並びと同様、ID が若い方を左に並べる比較 */
export function comparePlayerIdsForPaperOrder(idA, idB) {
  const a = String(idA ?? '').trim();
  const b = String(idB ?? '').trim();
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return Number(a) - Number(b);
  }
  return a.localeCompare(b, 'ja', { numeric: true });
}

/** 本部モーダル: プレーンテキスト「{id} {選手名}」（`<option>` 等） */
export function formatHqModalPlayerIdName(playerId, playerNameMap) {
  const id = String(playerId ?? '').trim();
  if (!id) {
    return '—';
  }
  const map = playerNameMap instanceof Map ? playerNameMap : new Map();
  const nm = map.get(id);
  const namePart = nm ? String(nm) : '（未登録のID）';
  return `${id} ${namePart}`;
}

/** スコアボード game.json の match.ends を紙申請レビュー表用に正規化 */
export function normalizeScoreboardGameMatchEnds(game) {
  const ends = game?.match?.ends;
  if (!Array.isArray(ends) || ends.length === 0) {
    return [];
  }
  return ends.map((row, i) => {
    const endNum = Number(row?.end ?? i + 1);
    const rs = Math.trunc(Number(row?.redScore ?? 0));
    const bs = Math.trunc(Number(row?.blueScore ?? 0));
    const o = {
      end: endNum,
      shots: Array.isArray(row?.shots) ? row.shots : [],
      redScore: rs,
      blueScore: bs,
    };
    if (row?.isTieBreak === true) {
      o.isTieBreak = true;
    }
    if (row?.tieBreakWinner === 'red' || row?.tieBreakWinner === 'blue') {
      o.tieBreakWinner = row.tieBreakWinner;
    }
    return o;
  });
}

/** コート承認済み試合を ManualPaperRequestReviewDl 向けリクエスト形に組み立てる */
export function buildCourtApproveSyntheticManualRequest(match, colorState, progress) {
  const rId = String(colorState?.redPlayerId || match?.redPlayerId || '').trim();
  const bId = String(colorState?.bluePlayerId || match?.bluePlayerId || '').trim();
  const rs = Number(colorState?.redScore);
  const bs = Number(colorState?.blueScore);
  const ws = colorState?.winnerSide;
  let winnerPlayerId = '';
  if (ws === 'red' && rId) {
    winnerPlayerId = rId;
  } else if (ws === 'blue' && bId) {
    winnerPlayerId = bId;
  }
  const ends = Array.isArray(colorState?.scoreboardMatchEnds) ? colorState.scoreboardMatchEnds : [];
  const refereeName = progress?.courtRefereeName
    ? String(progress.courtRefereeName)
    : MANUAL_PAPER_DEFAULT_REFEREE_NAME;
  if (ends.length > 0) {
    return {
      redPlayerId: rId,
      bluePlayerId: bId,
      winnerPlayerId,
      refereeName,
      matchEnds: ends,
    };
  }
  return {
    redPlayerId: rId,
    bluePlayerId: bId,
    winnerPlayerId,
    refereeName,
    matchEnds: [],
    redScore: Number.isFinite(rs) ? rs : null,
    blueScore: Number.isFinite(bs) ? bs : null,
  };
}
