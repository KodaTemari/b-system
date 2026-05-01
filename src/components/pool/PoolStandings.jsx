import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getCurrentLanguage } from '../../locales';
import {
  getPoolStandingsShowRanksFromStorage,
  POOL_STANDINGS_SHOW_RANKS_EVENT,
  setPoolStandingsShowRanksInStorage,
} from '../../utils/poolStandingsShowRanksStorage';
import { countRegulationEndsWonFromMatchEnds, sortPoolRowsByBgpRules } from '../../utils/results/bgpPoolRank';
import {
  buildPoolHueMap,
  collectPoolIds,
  parsePoolMeta,
  poolStandingsHeaderHsl,
  POOL_STANDINGS_TOP_LEFT_HEADER_ALPHA,
  SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
  SCHEDULE_POOL_SURFACE_ALPHA,
} from '../../utils/schedulePoolIds';
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

const buildPoolViewData = (poolId, players, schedule, playerNameMap, playerPoolGroupMap, endsWonByMatchId) => {
  const endsMap = endsWonByMatchId instanceof Map ? endsWonByMatchId : new Map();
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
        endsWon: 0,
      },
    ])
  );
  const cellMap = new Map();
  const tieMatches = [];
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
    const matchId = String(match.matchId ?? '').trim();
    const endsRec = matchId && endsMap.has(matchId) ? endsMap.get(matchId) : { redEndsWon: 0, blueEndsWon: 0 };
    const redStats = statsMap.get(redId);
    const blueStats = statsMap.get(blueId);
    redStats.pointsFor += score.red;
    redStats.pointsAgainst += score.blue;
    blueStats.pointsFor += score.blue;
    blueStats.pointsAgainst += score.red;
    redStats.endsWon += endsRec.redEndsWon;
    blueStats.endsWon += endsRec.blueEndsWon;
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
    const winnerId =
      redIsWinner === true ? redId : blueIsWinner === true ? blueId : winnerPlayerId || null;
    tieMatches.push({
      redId,
      blueId,
      redScore: score.red,
      blueScore: score.blue,
      winnerId,
      redEndsWon: endsRec.redEndsWon,
      blueEndsWon: endsRec.blueEndsWon,
    });
  }

  const rankRows = teamRows.map((team) => {
    const stats = statsMap.get(team.id);
    return {
      id: team.id,
      wins: stats.wins,
      pointsFor: stats.pointsFor,
      pointsAgainst: stats.pointsAgainst,
      endsWon: stats.endsWon,
    };
  });
  const rankSorted = sortPoolRowsByBgpRules(rankRows, tieMatches);
  const rankMap = new Map(rankSorted.map((row, index) => [row.id, index + 1]));

  return { poolId, hasTargetPool, teamRows, statsMap, cellMap, rankMap };
};

const PoolStandings = ({ embedInHq = false, showEndsWonColumn = false }) => {
  /** `/event/:id/...` と本部埋め込み `/event/:eventId/hq/progress` の両方 */
  const { id: idParam, eventId: eventIdParam, poolId } = useParams();
  const eventId = idParam ?? eventIdParam ?? '';
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
  const [courtGamesList, setCourtGamesList] = useState([]);

  useEffect(() => {
    if (!eventId) {
      return undefined;
    }
    let cancelled = false;
    const loadCourtGames = async () => {
      try {
        const res = await fetch(`/api/data/${encodeURIComponent(eventId)}/results/all-games`);
        if (!res.ok || cancelled) {
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setCourtGamesList(Array.isArray(data?.games) ? data.games : []);
        }
      } catch {
        if (!cancelled) {
          setCourtGamesList([]);
        }
      }
    };
    loadCourtGames();
    const gamesTimer = setInterval(loadCourtGames, RESULTS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(gamesTimer);
    };
  }, [eventId]);

  const endsWonByMatchId = useMemo(() => {
    const map = new Map();
    for (const entry of courtGamesList) {
      const game = entry?.game ?? {};
      const mid = String(game.matchID ?? '').trim();
      if (!mid) {
        continue;
      }
      const { red, blue } = countRegulationEndsWonFromMatchEnds(game?.match?.ends);
      map.set(mid, { redEndsWon: red, blueEndsWon: blue });
    }
    return map;
  }, [courtGamesList]);

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

  const poolHueMap = useMemo(() => buildPoolHueMap(allPoolIds), [allPoolIds]);

  const targetPoolId = String(poolId ?? '').trim().toUpperCase();
  const isRotationMode = !targetPoolId && String(searchParams.get('mode') ?? '').toLowerCase() === 'rotation';
  /** URL の `showRanks` があれば優先。無ければ localStorage（本部 TD の「会場に順位を掲載」と同期） */
  const showRanksParamOverride = useMemo(() => {
    const raw = searchParams.get('showRanks');
    if (raw == null || String(raw).trim() === '') {
      return null;
    }
    const v = String(raw).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') {
      return true;
    }
    if (v === '0' || v === 'false' || v === 'no') {
      return false;
    }
    return null;
  }, [searchParams]);

  const [globalShowRanks, setGlobalShowRanks] = useState(() => getPoolStandingsShowRanksFromStorage());

  useEffect(() => {
    const sync = () => setGlobalShowRanks(getPoolStandingsShowRanksFromStorage());
    window.addEventListener('storage', sync);
    window.addEventListener(POOL_STANDINGS_SHOW_RANKS_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(POOL_STANDINGS_SHOW_RANKS_EVENT, sync);
    };
  }, []);

  /**
   * 本部埋め込み: 表の順位は常に表示（TD が確認できる）。会場側との連携は localStorage をボタンで更新。
   * 単独表示: URL の showRanks または localStorage。
   */
  const showRanks = embedInHq
    ? true
    : showRanksParamOverride !== null
      ? showRanksParamOverride
      : globalShowRanks;

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
      ...buildPoolViewData(id, players, schedule, playerNameMap, playerPoolGroupMap, endsWonByMatchId),
      hue: poolHueMap.get(id) ?? 110,
    }));
  }, [allPoolIds, endsWonByMatchId, playerNameMap, playerPoolGroupMap, players, poolHueMap, schedule]);

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
    <main
      className={`poolViewPage${isRotationMode ? ' isRotationMode' : ''}${embedInHq ? ' poolViewPage--embedInHq' : ''}${showRanks ? '' : ' isPoolRankHidden'}`}
      style={poolViewStyle}
    >
      <section className={`poolViewSection${isRotationMode ? ' isRotationMode' : ''}`}>
        {!embedInHq ? (
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
        ) : null}

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
                  style={{
                    '--poolHeaderBg': poolStandingsHeaderHsl(
                      view.hue,
                      SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
                    ),
                    '--poolTopLeftHeaderBg': poolStandingsHeaderHsl(
                      view.hue,
                      POOL_STANDINGS_TOP_LEFT_HEADER_ALPHA,
                    ),
                    '--poolTeamHeaderBg': poolStandingsHeaderHsl(
                      view.hue,
                      SCHEDULE_POOL_SURFACE_ALPHA,
                    ),
                  }}
                >
                  <div className="poolMatrixWrap">
                    <table className="poolMatrixTable">
                      <thead>
                        <tr>
                          <th className="poolMatrixPoolHeader">{`プール ${view.poolId}`}</th>
                          {view.teamRows.map((team) => (
                            <th key={`col-${view.poolId}-${team.id}`} className="poolMatrixTeamHeader">
                              {team.name}
                            </th>
                          ))}
                          <th className="poolMatrixSummaryHeader">勝数</th>
                          <th className="poolMatrixSummaryHeader">得点</th>
                          <th className="poolMatrixSummaryHeader">失点</th>
                          <th className="poolMatrixSummaryHeader">得失</th>
                          {showEndsWonColumn ? (
                            <th className="poolMatrixSummaryHeader poolMatrixSummaryHeaderEndsWon">勝エンド</th>
                          ) : null}
                          <th className="poolMatrixSummaryHeader poolMatrixRankHeader">順位</th>
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
                                return (
                                  <td key={`${rowTeam.id}:${colTeam.id}`} className="poolMatrixScoreCell">
                                    {cell ? (
                                      <>
                                        <span className="poolMatrixResultMarker">
                                          {getResultMarker(cell.myScore, cell.oppScore, notationMode, cell.isWinner)}
                                        </span>
                                        <span className="poolMatrixResultScore">{`${cell.myScore} - ${cell.oppScore}`}</span>
                                      </>
                                    ) : (
                                      ''
                                    )}
                                  </td>
                                );
                              })}
                              <td className="poolMatrixSummaryCell">{rowStats.wins}</td>
                              <td className="poolMatrixSummaryCell">{rowStats.pointsFor}</td>
                              <td className="poolMatrixSummaryCell">{rowStats.pointsAgainst}</td>
                              <td className="poolMatrixSummaryCell">{diff}</td>
                              {showEndsWonColumn ? (
                                <td className="poolMatrixSummaryCell">{rowStats.endsWon}</td>
                              ) : null}
                              <td className="poolMatrixSummaryCell poolMatrixRankCell">
                                {view.rankMap.get(rowTeam.id) ?? '-'}
                              </td>
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
        {embedInHq && hasAnyPool ? (
          <div className="poolStandingsHqRankFooter">
            <button
              type="button"
              className={`poolStandingsHqRankButton${
                globalShowRanks ? ' poolStandingsHqRankButton--withdraw' : ' poolStandingsHqRankButton--publish'
              }`}
              aria-pressed={globalShowRanks}
              aria-label={
                globalShowRanks
                  ? '会場のプール表から順位を取り下げます'
                  : '会場のプール表に順位を掲載します'
              }
              onClick={() => setPoolStandingsShowRanksInStorage(!globalShowRanks)}
            >
              {globalShowRanks ? '順位を取り下げる' : '会場に順位を掲載する'}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default PoolStandings;
