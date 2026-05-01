import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  computeStandingsByClassification,
  isGameCompleted
} from '../../utils/results/poolStandings';
import './PoolResults.css';

const POLL_INTERVAL_MS = 2000;

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
      const [gamesRes, progressRes, standingsRes] = await Promise.all([
        fetch(`/api/data/${eventId}/results/all-games`),
        fetch(`/api/progress/${eventId}/matches`),
        fetch(`/api/progress/${eventId}/pool/standings?includeHqApproved=true`),
      ]);
      if (!gamesRes.ok || !progressRes.ok || !standingsRes.ok) {
        throw new Error('データの取得に失敗しました');
      }
      const gamesData = await gamesRes.json();
      const progressData = await progressRes.json();
      const standingsData = await standingsRes.json();
      const progressList = Array.isArray(progressData?.matches) ? progressData.matches : [];
      const reflectedMatchIds = new Set(
        progressList
          .filter((m) => String(m?.status ?? '') === 'reflected')
          .map((m) => String(m?.matchId ?? '').trim())
          .filter(Boolean),
      );
      const allGames = Array.isArray(gamesData?.games) ? gamesData.games : [];
      const approvedGames = allGames.filter((entry) => {
        const matchId = String(entry?.game?.matchID ?? '').trim();
        return matchId && reflectedMatchIds.has(matchId);
      });
      let sourceGames = approvedGames;
      if (sourceGames.length === 0 && reflectedMatchIds.size > 0) {
        // フォールバック: reflected はあるのに all-games 側で拾えない場合は進行APIの結果を直接利用
        const rows = Array.isArray(standingsData?.matches) ? standingsData.matches : [];
        sourceGames = rows
          .filter((m) => String(m?.status ?? '') === 'reflected' || String(m?.status ?? '') === 'hq_approved')
          .map((m) => {
            const redScore = Number(m?.red_score ?? 0);
            const blueScore = Number(m?.blue_score ?? 0);
            const winnerPlayerId = String(m?.winner_player_id ?? '').trim();
            const redPlayerId = String(m?.red_player_id ?? '').trim();
            const bluePlayerId = String(m?.blue_player_id ?? '').trim();
            let redResult = 'draw';
            let blueResult = 'draw';
            if (winnerPlayerId && winnerPlayerId === redPlayerId) {
              redResult = 'win';
              blueResult = 'lose';
            } else if (winnerPlayerId && winnerPlayerId === bluePlayerId) {
              redResult = 'lose';
              blueResult = 'win';
            } else if (redScore > blueScore) {
              redResult = 'win';
              blueResult = 'lose';
            } else if (blueScore > redScore) {
              redResult = 'lose';
              blueResult = 'win';
            }
            return {
              courtId: String(m?.court_id ?? ''),
              game: {
                classification: '',
                match: { section: 'resultApproval' },
                red: { name: redPlayerId || '—', score: redScore, result: redResult },
                blue: { name: bluePlayerId || '—', score: blueScore, result: blueResult },
              },
            };
          });
      }
      const normalizedGames = sourceGames.map((entry) => {
        const game = entry?.game ?? {};
        const red = game?.red ?? {};
        const blue = game?.blue ?? {};
        const redScore = Number(red?.score ?? 0);
        const blueScore = Number(blue?.score ?? 0);
        let redResult = String(red?.result ?? '').trim();
        let blueResult = String(blue?.result ?? '').trim();

        if (!redResult || !blueResult) {
          if (redScore > blueScore) {
            redResult = 'win';
            blueResult = 'lose';
          } else if (blueScore > redScore) {
            redResult = 'lose';
            blueResult = 'win';
          } else if (red?.isTieBreak === true) {
            redResult = 'win';
            blueResult = 'lose';
          } else if (blue?.isTieBreak === true) {
            redResult = 'lose';
            blueResult = 'win';
          } else {
            redResult = redResult || 'draw';
            blueResult = blueResult || 'draw';
          }
        }

        return {
          ...entry,
          game: {
            ...game,
            match: {
              ...(game?.match ?? {}),
              // reflected 済みは順位計算上「完了試合」として扱う
              section: 'resultApproval',
            },
            red: {
              ...red,
              score: redScore,
              result: redResult,
            },
            blue: {
              ...blue,
              score: blueScore,
              result: blueResult,
            },
          },
        };
      });
      setGamesList(normalizedGames);
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
                      <th className="poolResultsMatrixSummaryHeader poolResultsMatrixSummaryHeaderEndsWon">勝エンド</th>
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
                        <td className="poolResultsMatrixSummaryCell">{row.endsWon ?? 0}</td>
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
