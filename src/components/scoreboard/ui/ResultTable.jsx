import React from 'react';

/**
 * 結果表コンポーネント
 * resultCheckセクションで各エンドのスコアを表示
 */
const ResultTable = ({ redScores = [], blueScores = [] }) => {
  // 配列の長さを取得（行数）
  const rowCount = Math.max(redScores.length, blueScores.length);

  // 行がない場合は何も表示しない
  if (rowCount === 0) {
    return null;
  }

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
          {Array.from({ length: rowCount }, (_, index) => {
            const redScore = redScores[index] ?? 0;
            const blueScore = blueScores[index] ?? 0;
            return (
              <tr key={index}>
                <td className={redScore >= 1 ? 'has-score' : ''}>{redScore}</td>
                <td>{index + 1}</td>
                <td className={blueScore >= 1 ? 'has-score' : ''}>{blueScore}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ResultTable;

