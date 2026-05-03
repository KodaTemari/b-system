import { extractPoolLetterFromMatch } from '../schedule/scheduleDisplayUtils';

/** 当該コートに配信済み・試合中の試合があるときは CM 不可（コートは稼働中） */
export function courtHasAnnouncedOrInProgressMatch(courtId, progressMap) {
  const cid = String(courtId ?? '').trim();
  if (!cid) {
    return false;
  }
  for (const prog of progressMap.values()) {
    if (String(prog?.courtId ?? '').trim() !== cid) {
      continue;
    }
    const st = String(prog?.status ?? '');
    if (st === 'announced' || st === 'in_progress') {
      return true;
    }
  }
  return false;
}

export const toPoolRoundLabel = (match) => {
  if (!match || typeof match !== 'object') {
    return '';
  }
  const poolLetter = extractPoolLetterFromMatch(match);
  if (!poolLetter) {
    return '';
  }
  const explicitRound = Number(match.round);
  if (Number.isFinite(explicitRound) && explicitRound > 0) {
    return `${poolLetter}${explicitRound}`;
  }
  const id = String(match.matchId ?? '').trim();
  const tailRound = id.match(/-(\d{1,2})$/);
  if (tailRound) {
    const n = Number(tailRound[1]);
    if (Number.isFinite(n) && n > 0) {
      return `${poolLetter}${n}`;
    }
  }
  return poolLetter;
};

/** 「コート1 - プール A 1回戦」形式。情報不足時は '' */
export const buildHqMatchContextLabel = (match) => {
  if (!match || typeof match !== 'object') {
    return '';
  }
  const court = String(match.courtId ?? '').trim();
  const courtPart = court ? `コート${court}` : '';
  const poolLetter = extractPoolLetterFromMatch(match);
  const explicitRound = Number(match.round);
  let roundNum = null;
  if (Number.isFinite(explicitRound) && explicitRound > 0) {
    roundNum = explicitRound;
  } else {
    const id = String(match.matchId ?? '').trim();
    const tailRound = id.match(/-(\d{1,2})$/);
    if (tailRound) {
      const n = Number(tailRound[1]);
      if (Number.isFinite(n) && n > 0) {
        roundNum = n;
      }
    }
  }
  let poolSegment = '';
  if (poolLetter && roundNum != null) {
    poolSegment = `プール ${poolLetter} ${roundNum}回戦`;
  } else if (poolLetter) {
    poolSegment = `プール ${poolLetter}`;
  } else if (roundNum != null) {
    poolSegment = `${roundNum}回戦`;
  }
  const parts = [courtPart, poolSegment].filter(Boolean);
  return parts.length > 0 ? parts.join(' - ') : '';
};

/** 本部承認確認モーダル見出し */
export const toHqApproveConfirmModalTitle = (match) =>
  buildHqMatchContextLabel(match) || '本部承認の確認';

/** 手動入力モーダル見出し */
export const toManualPaperModalTitle = (match) => {
  const base = buildHqMatchContextLabel(match);
  return base ? `${base} ＜手動入力＞` : '＜手動入力＞';
};

/** 同一スロットの全コートのうち、進行が待機（scheduled）の試合 */
export const getAnnounceableMatchesForSlot = (slot, courts, slotMatrix, progMap) =>
  courts
    .map((court) => slotMatrix.get(slot)?.get(court))
    .filter(Boolean)
    .filter((match) => {
      const raw = String(progMap.get(String(match.matchId))?.status ?? 'scheduled');
      return raw === 'scheduled';
    });
