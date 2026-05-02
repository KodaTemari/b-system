import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  buildPoolHueMap,
  collectPoolIds,
  poolStandingsHeaderHsl,
  SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
  SCHEDULE_POOL_SURFACE_ALPHA,
} from '../../utils/schedulePoolIds';
import './Schedule.css';
import {
  buildPoolLetterByCourtMap,
  extractPoolLetterFromMatch,
  getScheduleDisplayProgressStatus,
  getScheduleLeftIsCourtRed,
  getScheduleRowPhase,
  isTieBreakScoreSingleDigit,
  isWinnerPlaceholder,
  normalizePlayers,
  toDateTimeLabel,
  toEventDateLabel,
  toShortMatchId,
  toTimeSlotKey,
} from './scheduleDisplayUtils';

// 将来復活できるよう、試合ID表示はトグルで制御する
const SHOW_MATCH_ID = false;

/**
 * 掲示用スケジュール表（選手・観客向け）
 * URL: /event/:id/schedule
 */
const Schedule = () => {
  const { id: eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState({
    courts: [],
    matches: [],
    pools: [],
    eventDate: '',
    eventDayLabel: '',
    startTime: '',
  });
  const [players, setPlayers] = useState([]);
  const [courtColorStateMap, setCourtColorStateMap] = useState(new Map());
  const [matchProgressInfoMap, setMatchProgressInfoMap] = useState(new Map());

  useEffect(() => {
    const loadData = async () => {
      if (!eventId) {
        setError('eventId が指定されていません。');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const rootScheduleRes = await fetch(`/data/${eventId}/schedule.json`);
        const rootScheduleJson = rootScheduleRes.ok ? await rootScheduleRes.json() : null;
        const isScheduleV2 = (json) =>
          Boolean(json && !Array.isArray(json) && Array.isArray(json.matches) && Array.isArray(json.courts));
        const scheduleJson = isScheduleV2(rootScheduleJson) ? rootScheduleJson : null;
        if (!scheduleJson) throw new Error('schedule.json の読み込みに失敗しました。');

        const playerClassCode = String(scheduleJson.classCode ?? 'FRD');
        const playersRes = await fetch(`/data/${eventId}/classes/${playerClassCode}/player.json`);
        const playersJson = playersRes.ok ? await playersRes.json() : [];

        setSchedule({
          courts: Array.isArray(scheduleJson.courts) ? scheduleJson.courts.map((court) => String(court)) : [],
          matches: Array.isArray(scheduleJson.matches) ? scheduleJson.matches : [],
          pools: Array.isArray(scheduleJson.pools) ? scheduleJson.pools : [],
          eventDate: String(scheduleJson.eventDate ?? ''),
          eventDayLabel: String(scheduleJson.eventDayLabel ?? ''),
          startTime: String(scheduleJson.startTime ?? ''),
        });
        setPlayers(normalizePlayers(playersJson));
        setError('');
      } catch (err) {
        setError(err.message || 'スケジュールデータの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [eventId]);

  useEffect(() => {
    if (!eventId) {
      setCourtColorStateMap(new Map());
      setMatchProgressInfoMap(new Map());
      return undefined;
    }

    let cancelled = false;
    const loadCourtColorStates = async () => {
      try {
        const [gamesResponse, standingsResponse, progressMatchesResponse, scheduleOverlayResponse] =
          await Promise.all([
            fetch(`/api/data/${eventId}/results/all-games`),
            fetch(`/api/progress/${eventId}/pool/standings?includeHqApproved=true`),
            fetch(`/api/progress/${eventId}/matches`),
            fetch(`/api/progress/${eventId}/schedule-overlay-scores`),
          ]);

        if (progressMatchesResponse.ok) {
          const progressPayload = await progressMatchesResponse.json();
          const rows = Array.isArray(progressPayload?.matches) ? progressPayload.matches : [];
          const nextInfoMap = new Map();
          for (const row of rows) {
            const id = String(row?.matchId ?? '').trim();
            if (!id) continue;
            const finishedAt =
              row?.finishedAt != null && row?.finishedAt !== ''
                ? String(row.finishedAt)
                : row?.finished_at != null && row?.finished_at !== ''
                  ? String(row.finished_at)
                  : null;
            nextInfoMap.set(id, {
              status: String(row?.status ?? 'scheduled'),
              finishedAt,
            });
          }
          if (!cancelled) {
            setMatchProgressInfoMap(nextInfoMap);
          }
        }

        if (!gamesResponse.ok) {
          return;
        }
        const payload = await gamesResponse.json();
        const games = Array.isArray(payload?.games) ? payload.games : [];
        const responses = games.map((entry) => {
          const game = entry?.game ?? {};
            const matchID = String(game?.matchID ?? '').trim();
            if (!matchID) {
              return null;
            }
            const section = String(game?.match?.section ?? '').trim();
            const isInMatchSection =
              /^end\d+$/i.test(section) ||
              ['interval', 'tieBreak', 'finalShot', 'matchFinished', 'resultApproval'].includes(section);
            const redScore = Number(game?.red?.score ?? 0);
            const blueScore = Number(game?.blue?.score ?? 0);
            const isScoreVisible = game?.screen?.isMatchStarted === true || isInMatchSection;
            let winnerSide = '';
            if (isScoreVisible) {
              if (redScore > blueScore) {
                winnerSide = 'red';
              } else if (blueScore > redScore) {
                winnerSide = 'blue';
              } else if (game?.red?.isTieBreak === true) {
                winnerSide = 'red';
              } else if (game?.blue?.isTieBreak === true) {
                winnerSide = 'blue';
              }
            }
            return {
              matchID,
              isColorSet: game?.screen?.isColorSet === true,
              redPlayerId: String(game?.red?.playerID ?? '').trim(),
              bluePlayerId: String(game?.blue?.playerID ?? '').trim(),
              redScore,
              blueScore,
              isScoreVisible,
              winnerSide,
            };
          });
        if (cancelled) {
          return;
        }
        const nextMap = new Map();
        for (const entry of responses) {
          if (!entry) continue;
          nextMap.set(entry.matchID, entry);
        }
        if (standingsResponse.ok) {
          const standingsPayload = await standingsResponse.json();
          const rows = Array.isArray(standingsPayload?.matches) ? standingsPayload.matches : [];
          for (const row of rows) {
            const matchID = String(row?.match_id ?? '').trim();
            if (!matchID) continue;
            const redScore = Number(row?.red_score);
            const blueScore = Number(row?.blue_score);
            if (!Number.isFinite(redScore) || !Number.isFinite(blueScore)) continue;
            const prev = nextMap.get(matchID) || {};
            const rowRedPlayerId = String(row?.red_player_id ?? '').trim();
            const rowBluePlayerId = String(row?.blue_player_id ?? '').trim();
            const winnerPlayerId = String(row?.winner_player_id ?? '').trim();
            // game.json の red/blue はコートの実際の赤・青。pool/standings の *_player_id はスケジュール左・右のことがあり、上書きすると得点マッピングが逆転する。
            const courtRedId = String(prev.redPlayerId ?? '').trim();
            const courtBlueId = String(prev.bluePlayerId ?? '').trim();
            const hasCourtIdsFromGame = Boolean(courtRedId && courtBlueId);
            const idRedForWinner = hasCourtIdsFromGame ? courtRedId : rowRedPlayerId;
            const idBlueForWinner = hasCourtIdsFromGame ? courtBlueId : rowBluePlayerId;
            let winnerSide = '';
            if (winnerPlayerId && winnerPlayerId === idRedForWinner) {
              winnerSide = 'red';
            } else if (winnerPlayerId && winnerPlayerId === idBlueForWinner) {
              winnerSide = 'blue';
            } else if (redScore > blueScore) {
              winnerSide = 'red';
            } else if (blueScore > redScore) {
              winnerSide = 'blue';
            }
            nextMap.set(matchID, {
              ...prev,
              matchID,
              redScore,
              blueScore,
              winnerSide,
              isScoreVisible: true,
              // pool/standings は hq_approved / reflected のみのため、この経路のスコアは確定扱い
              scheduleResultFinal: true,
              ...(hasCourtIdsFromGame ? {} : { redPlayerId: rowRedPlayerId, bluePlayerId: rowBluePlayerId }),
            });
          }
        }

        // コート game.json にまだ載っていない・standings にも出ない暫定結果（試合中など）を DB から補完
        if (scheduleOverlayResponse.ok) {
          const overlayPayload = await scheduleOverlayResponse.json();
          const overlayRows = Array.isArray(overlayPayload?.matches)
            ? overlayPayload.matches
            : [];
          for (const row of overlayRows) {
            const matchID = String(row?.match_id ?? '').trim();
            if (!matchID) continue;
            const redScore = Number(row?.red_score);
            const blueScore = Number(row?.blue_score);
            if (!Number.isFinite(redScore) || !Number.isFinite(blueScore)) continue;
            const prev = nextMap.get(matchID);
            if (prev?.isScoreVisible) {
              continue;
            }
            const rowRedPlayerId = String(row?.red_player_id ?? '').trim();
            const rowBluePlayerId = String(row?.blue_player_id ?? '').trim();
            const winnerPlayerId = String(row?.winner_player_id ?? '').trim();
            const courtRedId = String(prev?.redPlayerId ?? '').trim();
            const courtBlueId = String(prev?.bluePlayerId ?? '').trim();
            const hasCourtIdsFromGame = Boolean(courtRedId && courtBlueId);
            const idRedForWinner = hasCourtIdsFromGame ? courtRedId : rowRedPlayerId;
            const idBlueForWinner = hasCourtIdsFromGame ? courtBlueId : rowBluePlayerId;
            let winnerSide = '';
            if (winnerPlayerId && winnerPlayerId === idRedForWinner) {
              winnerSide = 'red';
            } else if (winnerPlayerId && winnerPlayerId === idBlueForWinner) {
              winnerSide = 'blue';
            } else if (redScore > blueScore) {
              winnerSide = 'red';
            } else if (blueScore > redScore) {
              winnerSide = 'blue';
            }
            nextMap.set(matchID, {
              ...(prev || {}),
              matchID,
              redScore,
              blueScore,
              winnerSide,
              isScoreVisible: true,
              ...(hasCourtIdsFromGame ? {} : { redPlayerId: rowRedPlayerId, bluePlayerId: rowBluePlayerId }),
            });
          }
        }

        setCourtColorStateMap(nextMap);
      } catch {
        if (!cancelled) {
          setCourtColorStateMap(new Map());
          setMatchProgressInfoMap(new Map());
        }
      }
    };

    loadCourtColorStates();
    const timer = setInterval(loadCourtColorStates, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventId]);

  const playerNameMap = useMemo(() => {
    return new Map(players.map((player) => [player.id, player.name]));
  }, [players]);

  const timeSlots = useMemo(() => {
    const keys = new Set();
    for (const match of schedule.matches) {
      const key = toTimeSlotKey(match.scheduledStart);
      if (key) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [schedule.matches]);

  const matrix = useMemo(() => {
    const slotMap = new Map();
    for (const slot of timeSlots) {
      slotMap.set(slot, new Map());
    }
    for (const match of schedule.matches) {
      const slot = toTimeSlotKey(match.scheduledStart);
      const court = String(match.courtId ?? '');
      if (!slotMap.has(slot) || !court) {
        continue;
      }
      slotMap.get(slot).set(court, match);
    }
    return slotMap;
  }, [schedule.matches, timeSlots]);

  const poolLetterByCourt = useMemo(
    () => buildPoolLetterByCourtMap(schedule.matches, schedule.courts),
    [schedule.matches, schedule.courts],
  );

  const poolHueByPoolId = useMemo(() => {
    const ids = collectPoolIds(players, schedule.pools, schedule.matches);
    return buildPoolHueMap(ids);
  }, [players, schedule.pools, schedule.matches]);

  const schedulePageStyle = eventId
    ? { '--scheduleBgImage': `url(/data/${encodeURIComponent(eventId)}/assets/bg.jpg)` }
    : undefined;

  const logoSrc =
    eventId != null && eventId !== ''
      ? `/data/${encodeURIComponent(eventId)}/assets/logo.png`
      : null;

  if (loading) {
    return (
      <main className="schedulePage" style={schedulePageStyle}>
        <section className="scheduleSection">
          <header className="scheduleTitleBar">
            {logoSrc ? (
              <img className="scheduleTitleLogo" src={logoSrc} alt="" />
            ) : null}
            <div className="scheduleTitleText">
              <h1 className="scheduleTitle">スケジュール表</h1>
            </div>
          </header>
          <p>スケジュールを読み込み中...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="schedulePage" style={schedulePageStyle}>
        <section className="scheduleSection">
          <header className="scheduleTitleBar">
            {logoSrc ? (
              <img className="scheduleTitleLogo" src={logoSrc} alt="" />
            ) : null}
            <div className="scheduleTitleText">
              <h1 className="scheduleTitle">スケジュール表</h1>
            </div>
          </header>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="schedulePage" style={schedulePageStyle}>
      <section className="scheduleSection">
        <header className="scheduleTitleBar">
          {logoSrc ? <img className="scheduleTitleLogo" src={logoSrc} alt="" /> : null}
          <div className="scheduleTitleText">
            <h1 className="scheduleTitle">スケジュール表</h1>
            {schedule.eventDate ? (
              <p className="scheduleMeta">{`開催日：${toEventDateLabel(schedule.eventDate, schedule.eventDayLabel)}`}</p>
            ) : null}
          </div>
        </header>

        {schedule.matches.length === 0 ? (
          <p className="scheduleEmpty">現在、登録されている試合予定はありません。</p>
        ) : (
          <div className="scheduleTableWrap">
            <table className="scheduleTable">
              <tbody>
                {timeSlots.flatMap((slot, index) => {
                  const matchesInRow = schedule.courts
                    .map((court) => matrix.get(slot)?.get(court))
                    .filter(Boolean);
                  const rowPhase = getScheduleRowPhase(
                    slot,
                    timeSlots,
                    matchesInRow,
                    matchProgressInfoMap,
                  );
                  const rowPhaseClass =
                    rowPhase === 'past'
                      ? 'isRowPast'
                      : rowPhase === 'upcoming'
                        ? 'isRowUpcoming'
                        : 'isRowCurrent';
                  const prevSlot = index > 0 ? timeSlots[index - 1] : null;
                  const prevMatches = prevSlot
                    ? schedule.courts.map((court) => matrix.get(prevSlot)?.get(court)).filter(Boolean)
                    : [];
                  const prevRowPhase = prevSlot
                    ? getScheduleRowPhase(prevSlot, timeSlots, prevMatches, matchProgressInfoMap)
                    : '';
                  // 先頭が終了済みブロックの場合、最上部にヘッダーを出さない
                  const shouldInsertHeaderAtTop = index === 0 && rowPhase !== 'past';
                  const shouldInsertHeaderAboveCurrent =
                    rowPhase === 'current' && prevRowPhase !== 'current' && index !== 0;

                  const rows = [];
                  if (shouldInsertHeaderAtTop || shouldInsertHeaderAboveCurrent) {
                    rows.push(
                      <tr key={`header-${slot}`} className="scheduleInlineHeaderRow">
                        <th className="scheduleHeaderCell">時間</th>
                        {schedule.courts.map((court) => {
                          const poolId = poolLetterByCourt.get(String(court));
                          const hue = poolId ? poolHueByPoolId.get(poolId) : undefined;
                          const headerBgStyle =
                            hue != null
                              ? { background: poolStandingsHeaderHsl(hue, SCHEDULE_POOL_SURFACE_ALPHA) }
                              : undefined;
                          return (
                            <th
                              key={`header-${slot}-${court}`}
                              className="scheduleHeaderCell"
                              style={headerBgStyle}
                            >{`コート${court}`}</th>
                          );
                        })}
                      </tr>,
                    );
                  }
                  rows.push(
                  <tr key={slot} className={`scheduleRow ${rowPhaseClass}`}>
                    <th className="scheduleTimeCell">{toDateTimeLabel(slot)}</th>
                    {schedule.courts.map((court) => {
                      const match = matrix.get(slot)?.get(court);
                      if (!match) {
                        return <td key={`${slot}-${court}`} className="scheduleCell isEmptyCell">-</td>;
                      }
                      const redName =
                        playerNameMap.get(String(match.redPlayerId ?? '')) ??
                        String(match.redPlayerName ?? match.redPlayerId ?? 'TBD');
                      const blueName =
                        playerNameMap.get(String(match.bluePlayerId ?? '')) ??
                        String(match.bluePlayerName ?? match.bluePlayerId ?? 'TBD');
                      const colorState = courtColorStateMap.get(String(match.matchId ?? ''));
                      const progressInfo = matchProgressInfoMap.get(String(match.matchId ?? ''));
                      const rawProgressStatus = String(progressInfo?.status ?? 'scheduled');
                      /** 赤青下線はコートで色確定（screen.isColorSet）後のみ。配信済みでも未確定なら非表示 */
                      const isColorConfirmed = colorState?.isColorSet === true;
                      const scheduleLeftIsCourtRed = getScheduleLeftIsCourtRed(
                        match,
                        colorState,
                        isColorConfirmed,
                      );
                      const courtRedScore = Number(colorState?.redScore ?? 0);
                      const courtBlueScore = Number(colorState?.blueScore ?? 0);
                      const leftScore = scheduleLeftIsCourtRed ? courtRedScore : courtBlueScore;
                      const rightScore = scheduleLeftIsCourtRed ? courtBlueScore : courtRedScore;
                      const scoreLabel = colorState?.isScoreVisible
                        ? `${leftScore} - ${rightScore}`
                        : '-';
                      const isRedWinner = colorState?.winnerSide === 'red';
                      const isBlueWinner = colorState?.winnerSide === 'blue';
                      const leftWon =
                        (scheduleLeftIsCourtRed && isRedWinner) || (!scheduleLeftIsCourtRed && isBlueWinner);
                      const rightWon =
                        (scheduleLeftIsCourtRed && isBlueWinner) || (!scheduleLeftIsCourtRed && isRedWinner);
                      const displayProgressStatus = getScheduleDisplayProgressStatus(progressInfo);
                      /** 試合開始前は「-」行のみで縦幅を食うため非表示（16:9 一覧性向上） */
                      const showScheduleLiveScore =
                        colorState?.isScoreVisible === true ||
                        !['scheduled', 'announced'].includes(rawProgressStatus);
                      // 本部承認（または反映済み）まで isWinner は付けない。プール表マージは HQ 承認済みデータのみ。
                      const isScheduleWinnerMarked =
                        colorState?.scheduleResultFinal === true ||
                        ['hq_approved', 'reflected'].includes(displayProgressStatus);
                      const showTbTag =
                        colorState?.isScoreVisible === true &&
                        isScheduleWinnerMarked &&
                        (isRedWinner || isBlueWinner) &&
                        Number(colorState?.redScore ?? NaN) === Number(colorState?.blueScore ?? NaN);
                      const shouldHighlightWinnerBorder =
                        colorState?.isScoreVisible === true &&
                        (isRedWinner || isBlueWinner) &&
                        isScheduleWinnerMarked;
                      const leftNameClass = shouldHighlightWinnerBorder
                        ? (leftWon ? 'isWinner' : '')
                        : isColorConfirmed
                          ? scheduleLeftIsCourtRed
                            ? 'isRedConfirmed'
                            : 'isBlueConfirmed'
                          : '';
                      const rightNameClass = shouldHighlightWinnerBorder
                        ? (rightWon ? 'isWinner' : '')
                        : isColorConfirmed
                          ? scheduleLeftIsCourtRed
                            ? 'isBlueConfirmed'
                            : 'isRedConfirmed'
                          : '';
                      const letterForPoolHue =
                        extractPoolLetterFromMatch(match) ?? poolLetterByCourt.get(String(court));
                      const hueForPoolTint = letterForPoolHue
                        ? poolHueByPoolId.get(letterForPoolHue)
                        : undefined;
                      const isMatchInProgress = rawProgressStatus === 'in_progress';
                      const showInProgressPoolTint =
                        isMatchInProgress &&
                        hueForPoolTint != null &&
                        Number.isFinite(hueForPoolTint);
                      const inProgressPoolBgStyle = showInProgressPoolTint
                        ? {
                            background: poolStandingsHeaderHsl(
                              hueForPoolTint,
                              SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
                            ),
                          }
                        : undefined;
                      return (
                        <td key={`${slot}-${court}`} className="scheduleCell" style={inProgressPoolBgStyle}>
                          <div
                            className={`scheduleMatchMain${showScheduleLiveScore ? '' : ' scheduleMatchMain--noScore'}`}
                          >
                            <p
                              className={`schedulePlayerName ${leftNameClass} ${isWinnerPlaceholder(redName) ? 'isPlaceholderName' : ''}`}
                            >
                              {redName}
                            </p>
                            <p className="scheduleVersus">VS</p>
                            <p
                              className={`schedulePlayerName ${rightNameClass} ${isWinnerPlaceholder(blueName) ? 'isPlaceholderName' : ''}`}
                            >
                              {blueName}
                            </p>
                          </div>
                          {showScheduleLiveScore ? (
                            <p className="scheduleLiveScore">
                              {colorState?.isScoreVisible ? (
                                <span className="scheduleLiveScoreCluster">
                                  <span className="scheduleLiveScoreValue">
                                    {showTbTag && leftWon ? (
                                      <span
                                        className={`scheduleScoreCircled${
                                          isTieBreakScoreSingleDigit(leftScore)
                                            ? ' scheduleScoreCircledIsRound'
                                            : ''
                                        }`}
                                      >
                                        {leftScore}
                                      </span>
                                    ) : (
                                      leftScore
                                    )}
                                  </span>
                                  <span className="scheduleLiveScoreDash"> - </span>
                                  <span className="scheduleLiveScoreValue">
                                    {showTbTag && rightWon ? (
                                      <span
                                        className={`scheduleScoreCircled${
                                          isTieBreakScoreSingleDigit(rightScore)
                                            ? ' scheduleScoreCircledIsRound'
                                            : ''
                                        }`}
                                      >
                                        {rightScore}
                                      </span>
                                    ) : (
                                      rightScore
                                    )}
                                  </span>
                                </span>
                              ) : (
                                scoreLabel
                              )}
                            </p>
                          ) : null}
                          {SHOW_MATCH_ID && (
                            <p className="scheduleMatchSub">{`ID: ${toShortMatchId(match.matchId)}`}</p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

export default Schedule;
