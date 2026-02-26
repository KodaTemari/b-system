import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  computeStandingsByClassification,
  isGameCompleted
} from '../../utils/results/groupStandings';
import './GroupResults.css';

const POLL_INTERVAL_MS = 5000;

/** チームアイコン用の色パレット（順番に割り当て） */
const TEAM_COLORS = [
  '#4a6fa5', '#c45c26', '#6b4d9e', '#c75b7a',
  '#5a8f5a', '#8b7355', '#e6a23c', '#67c6c0'
];

/**
 * グループリーグ結果表示画面
 * 前バージョンと同様の「対戦成績マトリックス＋勝ち数・得失点・得点・順位」形式で表示
 */
const GroupResults = () => {
  const { id: eventId } = useParams();
  const [gamesList, setGamesList] = useState([]);
  const [eventName, setEventName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAllGames = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/data/${eventId}/results/all-games`);
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const data = await res.json();
      setGamesList(data.games || []);
      setError(null);
    } catch (err) {
      setError(err.message);
      setGamesList([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const fetchEventName = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/data/${eventId}/init.json`);
      if (res.ok) {
        const init = await res.json();
        setEventName(init.gameName || init.eventName || eventId);
      } else {
        setEventName(eventId);
      }
    } catch {
      setEventName(eventId);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEventName();
  }, [fetchEventName]);

  useEffect(() => {
    fetchAllGames();
    const interval = setInterval(fetchAllGames, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAllGames]);

  const grouped = computeStandingsByClassification(gamesList);
  const completedCount = gamesList.filter(({ game }) => isGameCompleted(game)).length;

  if (loading && gamesList.length === 0) {
    return (
      <div className="groupResults loading">
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="groupResults error">
        <p>エラー: {error}</p>
      </div>
    );
  }

  return (
    <div className="groupResults">
      <header className="groupResultsHeader">
        <h1 className="groupResultsTitle">{eventName}</h1>
        <p className="groupResultsSubtitle">グループリーグ結果（{POLL_INTERVAL_MS / 1000}秒ごとに更新）</p>
      </header>

      {grouped.length === 0 ? (
        <p className="groupResultsEmpty">
          {completedCount === 0
            ? '完了した試合がまだありません。'
            : '試合データはありますが、クラス分類でグループ化できる試合がありません。'}
        </p>
      ) : (
        <div className="groupResultsBlocks">
          {grouped.map(({ classification, standings, matches, matrix, shortNames }) => (
            <section key={classification} className="groupResultsBlock">
              <h2 className="groupResultsBlockTitle">{classification}</h2>

              <div className="groupResultsMatrixWrap">
                <table className="groupResultsMatrix">
                  <thead>
                    <tr>
                      <th className="groupResultsMatrixTeamHeader" scope="col">チーム</th>
                      {shortNames.map((short, j) => (
                        <th key={j} className="groupResultsMatrixColHeader">{short}</th>
                      ))}
                      <th className="groupResultsMatrixSummaryHeader">勝ち数</th>
                      <th className="groupResultsMatrixSummaryHeader">得失点</th>
                      <th className="groupResultsMatrixSummaryHeader">得点</th>
                      <th className="groupResultsMatrixSummaryHeader">順位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, i) => (
                      <tr key={row.name}>
                        <td className="groupResultsMatrixTeamCell">
                          <span
                            className="groupResultsTeamIcon"
                            style={{ backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length] }}
                            aria-hidden
                          />
                          <span className="groupResultsTeamName">{row.name}</span>
                        </td>
                        {matrix[i].map((cell, j) => (
                          <td key={j} className="groupResultsMatrixCell">
                            {cell === null ? (
                              i === j ? '-' : '—'
                            ) : (
                              <span className={cell.rowWon ? 'resultWin' : 'resultLose'}>
                                {cell.scoreRow}-{cell.scoreCol} {cell.rowWon ? 'O' : 'X'}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="groupResultsMatrixSummaryCell">{row.wins}</td>
                        <td className={`groupResultsMatrixSummaryCell ${row.pointDiff >= 0 ? 'diffPlus' : 'diffMinus'}`}>
                          {row.pointDiff >= 0 ? '+' : ''}{row.pointDiff}
                        </td>
                        <td className="groupResultsMatrixSummaryCell">{row.pointsFor}</td>
                        <td className="groupResultsMatrixSummaryCell">{row.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupResults;
