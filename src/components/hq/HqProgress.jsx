import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../schedule/Schedule.css';
import './HqProgress.css';
import {
  isWinnerPlaceholder,
  normalizePlayers,
  renderNameWithLineBreaks,
  toDateTimeLabel,
  toEventDateLabel,
  toShortMatchId,
  toTimeSlotKey,
} from '../schedule/scheduleDisplayUtils';

// 将来復活できるよう、試合ID表示はトグルで制御する
const SHOW_MATCH_ID = false;

const statusLabelMap = {
  scheduled: '待機',
  announced: 'アナウンス済み',
  in_progress: '試合中',
  match_finished: '試合終了',
  court_approved: 'コート承認済み',
  hq_approved: '本部承認済み',
};

const statusClassMap = {
  scheduled: 'isScheduled',
  announced: 'isAnnounced',
  in_progress: 'isInProgress',
  match_finished: 'isMatchFinished',
  court_approved: 'isCourtApproved',
  hq_approved: 'isHqApproved',
};

const toClockLabel = (isoText) => {
  if (!isoText) return '';
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

/**
 * 本部：試合進行（announce / unannounce / start / hq-approve）
 * URL: /event/:eventId/hq/progress（のちほど認証をかける想定）
 */
const HqProgress = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState({
    courts: [],
    matches: [],
    eventDate: '',
    eventDayLabel: '',
    startTime: '',
  });
  const [players, setPlayers] = useState([]);
  const [progressMap, setProgressMap] = useState(new Map());
  const [courtColorStateMap, setCourtColorStateMap] = useState(new Map());
  const [operationError, setOperationError] = useState('');
  const [operationMessage, setOperationMessage] = useState('');
  const [hqApproverName, setHqApproverName] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState('');
  const [importing, setImporting] = useState(false);
  const mode = useMemo(() => {
    const rawMode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    return rawMode === 'td' ? 'td' : 'operator';
  }, [searchParams]);
  const isTdMode = mode === 'td';
  const isOperatorMode = mode === 'operator';

  useEffect(() => {
    if (!eventId) {
      return;
    }
    if (!searchParams.has('mode')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('mode', 'operator');
      navigate(`/event/${eventId}/hq/progress?${nextParams.toString()}`, { replace: true });
    }
  }, [eventId, navigate, searchParams]);

  const fetchProgress = useCallback(async () => {
    if (!eventId) {
      return;
    }
    const response = await fetch(`/api/progress/${eventId}/matches`);
    if (!response.ok) {
      throw new Error('進行情報の取得に失敗しました。');
    }
    const data = await response.json();
    const nextMap = new Map();
    const matches = Array.isArray(data.matches) ? data.matches : [];
    for (const match of matches) {
      nextMap.set(String(match.matchId), match);
    }
    setProgressMap(nextMap);
  }, [eventId]);

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
          eventDate: String(scheduleJson.eventDate ?? ''),
          eventDayLabel: String(scheduleJson.eventDayLabel ?? ''),
          startTime: String(scheduleJson.startTime ?? ''),
        });
        setPlayers(normalizePlayers(playersJson));
        await fetchProgress();
        setError('');
      } catch (err) {
        setError(err.message || 'スケジュールデータの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [eventId, fetchProgress]);

  useEffect(() => {
    if (!eventId) {
      return undefined;
    }
    const timer = setInterval(() => {
      fetchProgress().catch(() => {
        // 一時的な通信失敗は次周期で再試行する
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [eventId, fetchProgress]);

  useEffect(() => {
    if (!eventId) {
      setCourtColorStateMap(new Map());
      return undefined;
    }

    let cancelled = false;
    const loadCourtColorStates = async () => {
      try {
        const [gamesResponse, standingsResponse] = await Promise.all([
          fetch(`/api/data/${eventId}/results/all-games`),
          fetch(`/api/progress/${eventId}/pool/standings?includeHqApproved=true`),
        ]);
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
            const isFinishedSection = ['matchFinished', 'resultApproval'].includes(section);
            const redScore = Number(game?.red?.score ?? 0);
            const blueScore = Number(game?.blue?.score ?? 0);
            let winnerSide = '';
            if (isFinishedSection) {
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
              isScoreVisible: game?.screen?.isMatchStarted === true || isInMatchSection,
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
            const redPlayerId = String(row?.red_player_id ?? '').trim();
            const bluePlayerId = String(row?.blue_player_id ?? '').trim();
            const winnerPlayerId = String(row?.winner_player_id ?? '').trim();
            let winnerSide = '';
            if (winnerPlayerId && winnerPlayerId === redPlayerId) {
              winnerSide = 'red';
            } else if (winnerPlayerId && winnerPlayerId === bluePlayerId) {
              winnerSide = 'blue';
            } else if (redScore > blueScore) {
              winnerSide = 'red';
            } else if (blueScore > redScore) {
              winnerSide = 'blue';
            }
            nextMap.set(matchID, {
              ...(nextMap.get(matchID) || {}),
              matchID,
              redPlayerId,
              bluePlayerId,
              redScore,
              blueScore,
              winnerSide,
              isScoreVisible: true,
            });
          }
        }
        setCourtColorStateMap(nextMap);
      } catch {
        if (!cancelled) {
          setCourtColorStateMap(new Map());
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

  const callProgressAction = async (match, action, body = null) => {
    if (!eventId || !match?.matchId) {
      return;
    }
    const busyKey = `${match.matchId}:${action}`;
    try {
      setActionBusyKey(busyKey);
      setOperationError('');
      setOperationMessage('');
      const response = await fetch(`/api/progress/${eventId}/matches/${match.matchId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `${action} の実行に失敗しました。`);
      }
      await fetchProgress();
      let message = `${toShortMatchId(match.matchId)} を更新しました。`;
      if (action === 'announce' && data.scoreboardSync && data.scoreboardSync.ok === false) {
        message += ` スコアボード用ファイルの書き込みに失敗: ${data.scoreboardSync.error || '不明'}`;
      }
      if (action === 'unannounce' && data.scoreboardSync && data.scoreboardSync.ok === false) {
        message += ` スコアボード用ファイルの書き込みに失敗: ${data.scoreboardSync.error || '不明'}`;
      }
      setOperationMessage(message);
    } catch (err) {
      setOperationError(err.message || '更新に失敗しました。');
    } finally {
      setActionBusyKey('');
    }
  };

  const handleAnnounce = async (match) => {
    await callProgressAction(match, 'announce', {
      courtId: String(match.courtId ?? ''),
      redPlayerId: String(match.redPlayerId ?? ''),
      bluePlayerId: String(match.bluePlayerId ?? ''),
      scheduledAt: String(match.scheduledStart ?? ''),
    });
  };

  const handleUnannounce = async (match) => {
    const confirmed = window.confirm(
      '配信を取り消し、待機状態に戻しますか？\n' +
        'コートの選手表示名は Red / Blue に戻します。\n' +
        '※試合開始後（in_progress 以降）は取り消せません。',
    );
    if (!confirmed) {
      return;
    }
    await callProgressAction(match, 'unannounce');
  };

  const handleHqApprove = async (match) => {
    const approverName = hqApproverName.trim();
    if (!approverName) {
      setOperationError('本部承認者名を入力してください。');
      return;
    }
    await callProgressAction(match, 'hq-approve', { approverName });
  };

  const handleBulkRegister = async () => {
    if (!eventId) {
      return;
    }
    try {
      setImporting(true);
      setOperationError('');
      setOperationMessage('');
      let registeredCount = 0;
      for (const match of schedule.matches) {
        const redPlayerId = String(match.redPlayerId ?? '').trim();
        const bluePlayerId = String(match.bluePlayerId ?? '').trim();
        if (!match.matchId || !match.courtId || !redPlayerId || !bluePlayerId) {
          continue;
        }
        const response = await fetch(`/api/progress/${eventId}/matches/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId: String(match.matchId),
            courtId: String(match.courtId),
            redPlayerId,
            bluePlayerId,
            scheduledAt: String(match.scheduledStart ?? ''),
          }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `registerに失敗: ${match.matchId}`);
        }
        registeredCount += 1;
      }
      await fetchProgress();
      setOperationMessage(`SQLiteへ ${registeredCount} 試合を登録しました。`);
    } catch (err) {
      setOperationError(err.message || '一括登録に失敗しました。');
    } finally {
      setImporting(false);
    }
  };

  const handleResetAll = async () => {
    if (!eventId) {
      return;
    }
    const confirmed = window.confirm(
      '全コートのスコアボードと本部進行を初期状態に戻します。\n' +
        '（再テスト用: 配信状態・進行状態・試合中データをクリア）\n\n' +
        '実行してよろしいですか？',
    );
    if (!confirmed) {
      return;
    }
    try {
      setActionBusyKey('reset-all');
      setOperationError('');
      setOperationMessage('');
      const response = await fetch(`/api/progress/${eventId}/reset-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '全体リセットに失敗しました。');
      }
      await fetchProgress();
      const settingsCount = Number(data?.fileResetSummary?.updatedSettings ?? 0);
      const gamesCount = Number(data?.fileResetSummary?.updatedGames ?? 0);
      setOperationMessage(
        `全体リセット完了（settings: ${settingsCount}件 / game: ${gamesCount}件）。`,
      );
    } catch (err) {
      setOperationError(err.message || '全体リセットに失敗しました。');
    } finally {
      setActionBusyKey('');
    }
  };

  if (loading) {
    return (
      <main className="hqProgressPage">
        <section className="hqProgressSection">
          <p>読み込み中...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="hqProgressPage">
        <section className="hqProgressSection">
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="hqProgressPage">
      <section className="hqProgressSection">
        <h1 className="hqProgressTitle">本部・試合進行</h1>
        <p className="hqProgressSubtitle">
          イベントID: {eventId} / 操作モード: {isTdMode ? 'TD' : 'オペレーター'}
        </p>
        {schedule.eventDate && (
          <p className="scheduleMeta">{`開催日：${toEventDateLabel(schedule.eventDate, schedule.eventDayLabel)}`}</p>
        )}
        {schedule.startTime && <p className="scheduleMeta">{`開始時刻：${schedule.startTime}`}</p>}

        <div className="hqProgressActionsBar">
          {isOperatorMode && (
            <>
              <button
                type="button"
                className="hqProgressActionButton"
                onClick={handleBulkRegister}
                disabled={importing || schedule.matches.length === 0}
              >
                {importing ? '登録中...' : 'SQLiteへ一括登録'}
              </button>
              <button
                type="button"
                className="hqProgressActionButton"
                onClick={handleResetAll}
                disabled={actionBusyKey !== '' || importing}
              >
                全コート初期化（再テスト）
              </button>
            </>
          )}
          {isTdMode && (
            <label className="hqProgressApproverLabel">
              本部承認者名
              <input
                type="text"
                className="hqProgressApproverInput"
                value={hqApproverName}
                onChange={(event) => setHqApproverName(event.target.value)}
                placeholder="例: TD"
              />
            </label>
          )}
        </div>
        {operationMessage ? <p className="hqProgressOperationMessage">{operationMessage}</p> : null}
        {operationError ? <p className="hqProgressOperationError">{operationError}</p> : null}

        {schedule.matches.length === 0 ? (
          <p className="scheduleEmpty">現在、登録されている試合予定はありません。</p>
        ) : (
          <div className="scheduleTableWrap">
            <table className="scheduleTable">
              <thead>
                <tr>
                  <th className="scheduleHeaderCell">時間</th>
                  {schedule.courts.map((court) => (
                    <th key={court} className="scheduleHeaderCell">{`コート${court}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={slot}>
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
                      const isColorConfirmed = colorState?.isColorSet === true;
                      const displayRedName = isColorConfirmed
                        ? playerNameMap.get(String(colorState?.redPlayerId ?? '')) || redName
                        : redName;
                      const displayBlueName = isColorConfirmed
                        ? playerNameMap.get(String(colorState?.bluePlayerId ?? '')) || blueName
                        : blueName;
                      const scoreLabel = colorState?.isScoreVisible
                        ? `${colorState?.redScore ?? 0} - ${colorState?.blueScore ?? 0}`
                        : '-';
                      const isRedWinner = colorState?.winnerSide === 'red';
                      const isBlueWinner = colorState?.winnerSide === 'blue';
                      const progress = progressMap.get(String(match.matchId));
                      const rawStatus = progress?.status || 'scheduled';
                      const displayStatus =
                        progress?.finishedAt &&
                        (rawStatus === 'announced' || rawStatus === 'in_progress')
                          ? 'match_finished'
                          : rawStatus;
                      const statusLabel = statusLabelMap[displayStatus] || displayStatus;
                      const statusClassName = statusClassMap[displayStatus] || 'isScheduled';
                      const effectiveStatus = rawStatus;
                      const canAnnounce = effectiveStatus === 'scheduled';
                      const canUnannounce = effectiveStatus === 'announced';
                      const canHqApprove = effectiveStatus === 'court_approved';
                      const warmupStartedLabel = toClockLabel(progress?.warmupStartedAt);
                      const warmupFinishedLabel = toClockLabel(progress?.warmupFinishedAt);
                      const startedLabel = toClockLabel(progress?.startedAt);
                      const finishedLabel = toClockLabel(progress?.finishedAt);

                      return (
                        <td key={`${slot}-${court}`} className="scheduleCell">
                          <div className="scheduleMatchMain">
                            <p
                              className={`schedulePlayerName ${isColorConfirmed ? 'isRedConfirmed' : ''} ${isWinnerPlaceholder(displayRedName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(displayRedName)}
                            </p>
                            <p className="scheduleVersus">VS</p>
                            <p
                              className={`schedulePlayerName ${isColorConfirmed ? 'isBlueConfirmed' : ''} ${isWinnerPlaceholder(displayBlueName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(displayBlueName)}
                            </p>
                          </div>
                          <p className="scheduleLiveScore">
                            {colorState?.isScoreVisible ? (
                              <>
                                <span className={`scheduleLiveScoreValue ${isRedWinner ? 'isWinner' : ''}`}>
                                  {colorState?.redScore ?? 0}
                                </span>
                                <span className="scheduleLiveScoreDash"> - </span>
                                <span className={`scheduleLiveScoreValue ${isBlueWinner ? 'isWinner' : ''}`}>
                                  {colorState?.blueScore ?? 0}
                                </span>
                              </>
                            ) : (
                              scoreLabel
                            )}
                          </p>
                          {SHOW_MATCH_ID && (
                            <p className="scheduleMatchSub">{`ID: ${toShortMatchId(match.matchId)}`}</p>
                          )}
                          <p className={`hqProgressStatus ${statusClassName}`}>{statusLabel}</p>
                          <div className="hqProgressTimeline">
                            <p className={`hqProgressTimelineItem ${warmupStartedLabel ? 'isDone' : ''}`}>
                              {warmupStartedLabel ? `WU開始 ${warmupStartedLabel}` : 'WU開始 -'}
                            </p>
                            <p className={`hqProgressTimelineItem ${warmupFinishedLabel ? 'isDone' : ''}`}>
                              {warmupFinishedLabel ? `WU終了 ${warmupFinishedLabel}` : 'WU終了 -'}
                            </p>
                            <p className={`hqProgressTimelineItem ${startedLabel ? 'isDone' : ''}`}>
                              {startedLabel ? `試合開始 ${startedLabel}` : '試合開始 -'}
                            </p>
                            <p className={`hqProgressTimelineItem ${finishedLabel ? 'isDone' : ''}`}>
                              {finishedLabel ? `試合終了 ${finishedLabel}` : '試合終了 -'}
                            </p>
                          </div>
                          {isOperatorMode && (
                            <>
                              <div className="hqProgressButtonRow">
                                <button
                                  type="button"
                                  className="hqProgressActionButton"
                                  onClick={() => handleAnnounce(match)}
                                  disabled={!canAnnounce || actionBusyKey !== '' || importing}
                                >
                                  配信(announce)
                                </button>
                                <button
                                  type="button"
                                  className="hqProgressActionButton"
                                  onClick={() => handleUnannounce(match)}
                                  disabled={!canUnannounce || actionBusyKey !== '' || importing}
                                >
                                  配信取り消し
                                </button>
                              </div>
                              <div className="hqProgressButtonRow">
                                <p className="scheduleMatchSub">TD承認待ち/承認済みはTD画面で操作します。</p>
                              </div>
                            </>
                          )}
                          {isTdMode && (
                            <div className="hqProgressButtonRow">
                              <button
                                type="button"
                                className="hqProgressActionButton"
                                onClick={() => handleHqApprove(match)}
                                disabled={!canHqApprove || actionBusyKey !== '' || importing}
                              >
                                本部承認(hq)
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

export default HqProgress;
