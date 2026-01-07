import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * 結果表コンポーネント
 * resultApprovalセクションで各エンドのスコアを表示
 */
const ResultTable = ({ redScores = [], blueScores = [] }) => {
  // エンド番号の最大値を取得
  const getMaxEnd = () => {
    let maxEnd = 0;
    
    // 新しい構造（オブジェクト配列）の場合
    [...redScores, ...blueScores].forEach(score => {
      if (typeof score === 'object' && score.end) {
        maxEnd = Math.max(maxEnd, score.end);
      }
    });
    
    // 後方互換性: 数値配列の場合、配列の長さから最大エンド番号を取得
    if (maxEnd === 0) {
      maxEnd = Math.max(redScores.length, blueScores.length);
    }
    
    return maxEnd;
  };

  const maxEnd = getMaxEnd();

  // 行がない場合は何も表示しない
  if (maxEnd === 0) {
    return null;
  }

  // エンドごとのスコアと反則を取得するヘルパー関数
  const getScoreData = (scores, endNumber) => {
    // 後方互換性: 数値配列の場合
    if (scores.length > 0 && typeof scores[0] === 'number') {
      const index = endNumber - 1;
      return {
        score: scores[index] ?? 0,
        penalties: []
      };
    }
    
    // 新しい構造: オブジェクト配列の場合
    const endEntry = scores.find(s => typeof s === 'object' && s.end === endNumber);
    if (endEntry) {
      return {
        score: endEntry.score ?? 0,
        penalties: endEntry.penalties || []
      };
    }
    
    return { score: 0, penalties: [] };
  };

  return (
    <div id="resultTable">
      <table>
        <thead>
          <tr>
            <th>赤</th>
            <th>エンド</th>
            <th>青</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxEnd }, (_, index) => {
            const endNumber = index + 1;
            const redData = getScoreData(redScores, endNumber);
            const blueData = getScoreData(blueScores, endNumber);
            
            return (
              <tr key={endNumber}>
                <td className={redData.score >= 1 ? 'has-score' : ''}>
                  {redData.score}
                  {redData.penalties.length > 0 && (
                    <div className="penalties">
                      {redData.penalties.map((penalty, i) => {
                        // penaltyがpenaltyId（英語のキー）か、ローカライズされたテキストかを判定
                        const currentLang = getCurrentLanguage();
                        const penaltyText = getLocalizedText(`penalties.${penalty}`, currentLang) || penalty;
                        return (
                          <span key={i} className="penalty-badge">{penaltyText}</span>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td>{endNumber}</td>
                <td className={blueData.score >= 1 ? 'has-score' : ''}>
                  {blueData.score}
                  {blueData.penalties.length > 0 && (
                    <div className="penalties">
                      {blueData.penalties.map((penalty, i) => {
                        // penaltyがpenaltyId（英語のキー）か、ローカライズされたテキストかを判定
                        const currentLang = getCurrentLanguage();
                        const penaltyText = getLocalizedText(`penalties.${penalty}`, currentLang) || penalty;
                        return (
                          <span key={i} className="penalty-badge">{penaltyText}</span>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ResultTable;

