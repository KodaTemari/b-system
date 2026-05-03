import { comparePlayerIdsForPaperOrder } from './hqProgressManualPaperHelpers.js';
import { HqModalPlayerIdName } from './HqModalPlayerIdName.jsx';

/** オペレーター申請内容の確認（本部承認モーダル）。選手 ID 昇順で左→右、赤青バッジはコート側のまま */
export function ManualPaperRequestReviewDl({ request: req, playerNameMap }) {
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
