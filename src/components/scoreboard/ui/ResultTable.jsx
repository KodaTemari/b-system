import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * 結果表コンポーネント
 * resultApprovalセクションで各エンドのスコアを表示
 */
const ResultTable = ({ ends = [] }) => {
  const currentLang = getCurrentLanguage();

  // 表示するデータがない場合
  if (!ends || ends.length === 0) {
    return null;
  }

  // 全エンドを通じて発生した反則の発生順リストを作成（注釈用）
  const penaltyOccurrences = [];
  ends.forEach(e => {
    // 赤の反則を追加
    if (e.redPenalties && e.redPenalties.length > 0) {
      e.redPenalties.forEach(p => {
        penaltyOccurrences.push({
          end: e.end,
          color: 'red',
          colorName: getLocalizedText('match.red', currentLang),
          penaltyId: p
        });
      });
    }
    // 青の反則を追加
    if (e.bluePenalties && e.bluePenalties.length > 0) {
      e.bluePenalties.forEach(p => {
        penaltyOccurrences.push({
          end: e.end,
          color: 'blue',
          colorName: getLocalizedText('match.blue', currentLang),
          penaltyId: p
        });
      });
    }
  });

  // 注釈番号を割り振る
  const penaltyLegend = penaltyOccurrences.map((occ, index) => ({
    ...occ,
    index: index + 1
  }));

  // 特定のエンド・色のチームに対する注釈番号の配列を取得するヘルパー
  const getPenaltyIndices = (endIdentifier, color) => {
    return penaltyLegend
      .filter(p => p.end === endIdentifier && p.color === color)
      .map(p => p.index);
  };

  // 表示対象のエンドをフィルタリング
  // 1. 通常のエンド（数値）はすべて表示
  // 2. タイブレーク（数値以外）は反則がある場合のみ表示
  const visibleEnds = ends.filter(e => {
    const isRegularEnd = typeof e.end === 'number';
    const hasPenalties = (e.redPenalties?.length > 0 || e.bluePenalties?.length > 0);
    return isRegularEnd || hasPenalties;
  });

  return (
    <div id="resultTableContainer">
      <div id="resultTable">
        <table>
          <thead>
            <tr>
              <th>{getLocalizedText('match.red', currentLang)}</th>
              <th>{getLocalizedText('match.end', currentLang)}</th>
              <th>{getLocalizedText('match.blue', currentLang)}</th>
            </tr>
          </thead>
          <tbody>
            {visibleEnds.map((endEntry, index) => {
              const endLabel = endEntry.end; // 1, 2, "TB1" など
              const isTieBreakEnd = typeof endLabel === 'string';
              const redPenaltyIndices = getPenaltyIndices(endLabel, 'red');
              const bluePenaltyIndices = getPenaltyIndices(endLabel, 'blue');
              
              return (
                <tr key={index}>
                  <td className={!isTieBreakEnd && endEntry.redScore >= 1 ? 'isHasScore' : ''}>
                    {!isTieBreakEnd && endEntry.redScore}
                    {redPenaltyIndices.length > 0 && (
                      <span className="penaltyRef">
                        {redPenaltyIndices.map(i => `*${i}`).join(',')}
                      </span>
                    )}
                  </td>
                  <td>{endLabel}</td>
                  <td className={!isTieBreakEnd && endEntry.blueScore >= 1 ? 'isHasScore' : ''}>
                    {!isTieBreakEnd && endEntry.blueScore}
                    {bluePenaltyIndices.length > 0 && (
                      <span className="penaltyRef">
                        {bluePenaltyIndices.map(i => `*${i}`).join(',')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 補足情報エリア */}
      {penaltyLegend.length > 0 && (
        <div id="resultTableFooter">
          <div className="penaltyLegend">
            <div className="penaltyGroup red">
              {penaltyLegend
                .filter(p => p.color === 'red')
                .map((p, i) => (
                  <div key={i} className="legendItem">
                    *{p.index} {getLocalizedText('match.end', currentLang)}{p.end} / {p.colorName} / {getLocalizedText(`penalties.${p.penaltyId}`, currentLang) || p.penaltyId}
                  </div>
                ))}
            </div>
            <div className="penaltyGroup blue">
              {penaltyLegend
                .filter(p => p.color === 'blue')
                .map((p, i) => (
                  <div key={i} className="legendItem">
                    *{p.index} {getLocalizedText('match.end', currentLang)}{p.end} / {p.colorName} / {getLocalizedText(`penalties.${p.penaltyId}`, currentLang) || p.penaltyId}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultTable;
