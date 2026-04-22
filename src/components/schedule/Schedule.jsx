import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import './Schedule.css';

const toDateTimeLabel = (isoText) => {
  if (!isoText) {
    return '';
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const toTimeSlotKey = (isoText) => {
  if (!isoText) {
    return '';
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

const toShortMatchId = (matchId) => {
  const raw = String(matchId ?? '').trim();
  if (!raw) {
    return '-';
  }
  const match = raw.match(/(R\d+-(?:M)?\d+)$/i);
  if (match) {
    return match[1].toUpperCase().replace('-M', '-');
  }
  return raw;
};

const toEventDateLabel = (eventDate, eventDayLabel) => {
  if (!eventDate) {
    return '';
  }
  const date = new Date(`${eventDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayText = String(eventDayLabel ?? '').trim();
  if (dayText) {
    return `${y}年${m}月${d}日（${dayText}）`;
  }
  return `${y}年${m}月${d}日`;
};

const renderNameWithLineBreaks = (name) => {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return 'TBD';
  }
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 ? <br /> : null}
    </span>
  ));
};

const isWinnerPlaceholder = (name) => {
  return /^R\d+-\d+\s*勝者$/.test(String(name ?? '').trim());
};

const normalizePlayers = (players) => {
  if (!Array.isArray(players)) {
    return [];
  }
  return players
    .map((player) => ({
      id: String(player.id ?? ''),
      name: String(player.name ?? '').trim(),
    }))
    .filter((player) => player.id && player.name);
};

const Schedule = () => {
  const { id: eventId } = useParams();
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
        setError('');
      } catch (err) {
        setError(err.message || 'スケジュールデータの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
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

  if (loading) {
    return (
      <main className="schedulePage">
        <section className="scheduleSection">
          <p>スケジュールを読み込み中...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="schedulePage">
        <section className="scheduleSection">
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="schedulePage">
      <section className="scheduleSection">
        <h1 className="scheduleTitle">スケジュール表</h1>
        {schedule.eventDate && (
          <p className="scheduleMeta">{`開催日：${toEventDateLabel(schedule.eventDate, schedule.eventDayLabel)}`}</p>
        )}
        {schedule.startTime && <p className="scheduleMeta">{`開始時刻：${schedule.startTime}`}</p>}
        <p className="scheduleMeta">イベントID: {eventId}</p>

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

export default Schedule;
