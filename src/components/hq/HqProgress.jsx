import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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

const statusLabelMap = {
  scheduled: '待機',
  announced: 'アナウンス済み',
  in_progress: '試合中',
  court_approved: 'コート承認済み',
  hq_approved: '本部承認済み',
  reflected: '反映済み',
};

const statusClassMap = {
  scheduled: 'isScheduled',
  announced: 'isAnnounced',
  in_progress: 'isInProgress',
  court_approved: 'isCourtApproved',
  hq_approved: 'isHqApproved',
  reflected: 'isReflected',
};

/**
 * 本部：試合進行（announce / unannounce / start / hq-approve / reflect）
 * URL: /event/:eventId/hq/progress（のちほど認証をかける想定）
 */
const HqProgress = () => {
  const { eventId } = useParams();
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
  const [operationError, setOperationError] = useState('');
  const [operationMessage, setOperationMessage] = useState('');
  const [hqApproverName, setHqApproverName] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState('');
  const [importing, setImporting] = useState(false);

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

  const handleStart = async (match) => {
    await callProgressAction(match, 'start');
  };

  const handleHqApprove = async (match) => {
    const approverName = hqApproverName.trim();
    if (!approverName) {
      setOperationError('本部承認者名を入力してください。');
      return;
    }
    await callProgressAction(match, 'hq-approve', { approverName });
  };

  const handleReflect = async (match) => {
    await callProgressAction(match, 'reflect');
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
          イベントID: {eventId}（のちほど /hq 配下に認証をかける想定）
        </p>
        {schedule.eventDate && (
          <p className="scheduleMeta">{`開催日：${toEventDateLabel(schedule.eventDate, schedule.eventDayLabel)}`}</p>
        )}
        {schedule.startTime && <p className="scheduleMeta">{`開始時刻：${schedule.startTime}`}</p>}

        <div className="hqProgressActionsBar">
          <button
            type="button"
            className="hqProgressActionButton"
            onClick={handleBulkRegister}
            disabled={importing || schedule.matches.length === 0}
          >
            {importing ? '登録中...' : 'SQLiteへ一括登録'}
          </button>
          <label className="hqProgressApproverLabel">
            本部承認者名
            <input
              type="text"
              className="hqProgressApproverInput"
              value={hqApproverName}
              onChange={(event) => setHqApproverName(event.target.value)}
              placeholder="例: 本部A"
            />
          </label>
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
                      const progress = progressMap.get(String(match.matchId));
                      const effectiveStatus = progress?.status || 'scheduled';
                      const statusLabel = statusLabelMap[effectiveStatus] || effectiveStatus;
                      const statusClassName = statusClassMap[effectiveStatus] || 'isScheduled';
                      const canAnnounce = effectiveStatus === 'scheduled';
                      const canUnannounce = effectiveStatus === 'announced';
                      const canStart = effectiveStatus === 'announced';
                      const canHqApprove = effectiveStatus === 'court_approved';
                      const canReflect = effectiveStatus === 'hq_approved';

                      return (
                        <td key={`${slot}-${court}`} className="scheduleCell">
                          <div className="scheduleMatchMain">
                            <p
                              className={`schedulePlayerName ${isWinnerPlaceholder(redName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(redName)}
                            </p>
                            <p className="scheduleVersus">VS</p>
                            <p
                              className={`schedulePlayerName ${isWinnerPlaceholder(blueName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(blueName)}
                            </p>
                          </div>
                          <p className="scheduleMatchSub">{`ID: ${toShortMatchId(match.matchId)}`}</p>
                          <p className={`hqProgressStatus ${statusClassName}`}>{statusLabel}</p>
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
                            <button
                              type="button"
                              className="hqProgressActionButton"
                              onClick={() => handleStart(match)}
                              disabled={!canStart || actionBusyKey !== '' || importing}
                            >
                              開始(start)
                            </button>
                          </div>
                          <div className="hqProgressButtonRow">
                            <button
                              type="button"
                              className="hqProgressActionButton"
                              onClick={() => handleHqApprove(match)}
                              disabled={!canHqApprove || actionBusyKey !== '' || importing}
                            >
                              本部承認(hq)
                            </button>
                            <button
                              type="button"
                              className="hqProgressActionButton"
                              onClick={() => handleReflect(match)}
                              disabled={!canReflect || actionBusyKey !== '' || importing}
                            >
                              反映(reflect)
                            </button>
                          </div>
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
