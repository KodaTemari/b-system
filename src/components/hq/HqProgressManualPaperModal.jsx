import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toShortMatchId } from '../schedule/scheduleDisplayUtils';
import {
  MANUAL_PAPER_DEFAULT_REFEREE_NAME,
  MANUAL_PAPER_DEFAULT_TOTAL_ENDS,
} from './hqProgressConstants.js';
import {
  createEmptyManualPaperMatchEnds,
  fetchManualPaperTotalEnds,
  formatHqModalPlayerIdName,
} from './hqProgressManualPaperHelpers.js';
import { toManualPaperModalTitle } from './hqProgressMatchContext.js';
import { HqModalPlayerIdName } from './HqModalPlayerIdName.jsx';

/**
 * 親の nowTick / 進行ポーリングで再レンダーされても、入力中に DOM が差し替わり続けないよう切り離す
 */
export const HqProgressManualPaperModal = memo(function HqProgressManualPaperModal({
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
