import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * 結果表コンポーネント
 * resultApprovalセクションで各エンドのスコアを表示
 */
const ResultTable = ({ ends = [] }) => {
  const currentLang = getCurrentLanguage();

  // エンド番号の最大値を取得
  const getMaxEnd = () => {
    let maxEnd = 0;
    ends.forEach(entry => {
      if (entry.end) {
        maxEnd = Math.max(maxEnd, entry.end);
      }
    });
    return maxEnd;
  };

  const maxEnd = getMaxEnd();

  // 行がない場合、何も表示しない
  if (maxEnd === 0) {
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
  const getPenaltyIndices = (endNumber, color) => {
    return penaltyLegend
      .filter(p => p.end === endNumber && p.color === color)
      .map(p => p.index);
  };

  // エンドごとのスコアと反則を取得するヘルパー関数
  const getEndData = (endNumber) => {
    const endEntry = ends.find(e => e.end === endNumber);
    if (endEntry) {
      return {
        redScore: endEntry.redScore ?? 0,
        blueScore: endEntry.blueScore ?? 0,
        redPenalties: endEntry.redPenalties || [],
        bluePenalties: endEntry.bluePenalties || []
      };
    }
    return { redScore: 0, blueScore: 0, redPenalties: [], bluePenalties: [] };
  };

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
            {Array.from({ length: maxEnd }, (_, index) => {
              const endNumber = index + 1;
              const data = getEndData(endNumber);
              const redPenaltyIndices = getPenaltyIndices(endNumber, 'red');
              const bluePenaltyIndices = getPenaltyIndices(endNumber, 'blue');
              
              return (
                <tr key={endNumber}>
                  <td className={data.redScore >= 1 ? 'isHasScore' : ''}>
                    {data.redScore}
                    {redPenaltyIndices.length > 0 && (
                      <span className="penaltyRef">
                        {redPenaltyIndices.map(i => `*${i}`).join(',')}
                      </span>
                    )}
                  </td>
                  <td>{endNumber}</td>
                  <td className={data.blueScore >= 1 ? 'isHasScore' : ''}>
                    {data.blueScore}
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
                    *{p.index} 第{p.end}エンド / {p.colorName} / {getLocalizedText(`penalties.${p.penaltyId}`, currentLang) || p.penaltyId}
                  </div>
                ))}
            </div>
            <div className="penaltyGroup blue">
              {penaltyLegend
                .filter(p => p.color === 'blue')
                .map((p, i) => (
                  <div key={i} className="legendItem">
                    *{p.index} 第{p.end}エンド / {p.colorName} / {getLocalizedText(`penalties.${p.penaltyId}`, currentLang) || p.penaltyId}
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
