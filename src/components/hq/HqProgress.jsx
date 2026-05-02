import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  buildPoolHueMap,
  collectPoolIds,
  poolStandingsHeaderHsl,
  SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
  SCHEDULE_POOL_SURFACE_ALPHA,
} from '../../utils/schedulePoolIds';
import '../schedule/Schedule.css';
import './HqProgress.css';
import {
  buildPoolLetterByCourtMap,
  extractPoolLetterFromMatch,
  getScheduleLeftIsCourtRed,
  getScheduleRowPhase,
  isTieBreakScoreSingleDigit,
  isWinnerPlaceholder,
  normalizePlayers,
  renderNameWithLineBreaks,
  toDateTimeLabel,
  toEventDateLabel,
  toShortMatchId,
  toTimeSlotKey,
} from '../schedule/scheduleDisplayUtils';

const PoolStandings = lazy(() => import('../pool/PoolStandings'));
const PlayerList = lazy(() => import('../players/PlayerList'));

// 将来復活できるよう、試合ID表示はトグルで制御する
const SHOW_MATCH_ID = false;

const statusLabelMap = {
  scheduled: '待機',
  announced: '配信済み',
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
  }).format(date);
};

const toCurrentTimeLabel = () =>
  new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

const toPoolRoundLabel = (match) => {
  if (!match || typeof match !== 'object') {
    return '';
  }
  const poolLetter = extractPoolLetterFromMatch(match);
  if (!poolLetter) {
    return '';
  }
  const explicitRound = Number(match.round);
  if (Number.isFinite(explicitRound) && explicitRound > 0) {
    return `${poolLetter}${explicitRound}`;
  }
  const id = String(match.matchId ?? '').trim();
  const tailRound = id.match(/-(\d{1,2})$/);
  if (tailRound) {
    const n = Number(tailRound[1]);
    if (Number.isFinite(n) && n > 0) {
      return `${poolLetter}${n}`;
    }
  }
  return poolLetter;
};

/** 同一スロットの全コートのうち、進行が待機（scheduled）の試合 */
const getAnnounceableMatchesForSlot = (slot, courts, slotMatrix, progMap) =>
  courts
    .map((court) => slotMatrix.get(slot)?.get(court))
    .filter(Boolean)
    .filter((match) => {
      const raw = String(progMap.get(String(match.matchId))?.status ?? 'scheduled');
      return raw === 'scheduled';
    });

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
  const [showApproverModal, setShowApproverModal] = useState(false);
  const [approverNameDraft, setApproverNameDraft] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState('');
  const [importing, setImporting] = useState(false);
  /** 本部ヘッダー中央タブ: 選手一覧 / 試合進行 / プール表 */
  const [hqMainView, setHqMainView] = useState('schedule');
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

  useEffect(() => {
    if (!isTdMode) {
      setShowApproverModal(false);
      return;
    }
    if (!hqApproverName.trim()) {
      setApproverNameDraft('');
      setShowApproverModal(true);
    }
  }, [isTdMode, hqApproverName]);

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
          pools: Array.isArray(scheduleJson.pools) ? scheduleJson.pools : [],
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
          fetch(`/api/progress/${eventId}/pool/standings`),
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
            const prev = nextMap.get(matchID) || {};
            const rowRedPlayerId = String(row?.red_player_id ?? '').trim();
            const rowBluePlayerId = String(row?.blue_player_id ?? '').trim();
            const winnerPlayerId = String(row?.winner_player_id ?? '').trim();
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
              ...(hasCourtIdsFromGame ? {} : { redPlayerId: rowRedPlayerId, bluePlayerId: rowBluePlayerId }),
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

  /** 同一スロット内の全試合が本部承認済み（reflected 含む） */
  const slotHqCompleteMap = useMemo(() => {
    const done = new Set(['hq_approved', 'reflected']);
    const map = new Map();
    for (const slot of timeSlots) {
      let hasAny = false;
      let allHqDone = true;
      for (const court of schedule.courts) {
        const match = matrix.get(slot)?.get(court);
        if (!match) {
          continue;
        }
        hasAny = true;
        const st = String(progressMap.get(String(match.matchId))?.status ?? 'scheduled');
        if (!done.has(st)) {
          allHqDone = false;
          break;
        }
      }
      map.set(slot, hasAny && allHqDone);
    }
    return map;
  }, [timeSlots, schedule.courts, matrix, progressMap]);

  const poolLetterByCourt = useMemo(
    () => buildPoolLetterByCourtMap(schedule.matches, schedule.courts),
    [schedule.matches, schedule.courts],
  );

  const poolHueByPoolId = useMemo(() => {
    const ids = collectPoolIds(players, schedule.pools, schedule.matches);
    return buildPoolHueMap(ids);
  }, [players, schedule.pools, schedule.matches]);

  const logoSrc =
    eventId != null && eventId !== ''
      ? `/data/${encodeURIComponent(eventId)}/assets/logo.png`
      : null;

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

  const handleBulkAnnounceForSlot = async (slot) => {
    const targets = getAnnounceableMatchesForSlot(slot, schedule.courts, matrix, progressMap);
    for (const m of targets) {
      await callProgressAction(m, 'announce', {
        courtId: String(m.courtId ?? ''),
        redPlayerId: String(m.redPlayerId ?? ''),
        bluePlayerId: String(m.bluePlayerId ?? ''),
        scheduledAt: String(m.scheduledStart ?? ''),
      });
    }
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
      setShowApproverModal(true);
      return;
    }
    await callProgressAction(match, 'hq-approve', { approverName });
  };

  const handleApproverModalSubmit = () => {
    const nextName = approverNameDraft.trim();
    if (!nextName) {
      setOperationError('本部承認者名を入力してください。');
      return;
    }
    setHqApproverName(nextName);
    setOperationError('');
    setShowApproverModal(false);
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
        <header className="scheduleTitleBar hqProgressTitleBar">
          <div className="hqProgressTitleBarLead">
            {logoSrc ? <img className="scheduleTitleLogo" src={logoSrc} alt="" /> : null}
          </div>
          <div className="hqProgressTitleBarTabs" role="tablist" aria-label="表示の切替">
            <button
              type="button"
              role="tab"
              aria-selected={hqMainView === 'players'}
              className={`hqProgressViewTab${hqMainView === 'players' ? ' isActive' : ''}`}
              onClick={() => setHqMainView('players')}
            >
              選手一覧
            </button>
            <span className="hqProgressTitleTabSep" aria-hidden>
              ｜
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={hqMainView === 'schedule'}
              className={`hqProgressViewTab${hqMainView === 'schedule' ? ' isActive' : ''}`}
              onClick={() => setHqMainView('schedule')}
            >
              試合進行
            </button>
            <span className="hqProgressTitleTabSep" aria-hidden>
              ｜
            </span>
            <button
              type="button"
              role="tab"
              aria-selected={hqMainView === 'standings'}
              className={`hqProgressViewTab${hqMainView === 'standings' ? ' isActive' : ''}`}
              onClick={() => setHqMainView('standings')}
            >
              プール表
            </button>
          </div>
          <div className="scheduleTitleText hqProgressTitleBarTrail">
            <h1 className="scheduleTitle">{isTdMode ? '本部承認 [TD]' : '本部進行 [オペレーター]'}</h1>
            <p className="scheduleMeta">
              {isOperatorMode
                ? `現在時刻：${toCurrentTimeLabel()}`
                : `承認者：${hqApproverName.trim() || '〇〇'}`}
            </p>
          </div>
        </header>

        {hqMainView === 'schedule' ? (
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
                <Link
                  className="hqProgressActionButton hqProgressDbInspectLink"
                  to={`/event/${eventId}/hq/progress-db${
                    searchParams.toString() ? `?${searchParams.toString()}` : ''
                  }`}
                >
                  進行DB
                </Link>
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
          </div>
        ) : null}
        {operationMessage ? <p className="hqProgressOperationMessage">{operationMessage}</p> : null}
        {operationError ? <p className="hqProgressOperationError">{operationError}</p> : null}

        {hqMainView === 'players' ? (
          <div className="hqProgressPlayersHost">
            <Suspense fallback={<p className="hqProgressPoolStandingsFallback">選手一覧を読み込み中...</p>}>
              <PlayerList embedInHq />
            </Suspense>
          </div>
        ) : hqMainView === 'standings' ? (
          <div className="hqProgressPoolStandingsHost">
            <Suspense fallback={<p className="hqProgressPoolStandingsFallback">プール表を読み込み中...</p>}>
              <PoolStandings embedInHq showEndsWonColumn />
            </Suspense>
          </div>
        ) : schedule.matches.length === 0 ? (
          <p className="scheduleEmpty">現在、登録されている試合予定はありません。</p>
        ) : (
          <div className="scheduleTableWrap">
            <table className="scheduleTable">
              <tbody>
                {timeSlots.flatMap((slot, index) => {
                  const slotAllHqDone = slotHqCompleteMap.get(slot) === true;
                  const matchesInRow = schedule.courts
                    .map((court) => matrix.get(slot)?.get(court))
                    .filter(Boolean);
                  const progressStatusById = new Map(
                    matchesInRow.map((m) => [
                      String(m?.matchId ?? ''),
                      String(progressMap.get(String(m?.matchId ?? ''))?.status ?? 'scheduled'),
                    ]),
                  );
                  const rowPhase = getScheduleRowPhase(slot, timeSlots, matchesInRow, progressStatusById);
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
                  const prevProgressStatusById = new Map(
                    prevMatches.map((m) => [
                      String(m?.matchId ?? ''),
                      String(progressMap.get(String(m?.matchId ?? ''))?.status ?? 'scheduled'),
                    ]),
                  );
                  const prevRowPhase = prevSlot
                    ? getScheduleRowPhase(prevSlot, timeSlots, prevMatches, prevProgressStatusById)
                    : '';
                  const shouldInsertHeaderAtTop = index === 0 && rowPhase !== 'past';
                  const shouldInsertHeaderAboveCurrent =
                    rowPhase === 'current' && prevRowPhase !== 'current' && index !== 0;

                  const slotBulkTargets = getAnnounceableMatchesForSlot(
                    slot,
                    schedule.courts,
                    matrix,
                    progressMap,
                  );
                  const prevSlotAllHqDone =
                    index > 0 && slotHqCompleteMap.get(timeSlots[index - 1]) === true;
                  const highlightAnnounceButtons =
                    isOperatorMode &&
                    prevSlotAllHqDone &&
                    slotBulkTargets.length > 0;

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
                  <tr
                    key={slot}
                    className={`scheduleRow ${rowPhaseClass}${slotAllHqDone ? ' isSlotHqComplete' : ''}`}
                  >
                    <th
                      className={`scheduleTimeCell${isOperatorMode ? ' hqProgressTimeCellWithBulk' : ''}`}
                    >
                      {isOperatorMode ? (
                        <>
                          <span className="hqProgressTimeLabel">
                            <span className="hqProgressTimeClock">{toDateTimeLabel(slot)}</span>
                            {slotAllHqDone ? (
                              <span className="hqProgressSlotCompleteLabel">完了</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className={`hqProgressActionButton hqProgressBulkAnnounceButton${
                              highlightAnnounceButtons ? ' isAnnounceReady' : ''
                            }`}
                            onClick={() => handleBulkAnnounceForSlot(slot)}
                            disabled={
                              slotBulkTargets.length === 0 || actionBusyKey !== '' || importing
                            }
                            title={
                              slotBulkTargets.length === 0
                                ? 'この時間帯に待機中の試合がありません'
                                : `この時間帯の待機中試合を一斉配信（${slotBulkTargets.length}件）`
                            }
                          >
                            一斉配信
                          </button>
                        </>
                      ) : slotAllHqDone ? (
                        <span className="hqProgressTimeTdStack">
                          <span className="hqProgressTimeClock">{toDateTimeLabel(slot)}</span>
                          <span className="hqProgressSlotCompleteLabel">完了</span>
                        </span>
                      ) : (
                        toDateTimeLabel(slot)
                      )}
                    </th>
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
                      const progress = progressMap.get(String(match.matchId));
                      const rawStatus = progress?.status || 'scheduled';
                      const letterForPoolHue =
                        extractPoolLetterFromMatch(match) ?? poolLetterByCourt.get(String(court));
                      const hueForPoolTint = letterForPoolHue
                        ? poolHueByPoolId.get(letterForPoolHue)
                        : undefined;
                      const isMatchInProgress = rawStatus === 'in_progress';
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
                      // コート game.json の isColorSet が無くても、アナウンス以降は赤青が確定しているのでボーダーを表示する
                      const sidesLockedByProgress = [
                        'announced',
                        'in_progress',
                        'court_approved',
                        'hq_approved',
                        'reflected',
                      ].includes(rawStatus);
                      const isColorConfirmed =
                        colorState?.isColorSet === true || sidesLockedByProgress;
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
                      const displayStatus =
                        progress?.finishedAt &&
                        (rawStatus === 'announced' || rawStatus === 'in_progress')
                          ? 'match_finished'
                          : rawStatus;
                      const isFinishedDisplayStatus = ['match_finished', 'court_approved', 'hq_approved'].includes(
                        displayStatus,
                      );
                      const shouldHighlightWinnerBorder = isFinishedDisplayStatus && colorState?.isScoreVisible === true;
                      const showTbTag =
                        shouldHighlightWinnerBorder &&
                        Number(colorState?.redScore ?? NaN) === Number(colorState?.blueScore ?? NaN);
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
                      const poolRoundLabel = toPoolRoundLabel(match);
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
                      const timelineLabels = [
                        warmupStartedLabel,
                        warmupFinishedLabel,
                        startedLabel,
                        finishedLabel,
                      ];
                      const shouldHighlightTimelineLatest = !finishedLabel;
                      const lastDoneIndex = timelineLabels.reduce(
                        (lastIndex, label, i) => (label ? i : lastIndex),
                        -1,
                      );

                      return (
                        <td key={`${slot}-${court}`} className="scheduleCell" style={inProgressPoolBgStyle}>
                          {poolRoundLabel ? (
                            <p className="hqProgressPoolRoundLabel">{poolRoundLabel}</p>
                          ) : null}
                          <div className="scheduleMatchMain">
                            <p
                              className={`schedulePlayerName ${leftNameClass} ${isWinnerPlaceholder(redName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(redName)}
                            </p>
                            <p className="scheduleVersus">VS</p>
                            <p
                              className={`schedulePlayerName ${rightNameClass} ${isWinnerPlaceholder(blueName) ? 'isPlaceholderName' : ''}`}
                            >
                              {renderNameWithLineBreaks(blueName)}
                            </p>
                          </div>
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
                          {SHOW_MATCH_ID && (
                            <p className="scheduleMatchSub">{`ID: ${toShortMatchId(match.matchId)}`}</p>
                          )}
                          <p className={`hqProgressStatus ${statusClassName}`}>{statusLabel}</p>
                          {isOperatorMode && (
                            <div className="hqProgressTimeline">
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 0 ? 'isDone' : ''}`}>
                                {warmupStartedLabel ? `ウォームアップ開始 ${warmupStartedLabel}` : 'ウォームアップ開始 -'}
                              </p>
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 1 ? 'isDone' : ''}`}>
                                {warmupFinishedLabel ? `ウォームアップ終了 ${warmupFinishedLabel}` : 'ウォームアップ終了 -'}
                              </p>
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 2 ? 'isDone' : ''}`}>
                                {startedLabel ? `試合開始 ${startedLabel}` : '試合開始 -'}
                              </p>
                              <p className={`hqProgressTimelineItem ${shouldHighlightTimelineLatest && lastDoneIndex === 3 ? 'isDone' : ''}`}>
                                {finishedLabel ? `試合終了 ${finishedLabel}` : '試合終了 -'}
                              </p>
                            </div>
                          )}
                          {isOperatorMode && (canAnnounce || canUnannounce) && (
                            <>
                              <div className="hqProgressButtonRow">
                                {canUnannounce ? (
                                  <button
                                    type="button"
                                    className="hqProgressActionButton"
                                    onClick={() => handleUnannounce(match)}
                                    disabled={actionBusyKey !== '' || importing}
                                  >
                                    配信取り消し
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={`hqProgressActionButton${
                                      highlightAnnounceButtons && canAnnounce ? ' isAnnounceReady' : ''
                                    }`}
                                    onClick={() => handleAnnounce(match)}
                                    disabled={!canAnnounce || actionBusyKey !== '' || importing}
                                  >
                                    スコアボードへ配信
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                          {isTdMode && (
                            <div className="hqProgressButtonRow">
                              <button
                                type="button"
                                className={`hqProgressActionButton ${
                                  ['hq_approved', 'reflected'].includes(effectiveStatus)
                                    ? 'isFullyTransparent'
                                    : ''
                                } ${effectiveStatus === 'court_approved' ? 'isHqApproveReady' : ''}`}
                                onClick={() => handleHqApprove(match)}
                                disabled={!canHqApprove || actionBusyKey !== '' || importing}
                              >
                                本部承認
                              </button>
                            </div>
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
      {isTdMode && showApproverModal ? (
        <div
          className="hqProgressApproverModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hq-approver-modal-title"
        >
          <div className="hqProgressApproverModal">
            <h2 id="hq-approver-modal-title" className="hqProgressApproverModalTitle">本部承認者名を入力</h2>
            <p className="hqProgressApproverModalNote">この名前で本部承認を実行します。</p>
            <input
              type="text"
              className="hqProgressApproverInput"
              value={approverNameDraft}
              onChange={(event) => setApproverNameDraft(event.target.value)}
              placeholder="例: TD"
              autoFocus
            />
            <div className="hqProgressApproverModalActions">
              <button
                type="button"
                className="hqProgressActionButton"
                onClick={handleApproverModalSubmit}
              >
                設定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default HqProgress;
