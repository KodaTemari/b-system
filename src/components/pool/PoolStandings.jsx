import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getCurrentLanguage } from '../../locales';
import './PoolStandings.css';

const RESULTS_POLL_INTERVAL_MS = 2000;
const ROTATION_SWITCH_INTERVAL_MS = 10000;
const ROTATION_FADE_MS = 350;

const normalizePlayers = (players) => {
  if (!Array.isArray(players)) {
    return [];
  }
  return players
    .map((player) => ({
      id: String(player.id ?? '').trim(),
      name: String(player.name ?? '').trim(),
      poolId: String(player.poolId ?? '').trim(),
      poolOrder: Number(player.poolOrder),
    }))
    .filter((player) => player.id && player.name);
};

const parsePoolMeta = (poolText) => {
  const raw = String(poolText ?? '').trim();
  if (!raw) {
    return { groupId: '', order: null };
  }
  const dashMatch = raw.match(/^([A-Za-z]+)[-_](\d+)$/);
  if (dashMatch) {
    return {
      groupId: dashMatch[1].toUpperCase(),
      order: Number(dashMatch[2]),
    };
  }
  return {
    groupId: raw.toUpperCase(),
    order: null,
  };
};

const normalizePools = (pools) => {
  if (!Array.isArray(pools)) {
    return [];
  }
  return pools
    .map((pool) => ({
      poolId: String(pool.poolId ?? '').trim(),
      playerIds: Array.isArray(pool.playerIds) ? pool.playerIds.map((id) => String(id ?? '').trim()).filter(Boolean) : [],
    }))
    .filter((pool) => pool.poolId);
};

const toNumberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toMatchScore = (match) => {
  const red =
    toNumberOrNull(match.redScore) ??
    toNumberOrNull(match.redPoints) ??
    toNumberOrNull(match.redTotalScore) ??
    null;
  const blue =
    toNumberOrNull(match.blueScore) ??
    toNumberOrNull(match.bluePoints) ??
    toNumberOrNull(match.blueTotalScore) ??
    null;
  if (red == null || blue == null) {
    return null;
  }
  return { red, blue };
};

const getNotationMode = (lang) => {
  return lang === 'ja' ? 'jp' : 'wl';
};

const getResultMarker = (myScore, oppScore, notationMode, isWinner = null) => {
  if (isWinner === true) {
    return notationMode === 'jp' ? '○' : 'W';
  }
  if (isWinner === false) {
    return notationMode === 'jp' ? '×' : 'L';
  }
  if (myScore > oppScore) {
    return notationMode === 'jp' ? '○' : 'W';
  }
  if (myScore < oppScore) {
    return notationMode === 'jp' ? '×' : 'L';
  }
  return notationMode === 'jp' ? '△' : 'D';
};

const sortRowsByOrder = (rows) => {
  rows.sort((a, b) => {
    const aOrder = Number.isInteger(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isInteger(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.id.localeCompare(b.id, 'ja');
  });
  return rows;
};

const collectPoolIds = (players, schedulePools, matches) => {
  const poolSet = new Set();
  for (const pool of schedulePools) {
    const id = String(pool.poolId ?? '').trim().toUpperCase();
    if (id) {
      poolSet.add(id);
    }
  }
  for (const player of players) {
    const parsed = parsePoolMeta(player.poolId);
    if (parsed.groupId) {
      poolSet.add(parsed.groupId);
    }
  }
  for (const match of matches) {
    const id = String(match.poolId ?? '').trim().toUpperCase();
    if (id) {
      poolSet.add(id);
    }
  }
  return Array.from(poolSet).sort((a, b) => a.localeCompare(b, 'ja'));
};

const resolveMatchPoolId = (match, playerPoolGroupMap) => {
  const explicitPool = String(match.poolId ?? '').trim().toUpperCase();
  if (explicitPool) {
    return explicitPool;
  }
  const redId = String(match.redPlayerId ?? '').trim();
  const blueId = String(match.bluePlayerId ?? '').trim();
  const redPool = playerPoolGroupMap.get(redId) ?? '';
  const bluePool = playerPoolGroupMap.get(blueId) ?? '';
  if (redPool && bluePool && redPool === bluePool) {
    return redPool;
  }
  return '';
};

const buildPoolViewData = (poolId, players, schedule, playerNameMap, playerPoolGroupMap) => {
  const targetPool = schedule.pools.find((pool) => pool.poolId.toUpperCase() === poolId) ?? null;
  const poolMatches = schedule.matches
    .filter((match) => resolveMatchPoolId(match, playerPoolGroupMap) === poolId)
    .slice()
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

  const fallbackPlayerIds = (() => {
    const ids = new Set();
    for (const match of poolMatches) {
      const redId = String(match.redPlayerId ?? '').trim();
      const blueId = String(match.bluePlayerId ?? '').trim();
      if (redId) {
        ids.add(redId);
      }
      if (blueId) {
        ids.add(blueId);
      }
    }
    return Array.from(ids);
  })();

  const playerPoolIds = (() => {
    const rows = players
      .map((player) => {
        const parsed = parsePoolMeta(player.poolId);
        const order = Number.isInteger(player.poolOrder) && player.poolOrder > 0 ? player.poolOrder : parsed.order;
        return {
          id: player.id,
          groupId: parsed.groupId,
          order,
        };
      })
      .filter((row) => row.groupId === poolId);
    return sortRowsByOrder(rows).map((row) => row.id);
  })();

  const teamIds =
    playerPoolIds.length > 0
      ? playerPoolIds
      : targetPool && targetPool.playerIds.length > 0
        ? targetPool.playerIds
        : fallbackPlayerIds;

  const hasTargetPool = Boolean(targetPool) || poolMatches.length > 0 || playerPoolIds.length > 0;
  const teamRows = teamIds.map((playerId) => ({
    id: playerId,
    name: playerNameMap.get(playerId) ?? `ID: ${playerId}`,
  }));

  const statsMap = new Map(
    teamRows.map((team) => [
      team.id,
      {
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ])
  );
  const cellMap = new Map();
  for (const match of poolMatches) {
    const redId = String(match.redPlayerId ?? '').trim();
    const blueId = String(match.bluePlayerId ?? '').trim();
    if (!statsMap.has(redId) || !statsMap.has(blueId)) {
      continue;
    }
    const score = toMatchScore(match);
    if (!score) {
      continue;
    }
    const redStats = statsMap.get(redId);
    const blueStats = statsMap.get(blueId);
    redStats.pointsFor += score.red;
    redStats.pointsAgainst += score.blue;
    blueStats.pointsFor += score.blue;
    blueStats.pointsAgainst += score.red;
    const winnerPlayerId = String(match.winnerPlayerId ?? '').trim();
    const redIsWinner = score.red > score.blue
      ? true
      : score.red < score.blue
        ? false
        : (winnerPlayerId ? winnerPlayerId === redId : null);
    const blueIsWinner = score.blue > score.red
      ? true
      : score.blue < score.red
        ? false
        : (winnerPlayerId ? winnerPlayerId === blueId : null);
    if (redIsWinner === true) {
      redStats.wins += 1;
    } else if (blueIsWinner === true) {
      blueStats.wins += 1;
    }
    cellMap.set(`${redId}:${blueId}`, {
      myScore: score.red,
      oppScore: score.blue,
      isWinner: redIsWinner,
    });
    cellMap.set(`${blueId}:${redId}`, {
      myScore: score.blue,
      oppScore: score.red,
      isWinner: blueIsWinner,
    });
  }

  const rankSource = teamRows
    .map((team) => {
      const stats = statsMap.get(team.id);
      const diff = stats.pointsFor - stats.pointsAgainst;
      return {
        id: team.id,
        wins: stats.wins,
        diff,
        pointsFor: stats.pointsFor,
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      if (b.diff !== a.diff) {
        return b.diff - a.diff;
      }
      if (b.pointsFor !== a.pointsFor) {
        return b.pointsFor - a.pointsFor;
      }
      return a.id.localeCompare(b.id, 'ja');
    });
  const rankMap = new Map(rankSource.map((row, index) => [row.id, index + 1]));

  return { poolId, hasTargetPool, teamRows, statsMap, cellMap, rankMap };
};

const PoolStandings = () => {
  const { id: eventId, poolId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(getCurrentLanguage());
  const [rotationPhase, setRotationPhase] = useState(0);
  const [lastRotationAt, setLastRotationAt] = useState(() => Date.now());
  const [rotationRemainingMs, setRotationRemainingMs] = useState(ROTATION_SWITCH_INTERVAL_MS);
  const [displayPoolIds, setDisplayPoolIds] = useState([]);
  const [isPoolListFading, setIsPoolListFading] = useState(false);
  const [players, setPlayers] = useState([]);
  const [schedule, setSchedule] = useState({
    pools: [],
    matches: [],
  });

  useEffect(() => {
    if (!eventId) {
      return undefined;
    }
    let cancelled = false;
    const syncReflectedResults = async () => {
      try {
        const response = await fetch(`/api/progress/${eventId}/pool/standings?includeHqApproved=true`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const rows = Array.isArray(payload?.matches) ? payload.matches : [];
        const resultMap = new Map();
        for (const row of rows) {
          const matchId = String(row?.match_id ?? '').trim();
          if (!matchId) continue;
          resultMap.set(matchId, row);
        }
        if (cancelled || resultMap.size === 0) {
          return;
        }
        setSchedule((prev) => {
          const mergedMatches = prev.matches.map((match) => {
            const matchId = String(match?.matchId ?? '').trim();
            const result = resultMap.get(matchId);
            if (!result) {
              return match;
            }
            return {
              ...match,
              redScore: Number(result?.red_score ?? 0),
              blueScore: Number(result?.blue_score ?? 0),
              winnerPlayerId: String(result?.winner_player_id ?? '').trim(),
            };
          });
          return {
            ...prev,
            matches: mergedMatches,
          };
        });
      } catch {
        // 一時的な通信失敗は次回ポーリングで再試行
      }
    };

    syncReflectedResults();
    const timer = setInterval(syncReflectedResults, RESULTS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventId]);

  useEffect(() => {
    const onLanguageChanged = (event) => {
      const lang = String(event?.detail?.language ?? getCurrentLanguage());
      setLanguage(lang);
    };
    window.addEventListener('languageChanged', onLanguageChanged);
    return () => {
      window.removeEventListener('languageChanged', onLanguageChanged);
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!eventId) {
        setError('eventId が指定されていません。');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const scheduleRes = await fetch(`/data/${eventId}/schedule.json`);
        const scheduleJson = scheduleRes.ok ? await scheduleRes.json() : null;
        if (!scheduleJson || Array.isArray(scheduleJson)) {
          throw new Error('schedule.json の読み込みに失敗しました。');
        }

        const playerClassCode = String(scheduleJson.classCode ?? 'FRD');
        const playersRes = await fetch(`/data/${eventId}/classes/${playerClassCode}/player.json`);
        const playersJson = playersRes.ok ? await playersRes.json() : [];

        setSchedule({
          pools: normalizePools(scheduleJson.pools),
          matches: Array.isArray(scheduleJson.matches) ? scheduleJson.matches : [],
        });
        setPlayers(normalizePlayers(playersJson));
        setError('');
      } catch (err) {
        setError(err.message || 'プールデータの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [eventId]);

  const playerNameMap = useMemo(() => {
    return new Map(players.map((player) => [player.id, player.name]));
  }, [players]);

  const playerPoolGroupMap = useMemo(() => {
    const map = new Map();
    for (const player of players) {
      const parsed = parsePoolMeta(player.poolId);
      if (parsed.groupId) {
        map.set(player.id, parsed.groupId);
      }
    }
    return map;
  }, [players]);

  const allPoolIds = useMemo(() => {
    return collectPoolIds(players, schedule.pools, schedule.matches);
  }, [players, schedule.matches, schedule.pools]);

  const poolHueMap = useMemo(() => {
    const map = new Map();
    const count = allPoolIds.length;
    if (count === 0) {
      return map;
    }
    const step = 360 / count;
    allPoolIds.forEach((id, index) => {
      map.set(id, Math.round(index * step));
    });
    return map;
  }, [allPoolIds]);

  const targetPoolId = String(poolId ?? '').trim().toUpperCase();
  const isRotationMode = !targetPoolId && String(searchParams.get('mode') ?? '').toLowerCase() === 'rotation';

  useEffect(() => {
    if (!isRotationMode || allPoolIds.length <= 4) {
      setRotationPhase(0);
      setLastRotationAt(Date.now());
      setRotationRemainingMs(ROTATION_SWITCH_INTERVAL_MS);
      return undefined;
    }
    setLastRotationAt(Date.now());
    setRotationRemainingMs(ROTATION_SWITCH_INTERVAL_MS);
    const timer = setInterval(() => {
      const now = Date.now();
      setRotationPhase((prev) => (prev === 0 ? 1 : 0));
      setLastRotationAt(now);
      setRotationRemainingMs(ROTATION_SWITCH_INTERVAL_MS);
    }, ROTATION_SWITCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [allPoolIds.length, isRotationMode]);

  useEffect(() => {
    if (!isRotationMode || allPoolIds.length <= 4) {
      return undefined;
    }
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastRotationAt;
      const remaining = Math.max(0, ROTATION_SWITCH_INTERVAL_MS - elapsed);
      setRotationRemainingMs(remaining);
    }, 100);
    return () => clearInterval(timer);
  }, [allPoolIds.length, isRotationMode, lastRotationAt]);

  const visiblePoolIds = useMemo(() => {
    if (targetPoolId) {
      return [targetPoolId];
    }
    if (isRotationMode) {
      const firstGroup = allPoolIds.slice(0, 4);
      const secondGroup = allPoolIds.slice(4);
      if (secondGroup.length === 0) {
        return firstGroup;
      }
      return rotationPhase === 0 ? firstGroup : secondGroup;
    }
    return allPoolIds;
  }, [allPoolIds, isRotationMode, rotationPhase, targetPoolId]);

  const allPoolViews = useMemo(() => {
    return allPoolIds.map((id) => ({
      ...buildPoolViewData(id, players, schedule, playerNameMap, playerPoolGroupMap),
      hue: poolHueMap.get(id) ?? 110,
    }));
  }, [allPoolIds, playerNameMap, playerPoolGroupMap, players, poolHueMap, schedule]);

  useEffect(() => {
    const sameIds =
      displayPoolIds.length === visiblePoolIds.length &&
      displayPoolIds.every((id, index) => id === visiblePoolIds[index]);
    if (sameIds) {
      return undefined;
    }
    if (!isRotationMode || displayPoolIds.length === 0) {
      setDisplayPoolIds(visiblePoolIds);
      setIsPoolListFading(false);
      return undefined;
    }
    setIsPoolListFading(true);
    const timer = setTimeout(() => {
      setDisplayPoolIds(visiblePoolIds);
      setIsPoolListFading(false);
    }, ROTATION_FADE_MS);
    return () => clearTimeout(timer);
  }, [displayPoolIds, isRotationMode, visiblePoolIds]);

  const displayPoolViews = useMemo(() => {
    const poolViewMap = new Map(allPoolViews.map((view) => [view.poolId, view]));
    if (displayPoolIds.length === 0) {
      return visiblePoolIds
        .map((id) => poolViewMap.get(id))
        .filter(Boolean);
    }
    return displayPoolIds
      .map((id) => poolViewMap.get(id))
      .filter(Boolean);
  }, [allPoolViews, displayPoolIds, visiblePoolIds]);
  const shouldShowRotationIndicator = isRotationMode && allPoolIds.length > 4;
  const rotationProgress = shouldShowRotationIndicator
    ? Math.min(1, Math.max(0, 1 - rotationRemainingMs / ROTATION_SWITCH_INTERVAL_MS))
    : 0;

  const hasAnyPool = displayPoolViews.some((view) => view.hasTargetPool);
  const notationMode = useMemo(() => getNotationMode(language), [language]);
  const poolViewStyle = eventId
    ? { '--poolBgImage': `url(/data/${encodeURIComponent(eventId)}/assets/bg.jpg)` }
    : undefined;
  const logoSrc =
    eventId != null && eventId !== ''
      ? `/data/${encodeURIComponent(eventId)}/assets/logo.png`
      : null;

  if (loading) {
    return (
      <main className="poolViewPage" style={poolViewStyle}>
        <section className="poolViewSection">
          <p>プール表示を読み込み中...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="poolViewPage" style={poolViewStyle}>
        <section className="poolViewSection">
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`poolViewPage${isRotationMode ? ' isRotationMode' : ''}`} style={poolViewStyle}>
      <section className={`poolViewSection${isRotationMode ? ' isRotationMode' : ''}`}>
        <header className="poolViewHeader">
          {logoSrc ? <img className="poolViewLogo" src={logoSrc} alt="" /> : null}
          {shouldShowRotationIndicator ? (
            <div className="poolRotationIndicator">
              {[0, 1].map((pageIndex) => {
                const fillProgress =
                  pageIndex === rotationPhase
                    ? rotationProgress
                    : rotationPhase === 1 && pageIndex === 0
                      ? 1
                      : 0;
                return (
                  <div
                    key={`rotation-page-${pageIndex}`}
                    className={`poolRotationBarTrack ${
                      pageIndex === rotationPhase ? 'isActive' : ''
                    }`}
                  >
                    <div
                      className="poolRotationBarFill"
                      style={{ transform: `scaleX(${fillProgress})` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </header>

        {!hasAnyPool ? (
          <p className="poolViewEmpty">{targetPoolId ? '指定されたプールが見つかりません。' : '表示できるプールがありません。'}</p>
        ) : (
          <div className={`poolList${isRotationMode ? ' isRotationMode' : ''}${isPoolListFading ? ' isFading' : ''}`}>
            {displayPoolViews.map((view) => {
              if (!view.hasTargetPool) {
                return null;
              }
              return (
                <section
                  key={view.poolId}
                  className="poolListItem"
                  style={{ '--poolHeaderBg': `hsl(${view.hue} 45% 68%)` }}
                >
                  {!targetPoolId && <h2 className="poolListItemTitle">{`プール ${view.poolId}`}</h2>}
                  <div className="poolMatrixWrap">
                    <table className="poolMatrixTable">
                      <thead>
                        <tr>
                          <th className="poolMatrixPoolHeader">{view.poolId}</th>
                          {view.teamRows.map((team) => (
                            <th key={`col-${view.poolId}-${team.id}`} className="poolMatrixTeamHeader">
                              {team.name}
                            </th>
                          ))}
                          <th className="poolMatrixSummaryHeader">勝数</th>
                          <th className="poolMatrixSummaryHeader">得点</th>
                          <th className="poolMatrixSummaryHeader">失点</th>
                          <th className="poolMatrixSummaryHeader">得失点</th>
                          <th className="poolMatrixSummaryHeader">順位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.teamRows.map((rowTeam) => {
                          const rowStats = view.statsMap.get(rowTeam.id);
                          const diff = rowStats.pointsFor - rowStats.pointsAgainst;
                          return (
                            <tr key={`row-${view.poolId}-${rowTeam.id}`}>
                              <th className="poolMatrixRowHeader">{rowTeam.name}</th>
                              {view.teamRows.map((colTeam) => {
                                if (rowTeam.id === colTeam.id) {
                                  return <td key={`${rowTeam.id}:${colTeam.id}`} className="poolMatrixDiagonalCell" />;
                                }
                                const cell = view.cellMap.get(`${rowTeam.id}:${colTeam.id}`) ?? null;
                                const scoreText = cell
                                  ? `${getResultMarker(cell.myScore, cell.oppScore, notationMode, cell.isWinner)} ${cell.myScore} - ${cell.oppScore}`
                                  : '';
                                return (
                                  <td key={`${rowTeam.id}:${colTeam.id}`} className="poolMatrixScoreCell">
                                    {scoreText}
                                  </td>
                                );
                              })}
                              <td className="poolMatrixSummaryCell">{rowStats.wins}</td>
                              <td className="poolMatrixSummaryCell">{rowStats.pointsFor}</td>
                              <td className="poolMatrixSummaryCell">{rowStats.pointsAgainst}</td>
                              <td className="poolMatrixSummaryCell">{diff}</td>
                              <td className="poolMatrixSummaryCell">{view.rankMap.get(rowTeam.id) ?? '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

export default PoolStandings;
