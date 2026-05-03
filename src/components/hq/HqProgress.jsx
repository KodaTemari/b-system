import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  buildPoolHueMap,
  collectPoolIds,
  poolStandingsHeaderHsl,
  SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
  SCHEDULE_POOL_SURFACE_ALPHA,
} from '../../utils/schedulePoolIds';
import '../schedule/Schedule.css';
import './HqProgress.css';
import {
  buildPoolLetterByCourtMap,
  extractPoolLetterFromMatch,
  getScheduleLeftIsCourtRed,
  getScheduleRowPhase,
  isTieBreakScoreSingleDigit,
  isWinnerPlaceholder,
  normalizePlayers,
  renderNameWithLineBreaks,
  toDateTimeLabel,
  toShortMatchId,
  toTimeSlotKey,
} from '../schedule/scheduleDisplayUtils';
import { resolveScoreboardCmImageUrl } from '../../utils/scoreboard/scoreboardCmImage';

const PoolStandings = lazy(() => import('../pool/PoolStandings'));
const PlayerList = lazy(() => import('../players/PlayerList'));

// 将来復活できるよう、試合ID表示はトグルで制御する
const SHOW_MATCH_ID = false;

/** 本部承認（hqApprovedAt）から CM ボタンを出すまでの待ち時間 */
const CM_SHOW_DELAY_MS = 3 * 60 * 1000;

/** 紙結果入力: init.json の match.totalEnds に合わせた行数（未取得時の既定・上限） */
const MANUAL_PAPER_DEFAULT_TOTAL_ENDS = 6;
const MANUAL_PAPER_MAX_TOTAL_ENDS = 50;
const MANUAL_PAPER_DEFAULT_REFEREE_NAME = '主審';

async function fetchManualPaperTotalEnds(eventId) {
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

function createEmptyManualPaperMatchEnds(rowCount) {
  const n =
    Number.isFinite(Number(rowCount)) && Number(rowCount) >= 1
      ? Math.min(Math.floor(Number(rowCount)), MANUAL_PAPER_MAX_TOTAL_ENDS)
      : MANUAL_PAPER_DEFAULT_TOTAL_ENDS;
  return Array.from({ length: n }, () => ({ redScore: 0, blueScore: 0 }));
}

/** 当該コートに配信済み・試合中の試合があるときは CM 不可（コートは稼働中） */
function courtHasAnnouncedOrInProgressMatch(courtId, progressMap) {
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

/** TD（本部承認）モードの承認者名デフォルト（テスト時の入力負荷軽減） */
const DEFAULT_HQ_TD_APPROVER_NAME = 'TD';

const statusLabelMap = {
  scheduled: '待機',
  announced: '配信済み',
  in_progress: '試合中',
  match_finished: '試合終了',
  court_approved: 'コート承認済み',
  hq_approved: '本部承認済み',
};

const statusClassMap = {
  scheduled: 'isScheduled',
  announced: 'isAnnounced',
  in_progress: 'isInProgress',
  match_finished: 'isMatchFinished',
  court_approved: 'isCourtApproved',
  hq_approved: 'isHqApproved',
};

/** 公式並びと同様、ID が若い方を左に並べる比較（数字のみは数値順、それ以外は日本語ロケール順） */
function comparePlayerIdsForPaperOrder(idA, idB) {
  const a = String(idA ?? '').trim();
  const b = String(idB ?? '').trim();
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return Number(a) - Number(b);
  }
  return a.localeCompare(b, 'ja', { numeric: true });
}

/** 本部モーダル: プレーンテキスト「{id} {選手名}」（`<option>` 等） */
function formatHqModalPlayerIdName(playerId, playerNameMap) {
  const id = String(playerId ?? '').trim();
  if (!id) {
    return '—';
  }
  const map = playerNameMap instanceof Map ? playerNameMap : new Map();
  const nm = map.get(id);
  const namePart = nm ? String(nm) : '（未登録のID）';
  return `${id} ${namePart}`;
}

/** 本部モーダル: 選手ID を小さく角丸で表示し、名前は通常サイズ */
function HqModalPlayerIdName({ playerId, playerNameMap }) {
  const id = String(playerId ?? '').trim();
  if (!id) {
    return '—';
  }
  const map = playerNameMap instanceof Map ? playerNameMap : new Map();
  const nm = map.get(id);
  const namePart = nm ? String(nm) : '（未登録のID）';
  return (
    <span className="hqProgressPlayerIdName">
      <span className="hqProgressPlayerIdPill">{id}</span>
      <span className="hqProgressPlayerIdNameText">{namePart}</span>
    </span>
  );
}

const toClockLabel = (isoText) => {
  if (!isoText) return '';
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const toCurrentTimeLabel = () =>
  new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

const toPoolRoundLabel = (match) => {
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
const buildHqMatchContextLabel = (match) => {
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
const toHqApproveConfirmModalTitle = (match) =>
  buildHqMatchContextLabel(match) || '本部承認の確認';

/** 手動入力モーダル見出し: 「コート2 - プール B 2回戦 ＜手動入力＞」形式 */
const toManualPaperModalTitle = (match) => {
  const base = buildHqMatchContextLabel(match);
  return base ? `${base} ＜手動入力＞` : '＜手動入力＞';
};

/** 同一スロットの全コートのうち、進行が待機（scheduled）の試合 */
const getAnnounceableMatchesForSlot = (slot, courts, slotMatrix, progMap) =>
  courts
    .map((court) => slotMatrix.get(slot)?.get(court))
    .filter(Boolean)
    .filter((match) => {
      const raw = String(progMap.get(String(match.matchId))?.status ?? 'scheduled');
      return raw === 'scheduled';
    });

/**
 * 親の nowTick / 進行ポーリングで再レンダーされても、入力中に DOM が差し替わり続けないよう切り離す
 */
const HqProgressManualPaperModal = memo(function HqProgressManualPaperModal({
  match,
  eventId,
  playerNameMap,
  onClose,
  refreshManualPendingMap,
  setOperationMessage,
  setOperationError,
}) {
  const [paperForm, setPaperForm] = useState(() => ({}));
  const [manualPaperSaving, setManualPaperSaving] = useState(false);
  /** 反転ボタンで得点と同期して左右バッジ（赤／青）の見た目を入れ替える */
  const [manualPaperOpSidesInverted, setManualPaperOpSidesInverted] = useState(false);

  const matchId = String(match?.matchId ?? '').trim();

  const matchPaperTotals = useMemo(() => {
    const rows = Array.isArray(paperForm.matchEnds) ? paperForm.matchEnds : [];
    let r = 0;
    let b = 0;
    for (const row of rows) {
      const rs = row.redScore === '' ? NaN : Number(row.redScore);
      const bs = row.blueScore === '' ? NaN : Number(row.blueScore);
      if (Number.isFinite(rs) && rs >= 0) {
        r += Math.trunc(rs);
      }
      if (Number.isFinite(bs) && bs >= 0) {
        b += Math.trunc(bs);
      }
    }
    return { red: r, blue: b };
  }, [paperForm.matchEnds]);

  const showMatchTieBreakWinnerPicker =
    matchPaperTotals.red === matchPaperTotals.blue && matchPaperTotals.red > 0;

  const tieWinnerSideForGrandTotal =
    paperForm.matchTieBreakWinner === 'red' || paperForm.matchTieBreakWinner === 'blue'
      ? paperForm.matchTieBreakWinner
      : '';
  const showTbCircledRedGrandTotal =
    showMatchTieBreakWinnerPicker && tieWinnerSideForGrandTotal === 'red';
  const showTbCircledBlueGrandTotal =
    showMatchTieBreakWinnerPicker && tieWinnerSideForGrandTotal === 'blue';

  const matchTieBreakOptionLabelRed = useMemo(() => {
    const id = String(match?.redPlayerId ?? '').trim();
    if (!id) {
      return '—';
    }
    return formatHqModalPlayerIdName(id, playerNameMap);
  }, [match?.redPlayerId, playerNameMap]);

  const matchTieBreakOptionLabelBlue = useMemo(() => {
    const id = String(match?.bluePlayerId ?? '').trim();
    if (!id) {
      return '—';
    }
    return formatHqModalPlayerIdName(id, playerNameMap);
  }, [match?.bluePlayerId, playerNameMap]);

  useEffect(() => {
    if (!matchId || !eventId) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const totalEnds = await fetchManualPaperTotalEnds(eventId);
      if (cancelled) {
        return;
      }
      const ends = createEmptyManualPaperMatchEnds(totalEnds);
      setPaperForm({
        matchEnds: ends,
        matchTieBreakWinner: '',
        refereeName: MANUAL_PAPER_DEFAULT_REFEREE_NAME,
      });
      setManualPaperOpSidesInverted(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, eventId]);

  const invertManualPaperRedBlue = useCallback(() => {
    setManualPaperOpSidesInverted((v) => !v);
    setPaperForm((f) => {
      let mt = String(f.matchTieBreakWinner ?? '').trim();
      if (mt === 'red') {
        mt = 'blue';
      } else if (mt === 'blue') {
        mt = 'red';
      } else {
        mt = '';
      }
      return {
        ...f,
        matchEnds: Array.isArray(f.matchEnds)
          ? f.matchEnds.map((row) => ({
              redScore: row.blueScore ?? 0,
              blueScore: row.redScore ?? 0,
            }))
          : createEmptyManualPaperMatchEnds(MANUAL_PAPER_DEFAULT_TOTAL_ENDS),
        matchTieBreakWinner: mt,
      };
    });
  }, []);

  const submitManualPaperResult = useCallback(async () => {
    if (!eventId || !matchId) {
      return;
    }
    setManualPaperSaving(true);
    setOperationError('');
    try {
      const rows = Array.isArray(paperForm.matchEnds) ? paperForm.matchEnds : [];
      const matchEnds = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rs = row.redScore === '' ? NaN : Number(row.redScore);
        const bs = row.blueScore === '' ? NaN : Number(row.blueScore);
        if (!Number.isFinite(rs) || !Number.isFinite(bs) || rs < 0 || bs < 0) {
          throw new Error(`エンド ${i + 1} の赤・青得点を 0 以上の数値で入力してください。`);
        }
        matchEnds.push({ end: i + 1, shots: [], redScore: Math.trunc(rs), blueScore: Math.trunc(bs) });
      }
      if (matchEnds.length === 0) {
        throw new Error('エンド別得点を1件以上入力してください。');
      }
      let tr = 0;
      let tb = 0;
      for (const m of matchEnds) {
        tr += m.redScore;
        tb += m.blueScore;
      }
      const rPid = String(match?.redPlayerId ?? '').trim();
      const bPid = String(match?.bluePlayerId ?? '').trim();
      if (!rPid || !bPid) {
        throw new Error('この試合の赤・青の選手IDが進行データにありません。スケジュールを確認してください。');
      }
      let winnerPlayerId = '';
      if (tr > tb) {
        winnerPlayerId = rPid;
      } else if (tb > tr) {
        winnerPlayerId = bPid;
      } else if (tr === 0 && tb === 0) {
        throw new Error('試合合計が 0-0 のため、勝者を自動判定できません。');
      } else {
        const tw =
          paperForm.matchTieBreakWinner === 'red' || paperForm.matchTieBreakWinner === 'blue'
            ? paperForm.matchTieBreakWinner
            : '';
        if (tw !== 'red' && tw !== 'blue') {
          throw new Error('試合同点のため、タイブレーク勝者を選択してください。');
        }
        winnerPlayerId = tw === 'red' ? rPid : bPid;
        let tbIdx = -1;
        for (let k = matchEnds.length - 1; k >= 0; k--) {
          if (matchEnds[k].redScore === matchEnds[k].blueScore) {
            tbIdx = k;
            break;
          }
        }
        if (tbIdx < 0) {
          tbIdx = matchEnds.length - 1;
        }
        matchEnds[tbIdx] = {
          ...matchEnds[tbIdx],
          isTieBreak: true,
          tieBreakWinner: tw,
        };
      }
      const body = {
        redPlayerId: rPid,
        bluePlayerId: bPid,
        matchEnds,
        winnerPlayerId,
        refereeName: String(
          paperForm.refereeName ?? MANUAL_PAPER_DEFAULT_REFEREE_NAME,
        ).trim(),
        operatorName: null,
        note: null,
      };
      if (!body.refereeName) {
        throw new Error('審判名を入力してください。');
      }
      const res = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(matchId)}/manual-result-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '送信に失敗しました。');
      }
      onClose();
      setOperationMessage(
        `${toShortMatchId(matchId)} の申請を送信しました。TD の本部承認を待ちます。`,
      );
      await refreshManualPendingMap();
    } catch (e) {
      setOperationError(e.message || '送信に失敗しました。');
    } finally {
      setManualPaperSaving(false);
    }
  }, [
    eventId,
    matchId,
    match,
    paperForm,
    onClose,
    refreshManualPendingMap,
    setOperationMessage,
    setOperationError,
  ]);

  const manualPaperOpLeftBadgeClass = manualPaperOpSidesInverted
    ? 'hqProgressManualPaperSideBadge hqProgressManualPaperSideBadge--blue'
    : 'hqProgressManualPaperSideBadge hqProgressManualPaperSideBadge--red';
  const manualPaperOpRightBadgeClass = manualPaperOpSidesInverted
    ? 'hqProgressManualPaperSideBadge hqProgressManualPaperSideBadge--red'
    : 'hqProgressManualPaperSideBadge hqProgressManualPaperSideBadge--blue';

  return (
    <div
      className="hqProgressManualPaperModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hq-manual-paper-title"
      onClick={() => {
        if (!manualPaperSaving) {
          onClose();
        }
      }}
    >
      <div
        className="hqProgressManualPaperModal"
        onClick={(e) => e.stopPropagation()}
      >
        <>
          <h2 id="hq-manual-paper-title" className="hqProgressManualPaperModalTitle">
            {toManualPaperModalTitle(match)}
          </h2>
          <p className="hqProgressManualPaperModalNote">
            スコアボードの結果を受信できない時に入力します。
          </p>
          <div className="hqProgressManualPaperFormGrid hqProgressManualPaperFormGrid--refereeBelowTable">
            <div className="hqProgressManualPaperEndsEditor">
              <table className="hqProgressManualPaperReviewTable hqProgressManualPaperOpScoreTable">
                <colgroup>
                  <col />
                  <col className="hqProgressManualPaperReviewColMid" />
                  <col />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="hqProgressManualPaperReviewTablePlayer hqProgressManualPaperOpHeadCell">
                      <div className="hqProgressManualPaperOpHeadInner hqProgressManualPaperOpHeadInner--left">
                        <span className={manualPaperOpLeftBadgeClass}>
                          {manualPaperOpSidesInverted ? '青' : '赤'}
                        </span>
                        <span className="hqProgressManualPaperReviewTablePlayerName hqProgressManualPaperOpHeadPlayerName">
                          <HqModalPlayerIdName
                            playerId={match?.redPlayerId}
                            playerNameMap={playerNameMap}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="hqProgressManualPaperReviewTableGap hqProgressManualPaperOpInvertCell">
                      <div className="hqProgressManualPaperOpInvertInner">
                        <button
                          type="button"
                          className="hqProgressActionButton hqProgressManualPaperOpInvertButton"
                          onClick={invertManualPaperRedBlue}
                          disabled={manualPaperSaving}
                          aria-label="赤と青の得点を左右で入れ替え"
                        >
                          <span className="hqProgressManualPaperOpInvertGlyph">⇔</span>
                        </button>
                      </div>
                    </td>
                    <td className="hqProgressManualPaperReviewTablePlayer hqProgressManualPaperOpHeadCell">
                      <div className="hqProgressManualPaperOpHeadInner hqProgressManualPaperOpHeadInner--right">
                        <span className="hqProgressManualPaperReviewTablePlayerName hqProgressManualPaperOpHeadPlayerName">
                          <HqModalPlayerIdName
                            playerId={match?.bluePlayerId}
                            playerNameMap={playerNameMap}
                          />
                        </span>
                        <span className={manualPaperOpRightBadgeClass}>
                          {manualPaperOpSidesInverted ? '赤' : '青'}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {(Array.isArray(paperForm.matchEnds) ? paperForm.matchEnds : []).map((row, idx) => (
                    <tr key={`end-row-${idx}`}>
                      <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperOpScoreNumCell">
                        <input
                          className="hqProgressManualPaperScoreEndsInput hqProgressManualPaperOpScoreInput"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.redScore ?? ''}
                          onChange={(e) =>
                            setPaperForm((f) => {
                              const next = [...(Array.isArray(f.matchEnds) ? f.matchEnds : [])];
                              next[idx] = { ...next[idx], redScore: e.target.value };
                              return { ...f, matchEnds: next };
                            })
                          }
                          disabled={manualPaperSaving}
                          aria-label={`エンド${idx + 1} 赤得点`}
                        />
                      </td>
                      <td className="hqProgressManualPaperReviewTableLabel hqProgressManualPaperOpScoreCenterCell">
                        {`エンド ${idx + 1}`}
                      </td>
                      <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperOpScoreNumCell">
                        <input
                          className="hqProgressManualPaperScoreEndsInput hqProgressManualPaperOpScoreInput"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.blueScore ?? ''}
                          onChange={(e) =>
                            setPaperForm((f) => {
                              const next = [...(Array.isArray(f.matchEnds) ? f.matchEnds : [])];
                              next[idx] = { ...next[idx], blueScore: e.target.value };
                              return { ...f, matchEnds: next };
                            })
                          }
                          disabled={manualPaperSaving}
                          aria-label={`エンド${idx + 1} 青得点`}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="hqProgressManualPaperReviewTableGrandTotal">
                    <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperOpGrandTotalNumCell">
                      {showMatchTieBreakWinnerPicker ? (
                        showTbCircledRedGrandTotal ? (
                          <span
                            className="hqProgressManualPaperOpGrandTotalCircled"
                            aria-label="タイブレーク勝者の合計"
                          >
                            <span className="hqProgressManualPaperOpGrandTotalCircledValue">
                              {matchPaperTotals.red}
                            </span>
                          </span>
                        ) : (
                          <span className="hqProgressManualPaperOpGrandTotalPlain">
                            {matchPaperTotals.red}
                          </span>
                        )
                      ) : (
                        matchPaperTotals.red
                      )}
                    </td>
                    <td className="hqProgressManualPaperReviewTableLabel hqProgressManualPaperOpScoreCenterCell">
                      合計
                    </td>
                    <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperOpGrandTotalNumCell">
                      {showMatchTieBreakWinnerPicker ? (
                        showTbCircledBlueGrandTotal ? (
                          <span
                            className="hqProgressManualPaperOpGrandTotalCircled"
                            aria-label="タイブレーク勝者の合計"
                          >
                            <span className="hqProgressManualPaperOpGrandTotalCircledValue">
                              {matchPaperTotals.blue}
                            </span>
                          </span>
                        ) : (
                          <span className="hqProgressManualPaperOpGrandTotalPlain">
                            {matchPaperTotals.blue}
                          </span>
                        )
                      ) : (
                        matchPaperTotals.blue
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
              <label
                className={`hqProgressManualPaperField hqProgressManualPaperFieldWide hqProgressManualPaperMatchTieBreakField${
                  showMatchTieBreakWinnerPicker ? '' : ' hqProgressManualPaperMatchTieBreakField--inactive'
                }`}
              >
                <span>タイブレーク勝者</span>
                <select
                  className="hqProgressManualPaperMatchTieBreakSelect"
                  value={
                    paperForm.matchTieBreakWinner === 'red' || paperForm.matchTieBreakWinner === 'blue'
                      ? paperForm.matchTieBreakWinner
                      : ''
                  }
                  onChange={(e) => setPaperForm((f) => ({ ...f, matchTieBreakWinner: e.target.value }))}
                  disabled={manualPaperSaving || !showMatchTieBreakWinnerPicker}
                  tabIndex={showMatchTieBreakWinnerPicker ? 0 : -1}
                >
                  <option value="">選択してください</option>
                  <option value="red">{matchTieBreakOptionLabelRed}</option>
                  <option value="blue">{matchTieBreakOptionLabelBlue}</option>
                </select>
              </label>
            </div>
            <div className="hqProgressManualPaperRefereeSlot">
              <label className="hqProgressManualPaperField hqProgressManualPaperRefereeField">
                <span>審判名</span>
                <input
                  type="text"
                  value={paperForm.refereeName ?? MANUAL_PAPER_DEFAULT_REFEREE_NAME}
                  onChange={(e) => setPaperForm((f) => ({ ...f, refereeName: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className="hqProgressManualPaperModalActions">
            <button
              type="button"
              className="hqProgressActionButton"
              onClick={onClose}
              disabled={manualPaperSaving}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="hqProgressActionButton hqProgressManualPaperSubmitButton"
              onClick={() => submitManualPaperResult()}
              disabled={manualPaperSaving}
            >
              {manualPaperSaving ? '送信中…' : '本部へ送信'}
            </button>
          </div>
        </>
      </div>
    </div>
  );
});

/** スコアボード game.json の match.ends を紙申請レビュー表用に正規化 */
function normalizeScoreboardGameMatchEnds(game) {
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
function buildCourtApproveSyntheticManualRequest(match, colorState, progress) {
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

/** オペレーター申請内容の確認（本部承認モーダル）。選手 ID 昇順で左→右、赤青バッジはコート側のまま */
function ManualPaperRequestReviewDl({ request: req, playerNameMap }) {
  if (!req) {
    return null;
  }
  const map = playerNameMap instanceof Map ? playerNameMap : new Map();

  const rId = String(req.redPlayerId ?? '').trim();
  const bId = String(req.bluePlayerId ?? '').trim();
  const redSide = { id: rId, color: 'red', sideLabel: '赤' };
  const blueSide = { id: bId, color: 'blue', sideLabel: '青' };

  let left;
  let right;
  if (!rId || !bId) {
    left = redSide;
    right = blueSide;
  } else if (comparePlayerIdsForPaperOrder(rId, bId) <= 0) {
    left = redSide;
    right = blueSide;
  } else {
    left = blueSide;
    right = redSide;
  }

  const winnerId = String(req.winnerPlayerId ?? '').trim();

  const endsSorted = Array.isArray(req.matchEnds)
    ? [...req.matchEnds].sort((a, b) => Number(a.end) - Number(b.end))
    : [];

  const ptsForSide = (entry, side) =>
    side.color === 'red' ? Number(entry?.redScore ?? NaN) : Number(entry?.blueScore ?? NaN);

  let leftGrand = 0;
  let rightGrand = 0;
  for (const e of endsSorted) {
    const lv = ptsForSide(e, left);
    const rv = ptsForSide(e, right);
    if (Number.isFinite(lv)) {
      leftGrand += lv;
    }
    if (Number.isFinite(rv)) {
      rightGrand += rv;
    }
  }

  const legacyTotalsOnly =
    endsSorted.length === 0 &&
    req.redScore != null &&
    req.blueScore != null &&
    Number.isFinite(Number(req.redScore)) &&
    Number.isFinite(Number(req.blueScore));

  const legacyLeft = legacyTotalsOnly
    ? left.color === 'red'
      ? Number(req.redScore)
      : Number(req.blueScore)
    : null;
  const legacyRight = legacyTotalsOnly
    ? right.color === 'red'
      ? Number(req.redScore)
      : Number(req.blueScore)
    : null;

  const inferredTieBreakRowIndex = (() => {
    if (!endsSorted.length) {
      return -1;
    }
    const explicit = endsSorted.findIndex((x) => x?.isTieBreak === true);
    if (explicit >= 0) {
      return explicit;
    }
    for (let k = endsSorted.length - 1; k >= 0; k--) {
      const row = endsSorted[k];
      const rs = Number(row?.redScore);
      const bs = Number(row?.blueScore);
      if (Number.isFinite(rs) && Number.isFinite(bs) && rs === bs) {
        return k;
      }
    }
    return -1;
  })();

  const totalsTiedForTbDisplay =
    leftGrand === rightGrand && leftGrand > 0 && Boolean(winnerId);

  const tieBreakWinnerColor =
    winnerId && rId && winnerId === rId
      ? 'red'
      : winnerId && bId && winnerId === bId
        ? 'blue'
        : null;

  const manualPaperTdGrandTotalsTied = leftGrand === rightGrand && leftGrand > 0;
  const manualPaperTdShowGrandCircle =
    manualPaperTdGrandTotalsTied && tieBreakWinnerColor != null;

  const legacyGrandTotalsTied =
    legacyTotalsOnly &&
    legacyLeft != null &&
    legacyRight != null &&
    legacyLeft === legacyRight &&
    legacyLeft > 0;
  const legacyTdShowGrandCircle = legacyGrandTotalsTied && tieBreakWinnerColor != null;

  return (
    <>
      <table className="hqProgressManualPaperReviewTable hqProgressManualPaperReviewTable--tdPaperReview">
        <colgroup>
          <col />
          <col className="hqProgressManualPaperReviewColMid" />
          <col />
        </colgroup>
        <tbody>
          <tr className="hqProgressManualPaperReviewTableHeadRow">
            <td className="hqProgressManualPaperReviewTablePlayer hqProgressManualPaperReviewTablePlayer--tdHead">
              <div className="hqProgressManualPaperReviewHeadInner hqProgressManualPaperReviewHeadInner--left">
                <span
                  className={`hqProgressManualPaperSideBadge hqProgressManualPaperSideBadge--${left.color}`}
                >
                  {left.sideLabel}
                </span>
                <span className="hqProgressManualPaperReviewHeadName">
                  <HqModalPlayerIdName playerId={left.id} playerNameMap={map} />
                </span>
              </div>
            </td>
            <td
              className="hqProgressManualPaperReviewTableGap hqProgressManualPaperReviewTableGap--tdHead"
              aria-hidden="true"
            />
            <td className="hqProgressManualPaperReviewTablePlayer hqProgressManualPaperReviewTablePlayer--tdHead">
              <div className="hqProgressManualPaperReviewHeadInner hqProgressManualPaperReviewHeadInner--right">
                <span className="hqProgressManualPaperReviewHeadName">
                  <HqModalPlayerIdName playerId={right.id} playerNameMap={map} />
                </span>
                <span
                  className={`hqProgressManualPaperSideBadge hqProgressManualPaperSideBadge--${right.color}`}
                >
                  {right.sideLabel}
                </span>
              </div>
            </td>
          </tr>
          {legacyTotalsOnly ? (
            <tr className="hqProgressManualPaperReviewTableGrandTotal">
              <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperTdGrandTotalNumCell">
                {legacyTdShowGrandCircle ? (
                  tieBreakWinnerColor === left.color ? (
                    <span
                      className="hqProgressManualPaperOpGrandTotalCircled hqProgressManualPaperOpGrandTotalCircled--tdReview"
                      aria-label="タイブレーク勝者の合計"
                    >
                      <span className="hqProgressManualPaperOpGrandTotalCircledValue">{legacyLeft}</span>
                    </span>
                  ) : (
                    <span className="hqProgressManualPaperOpGrandTotalPlain hqProgressManualPaperOpGrandTotalPlain--tdReview">
                      {legacyLeft}
                    </span>
                  )
                ) : (
                  legacyLeft
                )}
              </td>
              <th scope="row" className="hqProgressManualPaperReviewTableLabel">
                合計
              </th>
              <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperTdGrandTotalNumCell">
                {legacyTdShowGrandCircle ? (
                  tieBreakWinnerColor === right.color ? (
                    <span
                      className="hqProgressManualPaperOpGrandTotalCircled hqProgressManualPaperOpGrandTotalCircled--tdReview"
                      aria-label="タイブレーク勝者の合計"
                    >
                      <span className="hqProgressManualPaperOpGrandTotalCircledValue">{legacyRight}</span>
                    </span>
                  ) : (
                    <span className="hqProgressManualPaperOpGrandTotalPlain hqProgressManualPaperOpGrandTotalPlain--tdReview">
                      {legacyRight}
                    </span>
                  )
                ) : (
                  legacyRight
                )}
              </td>
            </tr>
          ) : (
            <>
              {endsSorted.map((e, idx) => {
                const treatTb =
                  Boolean(e.isTieBreak) ||
                  (totalsTiedForTbDisplay && idx === inferredTieBreakRowIndex);
                const endLabel = treatTb ? 'タイブレーク' : `エンド ${e.end}`;
                const leftNum = Number.isFinite(ptsForSide(e, left)) ? ptsForSide(e, left) : null;
                const rightNum = Number.isFinite(ptsForSide(e, right)) ? ptsForSide(e, right) : null;
                return (
                  <tr key={`end-${e.end}`}>
                    <td className="hqProgressManualPaperReviewTableNum">
                      <span className="hqProgressManualPaperReviewScoreWrap">
                        {leftNum != null ? leftNum : '—'}
                      </span>
                    </td>
                    <th scope="row" className="hqProgressManualPaperReviewTableLabel">
                      {endLabel}
                    </th>
                    <td className="hqProgressManualPaperReviewTableNum">
                      <span className="hqProgressManualPaperReviewScoreWrap">
                        {rightNum != null ? rightNum : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {endsSorted.length > 0 ? (
                <tr className="hqProgressManualPaperReviewTableGrandTotal">
                  <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperTdGrandTotalNumCell">
                    {manualPaperTdShowGrandCircle ? (
                      tieBreakWinnerColor === left.color ? (
                        <span
                          className="hqProgressManualPaperOpGrandTotalCircled hqProgressManualPaperOpGrandTotalCircled--tdReview"
                          aria-label="タイブレーク勝者の合計"
                        >
                          <span className="hqProgressManualPaperOpGrandTotalCircledValue">{leftGrand}</span>
                        </span>
                      ) : (
                        <span className="hqProgressManualPaperOpGrandTotalPlain hqProgressManualPaperOpGrandTotalPlain--tdReview">
                          {leftGrand}
                        </span>
                      )
                    ) : (
                      leftGrand
                    )}
                  </td>
                  <th scope="row" className="hqProgressManualPaperReviewTableLabel">
                    合計
                  </th>
                  <td className="hqProgressManualPaperReviewTableNum hqProgressManualPaperTdGrandTotalNumCell">
                    {manualPaperTdShowGrandCircle ? (
                      tieBreakWinnerColor === right.color ? (
                        <span
                          className="hqProgressManualPaperOpGrandTotalCircled hqProgressManualPaperOpGrandTotalCircled--tdReview"
                          aria-label="タイブレーク勝者の合計"
                        >
                          <span className="hqProgressManualPaperOpGrandTotalCircledValue">{rightGrand}</span>
                        </span>
                      ) : (
                        <span className="hqProgressManualPaperOpGrandTotalPlain hqProgressManualPaperOpGrandTotalPlain--tdReview">
                          {rightGrand}
                        </span>
                      )
                    ) : (
                      rightGrand
                    )}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={3} className="hqProgressManualPaperReviewTableEmpty">
                    エンド別データがありません
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      <div className="hqProgressManualPaperReviewMetaHost">
        <dl className="hqProgressManualPaperReviewMetaList hqProgressManualPaperReviewMeta">
          <div className="hqProgressManualPaperReviewGrid hqProgressManualPaperReviewMetaGroup">
            <dt>勝者</dt>
            <dd>
              {winnerId ? <HqModalPlayerIdName playerId={winnerId} playerNameMap={map} /> : '—'}
            </dd>
          </div>
          <div className="hqProgressManualPaperReviewGrid hqProgressManualPaperReviewMetaGroup hqProgressManualPaperReviewMetaGroup--sepBefore">
            <dt>審判名</dt>
            <dd>{req.refereeName}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

/**
 * 本部：試合進行（announce / unannounce / start / hq-approve）
 * URL: /event/:eventId/hq/progress（のちほど認証をかける想定）
 */
const HqProgress = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState({
    courts: [],
    matches: [],
    eventDate: '',
    eventDayLabel: '',
    startTime: '',
  });
  const [players, setPlayers] = useState([]);
  const [progressMap, setProgressMap] = useState(new Map());
  const [courtColorStateMap, setCourtColorStateMap] = useState(new Map());
  const [operationError, setOperationError] = useState('');
  const [operationMessage, setOperationMessage] = useState('');
  const [hqApproverName, setHqApproverName] = useState('');
  const [showApproverModal, setShowApproverModal] = useState(false);
  const [approverNameDraft, setApproverNameDraft] = useState(DEFAULT_HQ_TD_APPROVER_NAME);
  const [actionBusyKey, setActionBusyKey] = useState('');
  const [importing, setImporting] = useState(false);
  /** init.display.scoreboardCmImage を解決した CM 画像 URL（CM ボタン PUT 用） */
  const [scoreboardCmImageUrl, setScoreboardCmImageUrl] = useState('');
  /** 各コートの cm-overlay.json の active（ボタン文言・トグル用） */
  const [cmOverlayActiveByCourt, setCmOverlayActiveByCourt] = useState({});
  /** CM ボタン表示の「本部承認から3分」判定用 */
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** オペレーター手動送信の承認待ち（matchId → request） */
  const [pendingManualByMatchId, setPendingManualByMatchId] = useState(() => new Map());
  /** 試合ごとの最新手動申請が rejected のとき（pending が無い場合のみ UI で「申請却下」） */
  const [manualLatestRejectedMatchIds, setManualLatestRejectedMatchIds] = useState(() => new Set());
  /** 手動結果入力モーダル（mode: submit のみ） */
  const [manualPaperModal, setManualPaperModal] = useState(null);
  /** 本部承認（手動申請・スコアボード共通）の確認モーダル */
  const [hqApproveConfirmModal, setHqApproveConfirmModal] = useState(null);
  const [hqApproveConfirmBusy, setHqApproveConfirmBusy] = useState(false);
  /** 本部ヘッダー中央タブ: 選手一覧 / 試合進行 / プール表 */
  const [hqMainView, setHqMainView] = useState('schedule');
  const mode = useMemo(() => {
    const rawMode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    return rawMode === 'td' ? 'td' : 'operator';
  }, [searchParams]);
  const isTdMode = mode === 'td';
  const isOperatorMode = mode === 'operator';

  useEffect(() => {
    if (!eventId) {
      return;
    }
    if (!searchParams.has('mode')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('mode', 'operator');
      navigate(`/event/${eventId}/hq/progress?${nextParams.toString()}`, { replace: true });
    }
  }, [eventId, navigate, searchParams]);

  useEffect(() => {
    if (!isTdMode) {
      setShowApproverModal(false);
      return;
    }
    if (!hqApproverName.trim()) {
      setShowApproverModal(true);
    }
  }, [isTdMode, hqApproverName]);

  /** モーダル表示時は常に入力の value に TD を入れた状態から始める */
  useEffect(() => {
    if (!isTdMode || !showApproverModal) {
      return;
    }
    setApproverNameDraft(DEFAULT_HQ_TD_APPROVER_NAME);
  }, [isTdMode, showApproverModal]);

  const fetchProgress = useCallback(async () => {
    if (!eventId) {
      return;
    }
    const response = await fetch(`/api/progress/${eventId}/matches`);
    if (!response.ok) {
      throw new Error('進行情報の取得に失敗しました。');
    }
    const data = await response.json();
    const nextMap = new Map();
    const matches = Array.isArray(data.matches) ? data.matches : [];
    for (const match of matches) {
      nextMap.set(String(match.matchId), match);
    }
    setProgressMap(nextMap);
  }, [eventId]);

  const refreshManualPendingMap = useCallback(async () => {
    if (!eventId) {
      return;
    }
    const poll = await fetch(`/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/pending`);
    if (!poll.ok) {
      return;
    }
    const pData = await poll.json();
    const next = new Map();
    for (const req of pData.requests || []) {
      if (req.matchId) {
        next.set(String(req.matchId), req);
      }
    }
    setPendingManualByMatchId(next);
  }, [eventId]);

  const refreshManualLatestRejectedMatchIds = useCallback(async () => {
    if (!eventId) {
      return;
    }
    const res = await fetch(
      `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/latest-rejected-match-ids`,
    );
    if (!res.ok) {
      return;
    }
    const data = await res.json().catch(() => ({}));
    const ids = Array.isArray(data.matchIds) ? data.matchIds : [];
    setManualLatestRejectedMatchIds(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)));
  }, [eventId]);

  const refreshCmOverlayStatesForCourts = useCallback(
    async (courtsList) => {
      if (!eventId || !Array.isArray(courtsList)) {
        return;
      }
      const next = {};
      await Promise.all(
        courtsList.map(async (cidRaw) => {
          const c = String(cidRaw ?? '').trim();
          if (!c) {
            return;
          }
          try {
            const res = await fetch(
              `/api/data/${encodeURIComponent(eventId)}/court/${encodeURIComponent(c)}/cm-overlay`,
            );
            if (res.ok) {
              const j = await res.json();
              next[c] = Boolean(j.active);
            } else {
              next[c] = false;
            }
          } catch {
            next[c] = false;
          }
        }),
      );
      setCmOverlayActiveByCourt((prev) => ({ ...prev, ...next }));
    },
    [eventId],
  );

  useEffect(() => {
    const loadData = async () => {
      if (!eventId) {
        setError('eventId が指定されていません。');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const rootScheduleRes = await fetch(`/data/${eventId}/schedule.json`);
        const rootScheduleJson = rootScheduleRes.ok ? await rootScheduleRes.json() : null;
        const isScheduleV2 = (json) =>
          Boolean(json && !Array.isArray(json) && Array.isArray(json.matches) && Array.isArray(json.courts));
        const scheduleJson = isScheduleV2(rootScheduleJson) ? rootScheduleJson : null;
        if (!scheduleJson) throw new Error('schedule.json の読み込みに失敗しました。');

        const playerClassCode = String(scheduleJson.classCode ?? 'FRD');
        const playersRes = await fetch(`/data/${eventId}/classes/${playerClassCode}/player.json`);
        const playersJson = playersRes.ok ? await playersRes.json() : [];

        const courtsArr = Array.isArray(scheduleJson.courts)
          ? scheduleJson.courts.map((court) => String(court))
          : [];
        setSchedule({
          courts: courtsArr,
          matches: Array.isArray(scheduleJson.matches) ? scheduleJson.matches : [],
          pools: Array.isArray(scheduleJson.pools) ? scheduleJson.pools : [],
          eventDate: String(scheduleJson.eventDate ?? ''),
          eventDayLabel: String(scheduleJson.eventDayLabel ?? ''),
          startTime: String(scheduleJson.startTime ?? ''),
        });
        setPlayers(normalizePlayers(playersJson));
        let cmUrl = resolveScoreboardCmImageUrl(null, eventId);
        try {
          const initRes = await fetch(`/data/${encodeURIComponent(eventId)}/init.json`);
          if (initRes.ok) {
            const initJson = await initRes.json();
            cmUrl = resolveScoreboardCmImageUrl(initJson, eventId);
          }
        } catch {
          // init なしのときはデフォルト
        }
        setScoreboardCmImageUrl(cmUrl);
        await refreshCmOverlayStatesForCourts(courtsArr);
        await fetchProgress();
        await refreshManualPendingMap();
        await refreshManualLatestRejectedMatchIds();
        setError('');
      } catch (err) {
        setError(err.message || 'スケジュールデータの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [
    eventId,
    fetchProgress,
    refreshCmOverlayStatesForCourts,
    refreshManualPendingMap,
    refreshManualLatestRejectedMatchIds,
  ]);

  useEffect(() => {
    if (!eventId) {
      return undefined;
    }
    const timer = setInterval(() => {
      fetchProgress().catch(() => {
        // 一時的な通信失敗は次周期で再試行する
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [eventId, fetchProgress]);

  useEffect(() => {
    if (!eventId) {
      return undefined;
    }
    const poll = () => {
      fetch(`/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/pending`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.requests || !Array.isArray(data.requests)) {
            return;
          }
          const next = new Map();
          for (const req of data.requests) {
            const mid = String(req?.matchId ?? '').trim();
            if (mid) {
              next.set(mid, req);
            }
          }
          setPendingManualByMatchId(next);
        })
        .catch(() => {
          /* 進行の補助情報のため握りつぶす */
        });
      fetch(
        `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/latest-rejected-match-ids`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const ids = Array.isArray(data?.matchIds) ? data.matchIds : [];
          setManualLatestRejectedMatchIds(
            new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)),
          );
        })
        .catch(() => {
          /* 同上 */
        });
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
  }, [eventId]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!eventId) {
      setCourtColorStateMap(new Map());
      return undefined;
    }

    let cancelled = false;
    const loadCourtColorStates = async () => {
      try {
        const [gamesResponse, standingsResponse] = await Promise.all([
          fetch(`/api/data/${eventId}/results/all-games`),
          fetch(`/api/progress/${eventId}/pool/standings`),
        ]);
        if (!gamesResponse.ok) {
          return;
        }
        const payload = await gamesResponse.json();
        const games = Array.isArray(payload?.games) ? payload.games : [];
        const responses = games.map((entry) => {
          const game = entry?.game ?? {};
            const matchID = String(game?.matchID ?? '').trim();
            if (!matchID) {
              return null;
            }
            const section = String(game?.match?.section ?? '').trim();
            const isInMatchSection =
              /^end\d+$/i.test(section) ||
              ['interval', 'tieBreak', 'finalShot', 'matchFinished', 'resultApproval'].includes(section);
            const isFinishedSection = ['matchFinished', 'resultApproval'].includes(section);
            const redScore = Number(game?.red?.score ?? 0);
            const blueScore = Number(game?.blue?.score ?? 0);
            let winnerSide = '';
            if (isFinishedSection) {
              if (redScore > blueScore) {
                winnerSide = 'red';
              } else if (blueScore > redScore) {
                winnerSide = 'blue';
              } else if (game?.red?.isTieBreak === true) {
                winnerSide = 'red';
              } else if (game?.blue?.isTieBreak === true) {
                winnerSide = 'blue';
              }
            }
            return {
              matchID,
              isColorSet: game?.screen?.isColorSet === true,
              redPlayerId: String(game?.red?.playerID ?? '').trim(),
              bluePlayerId: String(game?.blue?.playerID ?? '').trim(),
              redScore,
              blueScore,
              isScoreVisible: game?.screen?.isMatchStarted === true || isInMatchSection,
              winnerSide,
              scoreboardMatchEnds: normalizeScoreboardGameMatchEnds(game),
            };
          });
        if (cancelled) {
          return;
        }
        const nextMap = new Map();
        for (const entry of responses) {
          if (!entry) continue;
          nextMap.set(entry.matchID, entry);
        }
        if (standingsResponse.ok) {
          const standingsPayload = await standingsResponse.json();
          const rows = Array.isArray(standingsPayload?.matches) ? standingsPayload.matches : [];
          for (const row of rows) {
            const matchID = String(row?.match_id ?? '').trim();
            if (!matchID) continue;
            const redScore = Number(row?.red_score);
            const blueScore = Number(row?.blue_score);
            if (!Number.isFinite(redScore) || !Number.isFinite(blueScore)) continue;
            const prev = nextMap.get(matchID) || {};
            const rowRedPlayerId = String(row?.red_player_id ?? '').trim();
            const rowBluePlayerId = String(row?.blue_player_id ?? '').trim();
            const winnerPlayerId = String(row?.winner_player_id ?? '').trim();
            const courtRedId = String(prev.redPlayerId ?? '').trim();
            const courtBlueId = String(prev.bluePlayerId ?? '').trim();
            const hasCourtIdsFromGame = Boolean(courtRedId && courtBlueId);
            const idRedForWinner = hasCourtIdsFromGame ? courtRedId : rowRedPlayerId;
            const idBlueForWinner = hasCourtIdsFromGame ? courtBlueId : rowBluePlayerId;
            let winnerSide = '';
            if (winnerPlayerId && winnerPlayerId === idRedForWinner) {
              winnerSide = 'red';
            } else if (winnerPlayerId && winnerPlayerId === idBlueForWinner) {
              winnerSide = 'blue';
            } else if (redScore > blueScore) {
              winnerSide = 'red';
            } else if (blueScore > redScore) {
              winnerSide = 'blue';
            }
            nextMap.set(matchID, {
              ...prev,
              matchID,
              redScore,
              blueScore,
              winnerSide,
              isScoreVisible: true,
              ...(hasCourtIdsFromGame ? {} : { redPlayerId: rowRedPlayerId, bluePlayerId: rowBluePlayerId }),
            });
          }
        }
        setCourtColorStateMap(nextMap);
      } catch {
        if (!cancelled) {
          setCourtColorStateMap(new Map());
        }
      }
    };

    loadCourtColorStates();
    const timer = setInterval(loadCourtColorStates, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventId]);

  const playerNameMap = useMemo(() => {
    return new Map(players.map((player) => [player.id, player.name]));
  }, [players]);

  const timeSlots = useMemo(() => {
    const keys = new Set();
    for (const match of schedule.matches) {
      const key = toTimeSlotKey(match.scheduledStart);
      if (key) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [schedule.matches]);

  const matrix = useMemo(() => {
    const slotMap = new Map();
    for (const slot of timeSlots) {
      slotMap.set(slot, new Map());
    }
    for (const match of schedule.matches) {
      const slot = toTimeSlotKey(match.scheduledStart);
      const court = String(match.courtId ?? '');
      if (!slotMap.has(slot) || !court) {
        continue;
      }
      slotMap.get(slot).set(court, match);
    }
    return slotMap;
  }, [schedule.matches, timeSlots]);

  /** 同一スロット内の全試合が本部承認済み（reflected 含む） */
  const slotHqCompleteMap = useMemo(() => {
    const done = new Set(['hq_approved', 'reflected']);
    const map = new Map();
    for (const slot of timeSlots) {
      let hasAny = false;
      let allHqDone = true;
      for (const court of schedule.courts) {
        const match = matrix.get(slot)?.get(court);
        if (!match) {
          continue;
        }
        hasAny = true;
        const st = String(progressMap.get(String(match.matchId))?.status ?? 'scheduled');
        if (!done.has(st)) {
          allHqDone = false;
          break;
        }
      }
      map.set(slot, hasAny && allHqDone);
    }
    return map;
  }, [timeSlots, schedule.courts, matrix, progressMap]);

  const poolLetterByCourt = useMemo(
    () => buildPoolLetterByCourtMap(schedule.matches, schedule.courts),
    [schedule.matches, schedule.courts],
  );

  const poolHueByPoolId = useMemo(() => {
    const ids = collectPoolIds(players, schedule.pools, schedule.matches);
    return buildPoolHueMap(ids);
  }, [players, schedule.pools, schedule.matches]);

  const logoSrc =
    eventId != null && eventId !== ''
      ? `/data/${encodeURIComponent(eventId)}/assets/logo.png`
      : null;

  const callProgressAction = async (match, action, body = null) => {
    if (!eventId || !match?.matchId) {
      return;
    }
    const busyKey = `${match.matchId}:${action}`;
    try {
      setActionBusyKey(busyKey);
      setOperationError('');
      setOperationMessage('');
      const response = await fetch(`/api/progress/${eventId}/matches/${match.matchId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `${action} の実行に失敗しました。`);
      }
      if (action === 'announce') {
        const cid = String(match.courtId ?? '').trim();
        if (cid) {
          setCmOverlayActiveByCourt((prev) => ({ ...prev, [cid]: false }));
        }
      }
      await fetchProgress();
      let message = `${toShortMatchId(match.matchId)} を更新しました。`;
      if (action === 'announce' && data.scoreboardSync && data.scoreboardSync.ok === false) {
        message += ` スコアボード用ファイルの書き込みに失敗: ${data.scoreboardSync.error || '不明'}`;
      }
      if (action === 'unannounce' && data.scoreboardSync && data.scoreboardSync.ok === false) {
        message += ` スコアボード用ファイルの書き込みに失敗: ${data.scoreboardSync.error || '不明'}`;
      }
      setOperationMessage(message);
    } catch (err) {
      setOperationError(err.message || '更新に失敗しました。');
    } finally {
      setActionBusyKey('');
    }
  };

  const closeManualPaperModal = useCallback(() => {
    setManualPaperModal(null);
  }, []);

  const openHqApproveConfirm = useCallback(
    (match) => {
      const approverName = hqApproverName.trim();
      if (!approverName) {
        setOperationError('本部承認者名を入力してください。');
        setApproverNameDraft((prev) => String(prev).trim() || DEFAULT_HQ_TD_APPROVER_NAME);
        setShowApproverModal(true);
        return;
      }
      const mid = String(match?.matchId ?? '').trim();
      if (!mid) {
        return;
      }
      const pending = pendingManualByMatchId.get(mid);
      const st = progressMap.get(mid)?.status;
      if (pending) {
        setHqApproveConfirmModal({ match, flow: 'paper', request: pending });
        return;
      }
      if (st === 'court_approved') {
        setHqApproveConfirmModal({ match, flow: 'scoreboard' });
      }
    },
    [hqApproverName, pendingManualByMatchId, progressMap],
  );

  const executeHqApproveConfirm = useCallback(async () => {
    const ctx = hqApproveConfirmModal;
    if (!ctx?.match || !eventId) {
      return;
    }
    const approverName = hqApproverName.trim();
    if (!approverName) {
      setOperationError('本部承認者名を入力してください。');
      return;
    }
    const mid = String(ctx.match.matchId ?? '').trim();
    setHqApproveConfirmBusy(true);
    setOperationError('');
    try {
      if (ctx.flow === 'paper' && ctx.request?.id) {
        const res = await fetch(
          `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/${encodeURIComponent(ctx.request.id)}/approve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewerName: approverName }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || '申請内容の反映に失敗しました。');
        }
        await fetchProgress();
        await refreshManualPendingMap();
        await refreshManualLatestRejectedMatchIds();
      }
      const hqRes = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(mid)}/hq-approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approverName }),
        },
      );
      const hqData = await hqRes.json().catch(() => ({}));
      if (!hqRes.ok) {
        throw new Error(hqData.error || '本部承認に失敗しました。');
      }
      await fetchProgress();
      setHqApproveConfirmModal(null);
      setOperationMessage(
        ctx.flow === 'paper'
          ? `${toShortMatchId(mid)} の申請内容を反映し、本部承認しました。`
          : `${toShortMatchId(mid)} を本部承認しました。`,
      );
    } catch (e) {
      setOperationError(e.message || '本部承認に失敗しました。');
    } finally {
      setHqApproveConfirmBusy(false);
    }
  }, [
    hqApproveConfirmModal,
    eventId,
    hqApproverName,
    fetchProgress,
    refreshManualPendingMap,
    refreshManualLatestRejectedMatchIds,
  ]);

  const executeHqApproveReject = useCallback(async () => {
    const ctx = hqApproveConfirmModal;
    if (!ctx || !eventId) {
      return;
    }
    const reviewerName = String(hqApproverName ?? '').trim();
    if (!reviewerName) {
      setOperationError('上部で本部承認者名（TD名）を確定してから却下してください。');
      return;
    }
    setHqApproveConfirmBusy(true);
    setOperationError('');
    try {
      if (ctx.flow === 'paper') {
        if (!ctx.request?.id) {
          return;
        }
        const res = await fetch(
          `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/${encodeURIComponent(ctx.request.id)}/reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reviewerName,
              rejectionReason: null,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || '却下に失敗しました。');
        }
        setHqApproveConfirmModal(null);
        setOperationMessage('オペレーター申請を却下しました。修正して再送信できます。');
        await refreshManualPendingMap();
        await refreshManualLatestRejectedMatchIds();
        return;
      }
      if (ctx.flow === 'scoreboard') {
        const mid = String(ctx.match?.matchId ?? '').trim();
        if (!mid) {
          return;
        }
        const res = await fetch(
          `/api/progress/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(mid)}/hq-reject-court-approved`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewerName }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || '却下に失敗しました。');
        }
        setHqApproveConfirmModal(null);
        setOperationMessage(
          'コート承認を差し戻しました。オペレーターが「結果入力」から修正し、再度本部へ送信してください。',
        );
        await fetchProgress();
        return;
      }
    } catch (e) {
      setOperationError(e.message || '却下に失敗しました。');
    } finally {
      setHqApproveConfirmBusy(false);
    }
  }, [
    hqApproveConfirmModal,
    eventId,
    hqApproverName,
    refreshManualPendingMap,
    refreshManualLatestRejectedMatchIds,
    fetchProgress,
  ]);

  const handleAnnounce = async (match) => {
    await callProgressAction(match, 'announce', {
      courtId: String(match.courtId ?? ''),
      redPlayerId: String(match.redPlayerId ?? ''),
      bluePlayerId: String(match.bluePlayerId ?? ''),
      scheduledAt: String(match.scheduledStart ?? ''),
    });
  };

  const handleBulkAnnounceForSlot = async (slot) => {
    const targets = getAnnounceableMatchesForSlot(slot, schedule.courts, matrix, progressMap);
    for (const m of targets) {
      await callProgressAction(m, 'announce', {
        courtId: String(m.courtId ?? ''),
        redPlayerId: String(m.redPlayerId ?? ''),
        bluePlayerId: String(m.bluePlayerId ?? ''),
        scheduledAt: String(m.scheduledStart ?? ''),
      });
    }
  };

  const handleCmToggleOnCourt = async (courtId) => {
    if (!eventId) {
      return;
    }
    const cid = String(courtId ?? '').trim();
    if (!cid) {
      return;
    }
    const isActive = cmOverlayActiveByCourt[cid] === true;
    const imageUrl =
      (scoreboardCmImageUrl && String(scoreboardCmImageUrl).trim()) ||
      resolveScoreboardCmImageUrl(null, eventId);
    const busyKey = `cm:${cid}`;
    try {
      setActionBusyKey(busyKey);
      setOperationError('');
      const body = isActive ? { active: false } : { active: true, imageUrl };
      const response = await fetch(
        `/api/data/${encodeURIComponent(eventId)}/court/${encodeURIComponent(cid)}/cm-overlay`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || (isActive ? 'CM の解除に失敗しました。' : 'CM の有効化に失敗しました。'));
      }
      setCmOverlayActiveByCourt((prev) => ({ ...prev, [cid]: !isActive }));
      setOperationMessage('');
    } catch (err) {
      setOperationError(err.message || 'CM の更新に失敗しました。');
    } finally {
      setActionBusyKey('');
    }
  };

  const handleUnannounce = async (match) => {
    const confirmed = window.confirm(
      '配信を取り消し、待機状態に戻しますか？\n' +
        'コートの選手表示名は Red / Blue に戻します。\n' +
        '※試合開始後（in_progress 以降）は取り消せません。',
    );
    if (!confirmed) {
      return;
    }
    await callProgressAction(match, 'unannounce');
  };

  const handleApproverModalSubmit = () => {
    const nextName = approverNameDraft.trim();
    if (!nextName) {
      setOperationError('本部承認者名を入力してください。');
      return;
    }
    setHqApproverName(nextName);
    setOperationError('');
    setShowApproverModal(false);
  };

  const handleBulkRegister = async () => {
    if (!eventId) {
      return;
    }
    try {
      setImporting(true);
      setOperationError('');
      setOperationMessage('');
      let registeredCount = 0;
      for (const match of schedule.matches) {
        const redPlayerId = String(match.redPlayerId ?? '').trim();
        const bluePlayerId = String(match.bluePlayerId ?? '').trim();
        if (!match.matchId || !match.courtId || !redPlayerId || !bluePlayerId) {
          continue;
        }
        const response = await fetch(`/api/progress/${eventId}/matches/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId: String(match.matchId),
            courtId: String(match.courtId),
            redPlayerId,
            bluePlayerId,
            scheduledAt: String(match.scheduledStart ?? ''),
          }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `registerに失敗: ${match.matchId}`);
        }
        registeredCount += 1;
      }
      await fetchProgress();
      setOperationMessage(`SQLiteへ ${registeredCount} 試合を登録しました。`);
    } catch (err) {
      setOperationError(err.message || '一括登録に失敗しました。');
    } finally {
      setImporting(false);
    }
  };

  const handleResetAll = async () => {
    if (!eventId) {
      return;
    }
    const confirmed = window.confirm(
      '全コートのスコアボードと本部進行を初期状態に戻します。\n' +
        '（再テスト用: 配信状態・進行状態・試合中データをクリア）\n\n' +
        '実行してよろしいですか？',
    );
    if (!confirmed) {
      return;
    }
    try {
      setActionBusyKey('reset-all');
      setOperationError('');
      setOperationMessage('');
      const response = await fetch(`/api/progress/${eventId}/reset-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '全体リセットに失敗しました。');
      }
      await fetchProgress();
      const settingsCount = Number(data?.fileResetSummary?.updatedSettings ?? 0);
      const gamesCount = Number(data?.fileResetSummary?.updatedGames ?? 0);
      setOperationMessage(
        `全体リセット完了（settings: ${settingsCount}件 / game: ${gamesCount}件）。`,
      );
    } catch (err) {
      setOperationError(err.message || '全体リセットに失敗しました。');
    } finally {
      setActionBusyKey('');
    }
  };

  if (loading) {
    return (
      <main className="hqProgressPage">
        <section className="hqProgressSection">
          <p>読み込み中...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="hqProgressPage">
        <section className="hqProgressSection">
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="hqProgressPage hqProgressPage--fixedHeader">
      <section className="hqProgressSection">
        <header className="scheduleTitleBar hqProgressTitleBar">
          <div className="hqProgressTitleBarLead">
            {logoSrc ? <img className="scheduleTitleLogo" src={logoSrc} alt="" /> : null}
          </div>
          <div className="hqProgressTitleBarTabs" role="tablist" aria-label="表示の切替">
            <button
              type="button"
              role="tab"
              aria-selected={hqMainView === 'players'}
              className={`hqProgressViewTab${hqMainView === 'players' ? ' isActive' : ''}`}
              onClick={() => setHqMainView('players')}
            >
              選手一覧
            </button>
            <span className="hqProgressTitleTabSep" aria-hidden>
              ｜
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={hqMainView === 'schedule'}
              className={`hqProgressViewTab${hqMainView === 'schedule' ? ' isActive' : ''}`}
              onClick={() => setHqMainView('schedule')}
            >
              試合進行
            </button>
            <span className="hqProgressTitleTabSep" aria-hidden>
              ｜
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={hqMainView === 'standings'}
              className={`hqProgressViewTab${hqMainView === 'standings' ? ' isActive' : ''}`}
              onClick={() => setHqMainView('standings')}
            >
              プール表
            </button>
          </div>
          <div className="scheduleTitleText hqProgressTitleBarTrail">
            <h1 className="scheduleTitle">{isTdMode ? '本部承認 [TD]' : '本部進行 [オペレーター]'}</h1>
            <p className="scheduleMeta">
              {isOperatorMode
                ? `現在時刻：${toCurrentTimeLabel()}`
                : `承認者：${hqApproverName.trim() || '〇〇'}`}
            </p>
          </div>
        </header>

        {hqMainView === 'schedule' ? (
          <div className="hqProgressActionsBar">
            {isOperatorMode && (
              <>
                <button
                  type="button"
                  className="hqProgressActionButton"
                  onClick={handleBulkRegister}
                  disabled={importing || schedule.matches.length === 0}
                >
                  {importing ? '登録中...' : 'SQLiteへ一括登録'}
                </button>
                <Link
                  className="hqProgressActionButton hqProgressDbInspectLink"
                  to={`/event/${eventId}/hq/progress-db${
                    searchParams.toString() ? `?${searchParams.toString()}` : ''
                  }`}
                >
                  進行DB
                </Link>
                <button
                  type="button"
                  className="hqProgressActionButton"
                  onClick={handleResetAll}
                  disabled={actionBusyKey !== '' || importing}
                >
                  全コート初期化（再テスト）
                </button>
              </>
            )}
          </div>
        ) : null}
        {operationMessage ? <p className="hqProgressOperationMessage">{operationMessage}</p> : null}
        {operationError ? <p className="hqProgressOperationError">{operationError}</p> : null}

        {hqMainView === 'players' ? (
          <div className="hqProgressPlayersHost">
            <Suspense fallback={<p className="hqProgressPoolStandingsFallback">選手一覧を読み込み中...</p>}>
              <PlayerList embedInHq />
            </Suspense>
          </div>
        ) : hqMainView === 'standings' ? (
          <div className="hqProgressPoolStandingsHost">
            <Suspense fallback={<p className="hqProgressPoolStandingsFallback">プール表を読み込み中...</p>}>
              <PoolStandings embedInHq showEndsWonColumn />
            </Suspense>
          </div>
        ) : schedule.matches.length === 0 ? (
          <p className="scheduleEmpty">現在、登録されている試合予定はありません。</p>
        ) : (
          <div className="scheduleTableWrap">
            <table className="scheduleTable">
              <tbody>
                {timeSlots.flatMap((slot, index) => {
                  const slotAllHqDone = slotHqCompleteMap.get(slot) === true;
                  const matchesInRow = schedule.courts
                    .map((court) => matrix.get(slot)?.get(court))
                    .filter(Boolean);
                  const progressStatusById = new Map(
                    matchesInRow.map((m) => [
                      String(m?.matchId ?? ''),
                      String(progressMap.get(String(m?.matchId ?? ''))?.status ?? 'scheduled'),
                    ]),
                  );
                  const rowPhase = getScheduleRowPhase(slot, timeSlots, matchesInRow, progressStatusById);
                  const rowPhaseClass =
                    rowPhase === 'past'
                      ? 'isRowPast'
                      : rowPhase === 'upcoming'
                        ? 'isRowUpcoming'
                        : 'isRowCurrent';
                  const prevSlot = index > 0 ? timeSlots[index - 1] : null;
                  const prevMatches = prevSlot
                    ? schedule.courts.map((court) => matrix.get(prevSlot)?.get(court)).filter(Boolean)
                    : [];
                  const prevProgressStatusById = new Map(
                    prevMatches.map((m) => [
                      String(m?.matchId ?? ''),
                      String(progressMap.get(String(m?.matchId ?? ''))?.status ?? 'scheduled'),
                    ]),
                  );
                  const prevRowPhase = prevSlot
                    ? getScheduleRowPhase(prevSlot, timeSlots, prevMatches, prevProgressStatusById)
                    : '';
                  const shouldInsertHeaderAtTop = index === 0 && rowPhase !== 'past';
                  const shouldInsertHeaderAboveCurrent =
                    rowPhase === 'current' && prevRowPhase !== 'current' && index !== 0;

                  const slotBulkTargets = getAnnounceableMatchesForSlot(
                    slot,
                    schedule.courts,
                    matrix,
                    progressMap,
                  );
                  const prevSlotAllHqDone =
                    index > 0 && slotHqCompleteMap.get(timeSlots[index - 1]) === true;
                  const highlightAnnounceButtons =
                    isOperatorMode &&
                    prevSlotAllHqDone &&
                    slotBulkTargets.length > 0;

                  const rows = [];
                  if (shouldInsertHeaderAtTop || shouldInsertHeaderAboveCurrent) {
                    rows.push(
                      <tr key={`header-${slot}`} className="scheduleInlineHeaderRow">
                        <th className="scheduleHeaderCell">時間</th>
                        {schedule.courts.map((court) => {
                          const poolId = poolLetterByCourt.get(String(court));
                          const hue = poolId ? poolHueByPoolId.get(poolId) : undefined;
                          const headerBgStyle =
                            hue != null
                              ? { background: poolStandingsHeaderHsl(hue, SCHEDULE_POOL_SURFACE_ALPHA) }
                              : undefined;
                          return (
                            <th
                              key={`header-${slot}-${court}`}
                              className="scheduleHeaderCell"
                              style={headerBgStyle}
                            >{`コート${court}`}</th>
                          );
                        })}
                      </tr>,
                    );
                  }
                  rows.push(
                  <tr
                    key={slot}
                    className={`scheduleRow ${rowPhaseClass}${slotAllHqDone ? ' isSlotHqComplete' : ''}`}
                  >
                    <th
                      className={`scheduleTimeCell${isOperatorMode ? ' hqProgressTimeCellWithBulk' : ''}`}
                    >
                      {isOperatorMode ? (
                        <>
                          <span className="hqProgressTimeLabel">
                            <span className="hqProgressTimeClock">{toDateTimeLabel(slot)}</span>
                            {slotAllHqDone ? (
                              <span className="hqProgressSlotCompleteLabel">完了</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className={`hqProgressActionButton hqProgressBulkAnnounceButton${
                              highlightAnnounceButtons ? ' isAnnounceReady' : ''
                            }`}
                            onClick={() => handleBulkAnnounceForSlot(slot)}
                            disabled={
                              slotBulkTargets.length === 0 || actionBusyKey !== '' || importing
                            }
                            title={
                              slotBulkTargets.length === 0
                                ? 'この時間帯に待機中の試合がありません'
                                : `この時間帯の待機中試合を一斉配信（${slotBulkTargets.length}件）`
                            }
                          >
                            一斉配信
                          </button>
                        </>
                      ) : slotAllHqDone ? (
                        <span className="hqProgressTimeTdStack">
                          <span className="hqProgressTimeClock">{toDateTimeLabel(slot)}</span>
                          <span className="hqProgressSlotCompleteLabel">完了</span>
                        </span>
                      ) : (
                        toDateTimeLabel(slot)
                      )}
                    </th>
                    {schedule.courts.map((court) => {
                      const match = matrix.get(slot)?.get(court);
                      if (!match) {
                        return <td key={`${slot}-${court}`} className="scheduleCell isEmptyCell">-</td>;
                      }
                      const redName =
                        playerNameMap.get(String(match.redPlayerId ?? '')) ??
                        String(match.redPlayerName ?? match.redPlayerId ?? 'TBD');
                      const blueName =
                        playerNameMap.get(String(match.bluePlayerId ?? '')) ??
                        String(match.bluePlayerName ?? match.bluePlayerId ?? 'TBD');
                      const matchIdStr = String(match.matchId ?? '').trim();
                      const colorState = courtColorStateMap.get(matchIdStr);
                      const progress = progressMap.get(matchIdStr);
                      const rawStatus = progress?.status || 'scheduled';
                      const letterForPoolHue =
                        extractPoolLetterFromMatch(match) ?? poolLetterByCourt.get(String(court));
                      const hueForPoolTint = letterForPoolHue
                        ? poolHueByPoolId.get(letterForPoolHue)
                        : undefined;
                      const isMatchInProgress = rawStatus === 'in_progress';
                      const showInProgressPoolTint =
                        isMatchInProgress &&
                        hueForPoolTint != null &&
                        Number.isFinite(hueForPoolTint);
                      const inProgressPoolBgStyle = showInProgressPoolTint
                        ? {
                            background: poolStandingsHeaderHsl(
                              hueForPoolTint,
                              SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
                            ),
                          }
                        : undefined;
                      /** 赤青下線はコートで色確定（screen.isColorSet）後のみ。一斉配信直後も未確定なら非表示 */
                      const isColorConfirmed = colorState?.isColorSet === true;
                      const scheduleLeftIsCourtRed = getScheduleLeftIsCourtRed(
                        match,
                        colorState,
                        isColorConfirmed,
                      );
                      const courtRedScore = Number(colorState?.redScore ?? 0);
                      const courtBlueScore = Number(colorState?.blueScore ?? 0);
                      const leftScore = scheduleLeftIsCourtRed ? courtRedScore : courtBlueScore;
                      const rightScore = scheduleLeftIsCourtRed ? courtBlueScore : courtRedScore;
                      const scoreLabel = colorState?.isScoreVisible
                        ? `${leftScore} - ${rightScore}`
                        : '-';
                      const isRedWinner = colorState?.winnerSide === 'red';
                      const isBlueWinner = colorState?.winnerSide === 'blue';
                      const leftWon =
                        (scheduleLeftIsCourtRed && isRedWinner) || (!scheduleLeftIsCourtRed && isBlueWinner);
                      const rightWon =
                        (scheduleLeftIsCourtRed && isBlueWinner) || (!scheduleLeftIsCourtRed && isRedWinner);
                      const displayStatus =
                        progress?.finishedAt &&
                        (rawStatus === 'announced' || rawStatus === 'in_progress')
                          ? 'match_finished'
                          : rawStatus;
                      const isFinishedDisplayStatus = ['match_finished', 'court_approved', 'hq_approved'].includes(
                        displayStatus,
                      );
                      const shouldHighlightWinnerBorder = isFinishedDisplayStatus && colorState?.isScoreVisible === true;
                      const showTbTag =
                        shouldHighlightWinnerBorder &&
                        Number(colorState?.redScore ?? NaN) === Number(colorState?.blueScore ?? NaN);
                      const leftNameClass = shouldHighlightWinnerBorder
                        ? (leftWon ? 'isWinner' : '')
                        : isColorConfirmed
                          ? scheduleLeftIsCourtRed
                            ? 'isRedConfirmed'
                            : 'isBlueConfirmed'
                          : '';
                      const rightNameClass = shouldHighlightWinnerBorder
                        ? (rightWon ? 'isWinner' : '')
                        : isColorConfirmed
                          ? scheduleLeftIsCourtRed
                            ? 'isBlueConfirmed'
                            : 'isRedConfirmed'
                          : '';
                      const poolRoundLabel = toPoolRoundLabel(match);
                      const statusLabel = statusLabelMap[displayStatus] || displayStatus;
                      /** 紙申請の最新が rejected、または本部がコート承認を差し戻した直後（DB フラグ） */
                      const showOperatorApplicationRejected =
                        manualLatestRejectedMatchIds.has(matchIdStr) ||
                        Boolean(progress?.hqRejectedCourtAt);
                      const statusClassName = statusClassMap[displayStatus] || 'isScheduled';
                      const effectiveStatus = rawStatus;
                      const canAnnounce = effectiveStatus === 'scheduled';
                      const canUnannounce = effectiveStatus === 'announced';
                      const warmupStartedLabel = toClockLabel(progress?.warmupStartedAt);
                      const warmupFinishedLabel = toClockLabel(progress?.warmupFinishedAt);
                      const startedLabel = toClockLabel(progress?.startedAt);
                      const finishedLabel = toClockLabel(progress?.finishedAt);
                      const timelineLabels = [
                        warmupStartedLabel,
                        warmupFinishedLabel,
                        startedLabel,
                        finishedLabel,
                      ];
                      const shouldHighlightTimelineLatest = !finishedLabel;
                      const lastDoneIndex = timelineLabels.reduce(
                        (lastIndex, label, i) => (label ? i : lastIndex),
                        -1,
                      );

                      const hqApprovedAtMs = progress?.hqApprovedAt
                        ? new Date(progress.hqApprovedAt).getTime()
                        : NaN;
                      const showCmButton =
                        isOperatorMode &&
                        (rawStatus === 'hq_approved' || rawStatus === 'reflected') &&
                        Number.isFinite(hqApprovedAtMs) &&
                        nowTick >= hqApprovedAtMs + CM_SHOW_DELAY_MS &&
                        !courtHasAnnouncedOrInProgressMatch(court, progressMap);

                      return (
                        <td key={`${slot}-${court}`} className="scheduleCell" style={inProgressPoolBgStyle}>
                          {poolRoundLabel ? (
                            <p className="hqProgressPoolRoundLabel">{poolRoundLabel}</p>
                          ) : null}
                          <div className="scheduleMatchMain">
                            <p
                              className={`schedulePlayerName ${leftNameClass} ${isWinnerPlaceholder(redName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(redName)}
                            </p>
                            <p className="scheduleVersus">VS</p>
                            <p
                              className={`schedulePlayerName ${rightNameClass} ${isWinnerPlaceholder(blueName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(blueName)}
                            </p>
                          </div>
                          <p className="scheduleLiveScore">
                            {colorState?.isScoreVisible ? (
                              <span className="scheduleLiveScoreCluster">
                                <span className="scheduleLiveScoreValue">
                                  {showTbTag && leftWon ? (
                                    <span
                                      className={`scheduleScoreCircled${
                                        isTieBreakScoreSingleDigit(leftScore)
                                          ? ' scheduleScoreCircledIsRound'
                                          : ''
                                      }`}
                                    >
                                      {leftScore}
                                    </span>
                                  ) : (
                                    leftScore
                                  )}
                                </span>
                                <span className="scheduleLiveScoreDash"> - </span>
                                <span className="scheduleLiveScoreValue">
                                  {showTbTag && rightWon ? (
                                    <span
                                      className={`scheduleScoreCircled${
                                        isTieBreakScoreSingleDigit(rightScore)
                                          ? ' scheduleScoreCircledIsRound'
                                          : ''
                                      }`}
                                    >
                                      {rightScore}
                                    </span>
                                  ) : (
                                    rightScore
                                  )}
                                </span>
                              </span>
                            ) : (
                              scoreLabel
                            )}
                          </p>
                          {SHOW_MATCH_ID && (
                            <p className="scheduleMatchSub">{`ID: ${toShortMatchId(match.matchId)}`}</p>
                          )}
                          {displayStatus === 'court_approved' ? (
                            <p
                              className={`hqProgressStatus ${statusClassName} hqProgressStatusCourtApprovedNotice`}
                            >
                              <span className="hqProgressStatusCourtApprovedLine1">コート承認済み</span>
                              <br />
                              <span className="hqProgressStatusCourtApprovedLine2">
                                本部承認をお願いします
                              </span>
                            </p>
                          ) : pendingManualByMatchId.has(matchIdStr) ? (
                            <p
                              className={`hqProgressStatus ${statusClassName} hqProgressStatusOperatorPaperPending`}
                            >
                              <span className="hqProgressStatusCourtApprovedLine1">オペレーター申請</span>
                              <br />
                              <span className="hqProgressStatusCourtApprovedLine2">
                                本部承認をお願いします
                              </span>
                            </p>
                          ) : showOperatorApplicationRejected ? (
                            <p
                              className={`hqProgressStatus ${statusClassName} hqProgressStatusOperatorPaperRejected`}
                            >
                              <span className="hqProgressStatusCourtApprovedLine1">申請却下</span>
                              <br />
                              <span className="hqProgressStatusCourtApprovedLine2">
                                オペレーターが結果を再入力
                              </span>
                            </p>
                          ) : (
                            <p className={`hqProgressStatus ${statusClassName}`}>{statusLabel}</p>
                          )}
                          {isOperatorMode && (
                            <div className="hqProgressTimeline">
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 0 ? 'isDone' : ''}`}>
                                {warmupStartedLabel ? `ウォームアップ開始 ${warmupStartedLabel}` : 'ウォームアップ開始 -'}
                              </p>
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 1 ? 'isDone' : ''}`}>
                                {warmupFinishedLabel ? `ウォームアップ終了 ${warmupFinishedLabel}` : 'ウォームアップ終了 -'}
                              </p>
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 2 ? 'isDone' : ''}`}>
                                {startedLabel ? `試合開始 ${startedLabel}` : '試合開始 -'}
                              </p>
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 3 ? 'isDone' : ''}`}>
                                {finishedLabel ? `試合終了 ${finishedLabel}` : '試合終了 -'}
                              </p>
                            </div>
                          )}
                          {isOperatorMode && showCmButton && (
                            <div className="hqProgressButtonRow">
                              <button
                                type="button"
                                className="hqProgressActionButton hqProgressCmButton"
                                onClick={() => handleCmToggleOnCourt(court)}
                                disabled={actionBusyKey !== '' || importing}
                              >
                                {cmOverlayActiveByCourt[String(court)] === true
                                  ? 'CM取り消し'
                                  : 'CM配信'}
                              </button>
                            </div>
                          )}
                          {isOperatorMode && (canAnnounce || canUnannounce) && (
                            <>
                              <div className="hqProgressButtonRow">
                                {canUnannounce ? (
                                  <button
                                    type="button"
                                    className="hqProgressActionButton"
                                    onClick={() => handleUnannounce(match)}
                                    disabled={actionBusyKey !== '' || importing}
                                  >
                                    配信取り消し
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={`hqProgressActionButton${
                                      highlightAnnounceButtons && canAnnounce ? ' isAnnounceReady' : ''
                                    }`}
                                    onClick={() => handleAnnounce(match)}
                                    disabled={!canAnnounce || actionBusyKey !== '' || importing}
                                  >
                                    スコアボードへ配信
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                          {isOperatorMode &&
                            progress &&
                            (rawStatus === 'announced' ||
                              rawStatus === 'in_progress' ||
                              pendingManualByMatchId.has(matchIdStr) ||
                              showOperatorApplicationRejected) && (
                              <div className="hqProgressButtonRow">
                                <button
                                  type="button"
                                  className="hqProgressActionButton hqProgressManualPaperButton"
                                  onClick={() => setManualPaperModal({ mode: 'submit', match })}
                                  disabled={actionBusyKey !== '' || importing}
                                >
                                  結果入力
                                </button>
                              </div>
                            )}
                          {isTdMode && (
                            <div className="hqProgressButtonRow">
                              <button
                                type="button"
                                className={`hqProgressActionButton ${
                                  ['hq_approved', 'reflected'].includes(effectiveStatus)
                                    ? 'isFullyTransparent'
                                    : ''
                                } ${
                                  effectiveStatus === 'court_approved' ||
                                  pendingManualByMatchId.has(String(match.matchId ?? ''))
                                    ? 'isHqApproveReady'
                                    : ''
                                }`}
                                onClick={() => openHqApproveConfirm(match)}
                                disabled={
                                  (!pendingManualByMatchId.has(String(match.matchId ?? '')) &&
                                    effectiveStatus !== 'court_approved') ||
                                  actionBusyKey !== '' ||
                                  importing
                                }
                              >
                                本部承認
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {manualPaperModal?.match ? (
        <HqProgressManualPaperModal
          match={manualPaperModal.match}
          eventId={eventId}
          playerNameMap={playerNameMap}
          onClose={closeManualPaperModal}
          refreshManualPendingMap={refreshManualPendingMap}
          setOperationMessage={setOperationMessage}
          setOperationError={setOperationError}
        />
      ) : null}
      {hqApproveConfirmModal ? (
        <div
          className="hqProgressManualPaperModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hq-hq-approve-confirm-title"
          onClick={() => {
            if (!hqApproveConfirmBusy) {
              setHqApproveConfirmModal(null);
            }
          }}
        >
          <div
            className="hqProgressManualPaperModal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="hq-hq-approve-confirm-title" className="hqProgressManualPaperModalTitle">
              {toHqApproveConfirmModalTitle(hqApproveConfirmModal.match)}
            </h2>
            {hqApproveConfirmModal.flow === 'paper' && hqApproveConfirmModal.request ? (
              <ManualPaperRequestReviewDl
                request={hqApproveConfirmModal.request}
                playerNameMap={playerNameMap}
              />
            ) : hqApproveConfirmModal.flow === 'scoreboard' ? (
              <ManualPaperRequestReviewDl
                request={buildCourtApproveSyntheticManualRequest(
                  hqApproveConfirmModal.match,
                  courtColorStateMap.get(String(hqApproveConfirmModal.match?.matchId ?? '')),
                  progressMap.get(String(hqApproveConfirmModal.match?.matchId ?? '')),
                )}
                playerNameMap={playerNameMap}
              />
            ) : null}
            <div className="hqProgressManualPaperModalActions hqProgressManualPaperModalActions--hqApproveConfirm">
              {hqApproveConfirmModal.flow === 'paper' || hqApproveConfirmModal.flow === 'scoreboard' ? (
                <>
                  <button
                    type="button"
                    className="hqProgressActionButton hqProgressManualPaperRejectButton"
                    onClick={() => executeHqApproveReject()}
                    disabled={hqApproveConfirmBusy}
                  >
                    {hqApproveConfirmBusy ? '処理中…' : '却下'}
                  </button>
                  <span
                    className="hqProgressManualPaperModalActionsInterButtonGap"
                    aria-hidden="true"
                  />
                </>
              ) : null}
              <button
                type="button"
                className="hqProgressActionButton hqProgressManualPaperApproveButton"
                onClick={() => executeHqApproveConfirm()}
                disabled={hqApproveConfirmBusy}
              >
                {hqApproveConfirmBusy ? '処理中…' : '本部承認'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isTdMode && showApproverModal ? (
        <div
          className="hqProgressApproverModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hq-approver-modal-title"
        >
          <div className="hqProgressApproverModal">
            <h2 id="hq-approver-modal-title" className="hqProgressApproverModalTitle">本部承認者名を入力</h2>
            <p className="hqProgressApproverModalNote">この名前で本部承認を実行します。</p>
            <form
              className="hqProgressApproverModalForm"
              onSubmit={(event) => {
                event.preventDefault();
                handleApproverModalSubmit();
              }}
            >
              <input
                type="text"
                className="hqProgressApproverInput"
                value={approverNameDraft}
                onChange={(event) => setApproverNameDraft(event.target.value)}
                autoFocus
              />
              <div className="hqProgressApproverModalActions">
                <button type="submit" className="hqProgressActionButton">
                  確定
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default HqProgress;
