import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  computeStandingsByClassification,
  isGameCompleted
} from '../../utils/results/poolStandings';
import './PoolResults.css';

const POLL_INTERVAL_MS = 5000;

/** チームアイコン用の色パレット（順番に割り当て） */
const TEAM_COLORS = [
  '#4a6fa5', '#c45c26', '#6b4d9e', '#c75b7a',
  '#5a8f5a', '#8b7355', '#e6a23c', '#67c6c0'
];

/**
 * プール結果表示画面
 * プール（A,B,C…）ごとに「対戦成績マトリックス＋勝ち数・得失点・得点・順位」形式で表示
 */
const PoolResults = () => {
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

  const pooled = computeStandingsByClassification(gamesList);
  const completedCount = gamesList.filter(({ game }) => isGameCompleted(game)).length;

  if (loading && gamesList.length === 0) {
    return (
      <div className="poolResults loading">
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="poolResults error">
        <p>エラー: {error}</p>
      </div>
    );
  }

  return (
    <div className="poolResults">
      <header className="poolResultsHeader">
        <h1 className="poolResultsTitle">{eventName}</h1>
        <p className="poolResultsSubtitle">プール結果（{POLL_INTERVAL_MS / 1000}秒ごとに更新）</p>
      </header>

      {pooled.length === 0 ? (
        <p className="poolResultsEmpty">
          {completedCount === 0
            ? '完了した試合がまだありません。'
            : '試合データはありますが、プールでまとめられる試合がありません。'}
        </p>
      ) : (
        <div className="poolResultsBlocks">
          {pooled.map(({ classification, standings, matches, matrix, shortNames }, poolIndex) => (
            <section key={classification} className="poolResultsBlock">
              <h2 className="poolResultsBlockTitle">プール{String.fromCharCode(65 + poolIndex)}</h2>

              <div className="poolResultsMatrixWrap">
                <table className="poolResultsMatrix">
                  <thead>
                    <tr>
                      <th className="poolResultsMatrixTeamHeader" scope="col">チーム</th>
                      {shortNames.map((short, j) => (
                        <th key={j} className="poolResultsMatrixColHeader">{short}</th>
                      ))}
                      <th className="poolResultsMatrixSummaryHeader">勝ち数</th>
                      <th className="poolResultsMatrixSummaryHeader">得失点</th>
                      <th className="poolResultsMatrixSummaryHeader">得点</th>
                      <th className="poolResultsMatrixSummaryHeader">順位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, i) => (
                      <tr key={row.name}>
                        <td className="poolResultsMatrixTeamCell">
                          <span
                            className="poolResultsTeamIcon"
                            style={{ backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length] }}
                            aria-hidden
                          />
                          <span className="poolResultsTeamName">{row.name}</span>
                        </td>
                        {matrix[i].map((cell, j) => (
                          <td key={j} className="poolResultsMatrixCell">
                            {cell === null ? (
                              i === j ? '-' : '—'
                            ) : (
                              <span className={cell.rowWon ? 'resultWin' : 'resultLose'}>
                                {cell.scoreRow}-{cell.scoreCol} {cell.rowWon ? 'O' : 'X'}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="poolResultsMatrixSummaryCell">{row.wins}</td>
                        <td className={`poolResultsMatrixSummaryCell ${row.pointDiff >= 0 ? 'diffPlus' : 'diffMinus'}`}>
                          {row.pointDiff >= 0 ? '+' : ''}{row.pointDiff}
                        </td>
                        <td className="poolResultsMatrixSummaryCell">{row.pointsFor}</td>
                        <td className="poolResultsMatrixSummaryCell">{row.rank}</td>
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

export default PoolResults;
