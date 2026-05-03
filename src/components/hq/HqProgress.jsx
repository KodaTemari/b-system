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
import { resolveScoreboardCmImageUrl } from '../../utils/scoreboard/scoreboardCmImage';

const PoolStandings = lazy(() => import('../pool/PoolStandings'));
const PlayerList = lazy(() => import('../players/PlayerList'));

// 将来復活できるよう、試合ID表示はトグルで制御する
const SHOW_MATCH_ID = false;

/** 本部承認（hqApprovedAt）から CM ボタンを出すまでの待ち時間 */
const CM_SHOW_DELAY_MS = 3 * 60 * 1000;

/** 当該コートに配信済み・試合中の試合があるときは CM 不可（コートは稼働中） */
function courtHasAnnouncedOrInProgressMatch(courtId, progressMap) {
  const cid = String(courtId ?? '').trim();
  if (!cid) {
    return false;
  }
  for (const prog of progressMap.values()) {
    if (String(prog?.courtId ?? '').trim() !== cid) {
      continue;
    }
    const st = String(prog?.status ?? '');
    if (st === 'announced' || st === 'in_progress') {
      return true;
    }
  }
  return false;
}

/** TD（本部承認）モードの承認者名デフォルト（テスト時の入力負荷軽減） */
const DEFAULT_HQ_TD_APPROVER_NAME = 'TD';

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
  const [approverNameDraft, setApproverNameDraft] = useState(DEFAULT_HQ_TD_APPROVER_NAME);
  const [actionBusyKey, setActionBusyKey] = useState('');
  const [importing, setImporting] = useState(false);
  /** init.display.scoreboardCmImage を解決した CM 画像 URL（CM ボタン PUT 用） */
  const [scoreboardCmImageUrl, setScoreboardCmImageUrl] = useState('');
  /** 各コートの cm-overlay.json の active（ボタン文言・トグル用） */
  const [cmOverlayActiveByCourt, setCmOverlayActiveByCourt] = useState({});
  /** CM ボタン表示の「本部承認から3分」判定用 */
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** 紙スコアシート・オペレーター送信の承認待ち（matchId → request） */
  const [pendingManualByMatchId, setPendingManualByMatchId] = useState(() => new Map());
  /** 紙結果入力 / 承認モーダル */
  const [manualPaperModal, setManualPaperModal] = useState(null);
  const [manualPaperSaving, setManualPaperSaving] = useState(false);
  const [paperForm, setPaperForm] = useState(() => ({}));
  const [paperRejectReason, setPaperRejectReason] = useState('');
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
      setShowApproverModal(true);
    }
  }, [isTdMode, hqApproverName]);

  /** モーダル表示時は常に入力の value に TD を入れた状態から始める */
  useEffect(() => {
    if (!isTdMode || !showApproverModal) {
      return;
    }
    setApproverNameDraft(DEFAULT_HQ_TD_APPROVER_NAME);
  }, [isTdMode, showApproverModal]);

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

  const refreshCmOverlayStatesForCourts = useCallback(
    async (courtsList) => {
      if (!eventId || !Array.isArray(courtsList)) {
        return;
      }
      const next = {};
      await Promise.all(
        courtsList.map(async (cidRaw) => {
          const c = String(cidRaw ?? '').trim();
          if (!c) {
            return;
          }
          try {
            const res = await fetch(
              `/api/data/${encodeURIComponent(eventId)}/court/${encodeURIComponent(c)}/cm-overlay`,
            );
            if (res.ok) {
              const j = await res.json();
              next[c] = Boolean(j.active);
            } else {
              next[c] = false;
            }
          } catch {
            next[c] = false;
          }
        }),
      );
      setCmOverlayActiveByCourt((prev) => ({ ...prev, ...next }));
    },
    [eventId],
  );

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

        const courtsArr = Array.isArray(scheduleJson.courts)
          ? scheduleJson.courts.map((court) => String(court))
          : [];
        setSchedule({
          courts: courtsArr,
          matches: Array.isArray(scheduleJson.matches) ? scheduleJson.matches : [],
          pools: Array.isArray(scheduleJson.pools) ? scheduleJson.pools : [],
          eventDate: String(scheduleJson.eventDate ?? ''),
          eventDayLabel: String(scheduleJson.eventDayLabel ?? ''),
          startTime: String(scheduleJson.startTime ?? ''),
        });
        setPlayers(normalizePlayers(playersJson));
        let cmUrl = resolveScoreboardCmImageUrl(null, eventId);
        try {
          const initRes = await fetch(`/data/${encodeURIComponent(eventId)}/init.json`);
          if (initRes.ok) {
            const initJson = await initRes.json();
            cmUrl = resolveScoreboardCmImageUrl(initJson, eventId);
          }
        } catch {
          // init なしのときはデフォルト
        }
        setScoreboardCmImageUrl(cmUrl);
        await refreshCmOverlayStatesForCourts(courtsArr);
        await fetchProgress();
        setError('');
      } catch (err) {
        setError(err.message || 'スケジュールデータの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [eventId, fetchProgress, refreshCmOverlayStatesForCourts]);

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
      return undefined;
    }
    const poll = () => {
      fetch(`/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/pending`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.requests || !Array.isArray(data.requests)) {
            return;
          }
          const next = new Map();
          for (const req of data.requests) {
            const mid = String(req?.matchId ?? '').trim();
            if (mid) {
              next.set(mid, req);
            }
          }
          setPendingManualByMatchId(next);
        })
        .catch(() => {
          /* 進行の補助情報のため握りつぶす */
        });
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
  }, [eventId]);

  useEffect(() => {
    if (!manualPaperModal) {
      setPaperForm({});
      setPaperRejectReason('');
      return;
    }
    if (manualPaperModal.mode === 'submit' && manualPaperModal.match) {
      const m = manualPaperModal.match;
      setPaperForm({
        redPlayerId: String(m.redPlayerId ?? '').trim(),
        bluePlayerId: String(m.bluePlayerId ?? '').trim(),
        redScore: '',
        blueScore: '',
        redEndsWon: '',
        blueEndsWon: '',
        winnerPlayerId: '',
        refereeName: '',
        operatorName: '',
        note: '',
      });
    }
  }, [manualPaperModal]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      if (action === 'announce') {
        const cid = String(match.courtId ?? '').trim();
        if (cid) {
          setCmOverlayActiveByCourt((prev) => ({ ...prev, [cid]: false }));
        }
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

  const submitManualPaperResult = useCallback(async () => {
    if (!eventId || !manualPaperModal?.match || manualPaperModal.mode !== 'submit') {
      return;
    }
    const match = manualPaperModal.match;
    const mid = String(match.matchId ?? '').trim();
    setManualPaperSaving(true);
    setOperationError('');
    try {
      const body = {
        redPlayerId: String(paperForm.redPlayerId ?? '').trim(),
        bluePlayerId: String(paperForm.bluePlayerId ?? '').trim(),
        redScore: paperForm.redScore === '' ? null : Number(paperForm.redScore),
        blueScore: paperForm.blueScore === '' ? null : Number(paperForm.blueScore),
        redEndsWon: paperForm.redEndsWon === '' ? null : paperForm.redEndsWon,
        blueEndsWon: paperForm.blueEndsWon === '' ? null : paperForm.blueEndsWon,
        winnerPlayerId: String(paperForm.winnerPlayerId ?? '').trim(),
        refereeName: String(paperForm.refereeName ?? '').trim(),
        operatorName: String(paperForm.operatorName ?? '').trim() || null,
        note: String(paperForm.note ?? '').trim() || null,
      };
      if (!Number.isFinite(body.redScore) || !Number.isFinite(body.blueScore)) {
        throw new Error('赤・青のスコアを数値で入力してください。');
      }
      if (!body.winnerPlayerId) {
        throw new Error('勝者（選手ID）を選択してください。');
      }
      if (!body.refereeName) {
        throw new Error('審判名を入力してください。');
      }
      const res = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(mid)}/manual-result-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '送信に失敗しました。');
      }
      setManualPaperModal(null);
      setOperationMessage(
        `${toShortMatchId(mid)} の紙スコア結果を送信しました。本部エディタ（TD）の承認を待ちます。`,
      );
      const poll = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/pending`,
      );
      if (poll.ok) {
        const pData = await poll.json();
        const next = new Map();
        for (const req of pData.requests || []) {
          if (req.matchId) {
            next.set(String(req.matchId), req);
          }
        }
        setPendingManualByMatchId(next);
      }
    } catch (e) {
      setOperationError(e.message || '送信に失敗しました。');
    } finally {
      setManualPaperSaving(false);
    }
  }, [eventId, manualPaperModal, paperForm]);

  const approveManualPaperRequest = useCallback(async () => {
    if (!eventId || !manualPaperModal?.request?.id) {
      return;
    }
    const reviewerName = String(hqApproverName ?? '').trim();
    if (!reviewerName) {
      setOperationError('上部で本部承認者名（TD名）を確定してから承認してください。');
      return;
    }
    const requestId = manualPaperModal.request.id;
    setManualPaperSaving(true);
    setOperationError('');
    try {
      const res = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/${encodeURIComponent(requestId)}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewerName }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '承認に失敗しました。');
      }
      setManualPaperModal(null);
      setOperationMessage('紙スコア結果を反映し、コート承認済みとしました。続けて本部承認が可能です。');
      await fetchProgress();
      const poll = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/pending`,
      );
      if (poll.ok) {
        const pData = await poll.json();
        const next = new Map();
        for (const req of pData.requests || []) {
          if (req.matchId) {
            next.set(String(req.matchId), req);
          }
        }
        setPendingManualByMatchId(next);
      }
    } catch (e) {
      setOperationError(e.message || '承認に失敗しました。');
    } finally {
      setManualPaperSaving(false);
    }
  }, [eventId, manualPaperModal, hqApproverName, fetchProgress]);

  const rejectManualPaperRequest = useCallback(async () => {
    if (!eventId || !manualPaperModal?.request?.id) {
      return;
    }
    const reviewerName = String(hqApproverName ?? '').trim();
    if (!reviewerName) {
      setOperationError('上部で本部承認者名（TD名）を確定してから却下してください。');
      return;
    }
    const requestId = manualPaperModal.request.id;
    setManualPaperSaving(true);
    setOperationError('');
    try {
      const res = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/${encodeURIComponent(requestId)}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewerName,
            rejectionReason: paperRejectReason.trim() || null,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '却下に失敗しました。');
      }
      setManualPaperModal(null);
      setOperationMessage('紙スコアの申請を却下しました。');
      const poll = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/manual-result-requests/pending`,
      );
      if (poll.ok) {
        const pData = await poll.json();
        const next = new Map();
        for (const req of pData.requests || []) {
          if (req.matchId) {
            next.set(String(req.matchId), req);
          }
        }
        setPendingManualByMatchId(next);
      }
    } catch (e) {
      setOperationError(e.message || '却下に失敗しました。');
    } finally {
      setManualPaperSaving(false);
    }
  }, [eventId, manualPaperModal, hqApproverName, paperRejectReason]);

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

  const handleCmToggleOnCourt = async (courtId) => {
    if (!eventId) {
      return;
    }
    const cid = String(courtId ?? '').trim();
    if (!cid) {
      return;
    }
    const isActive = cmOverlayActiveByCourt[cid] === true;
    const imageUrl =
      (scoreboardCmImageUrl && String(scoreboardCmImageUrl).trim()) ||
      resolveScoreboardCmImageUrl(null, eventId);
    const busyKey = `cm:${cid}`;
    try {
      setActionBusyKey(busyKey);
      setOperationError('');
      const body = isActive ? { active: false } : { active: true, imageUrl };
      const response = await fetch(
        `/api/data/${encodeURIComponent(eventId)}/court/${encodeURIComponent(cid)}/cm-overlay`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || (isActive ? 'CM の解除に失敗しました。' : 'CM の有効化に失敗しました。'));
      }
      setCmOverlayActiveByCourt((prev) => ({ ...prev, [cid]: !isActive }));
      setOperationMessage('');
    } catch (err) {
      setOperationError(err.message || 'CM の更新に失敗しました。');
    } finally {
      setActionBusyKey('');
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
      setApproverNameDraft((prev) => String(prev).trim() || DEFAULT_HQ_TD_APPROVER_NAME);
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
                      /** 赤青下線はコートで色確定（screen.isColorSet）後のみ。一斉配信直後も未確定なら非表示 */
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

                      const hqApprovedAtMs = progress?.hqApprovedAt
                        ? new Date(progress.hqApprovedAt).getTime()
                        : NaN;
                      const showCmButton =
                        isOperatorMode &&
                        (rawStatus === 'hq_approved' || rawStatus === 'reflected') &&
                        Number.isFinite(hqApprovedAtMs) &&
                        nowTick >= hqApprovedAtMs + CM_SHOW_DELAY_MS &&
                        !courtHasAnnouncedOrInProgressMatch(court, progressMap);

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
                          {displayStatus === 'court_approved' ? (
                            <p
                              className={`hqProgressStatus ${statusClassName} hqProgressStatusCourtApprovedNotice`}
                            >
                              <span className="hqProgressStatusCourtApprovedLine1">コート承認済み</span>
                              <br />
                              <span className="hqProgressStatusCourtApprovedLine2">
                                本部承認をお願いします
                              </span>
                            </p>
                          ) : (
                            <p className={`hqProgressStatus ${statusClassName}`}>{statusLabel}</p>
                          )}
                          {pendingManualByMatchId.has(String(match.matchId)) ? (
                            <p className="hqProgressManualPaperPending">紙結果・承認待ち</p>
                          ) : null}
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
                          {isOperatorMode && showCmButton && (
                            <div className="hqProgressButtonRow">
                              <button
                                type="button"
                                className="hqProgressActionButton hqProgressCmButton"
                                onClick={() => handleCmToggleOnCourt(court)}
                                disabled={actionBusyKey !== '' || importing}
                              >
                                {cmOverlayActiveByCourt[String(court)] === true
                                  ? 'CM取り消し'
                                  : 'CM配信'}
                              </button>
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
                          {isOperatorMode &&
                            progress &&
                            (rawStatus === 'announced' || rawStatus === 'in_progress') && (
                              <div className="hqProgressButtonRow">
                                <button
                                  type="button"
                                  className="hqProgressActionButton hqProgressManualPaperButton"
                                  onClick={() => setManualPaperModal({ mode: 'submit', match })}
                                  disabled={actionBusyKey !== '' || importing || manualPaperSaving}
                                >
                                  結果入力
                                </button>
                              </div>
                            )}
                          {isTdMode && pendingManualByMatchId.has(String(match.matchId)) && (
                            <div className="hqProgressButtonRow">
                              <button
                                type="button"
                                className="hqProgressActionButton hqProgressManualPaperReviewButton"
                                onClick={() =>
                                  setManualPaperModal({
                                    mode: 'review',
                                    match,
                                    request: pendingManualByMatchId.get(String(match.matchId)),
                                  })
                                }
                                disabled={actionBusyKey !== '' || importing || manualPaperSaving}
                              >
                                紙結果を承認
                              </button>
                            </div>
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
      {manualPaperModal ? (
        <div
          className="hqProgressManualPaperModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hq-manual-paper-title"
          onClick={() => {
            if (!manualPaperSaving) {
              setManualPaperModal(null);
            }
          }}
        >
          <div
            className="hqProgressManualPaperModal"
            onClick={(e) => e.stopPropagation()}
          >
            {manualPaperModal.mode === 'submit' ? (
              <>
                <h2 id="hq-manual-paper-title" className="hqProgressManualPaperModalTitle">
                  紙スコアシート・結果入力
                </h2>
                <p className="hqProgressManualPaperModalNote">
                  スコアボードが使用できないときの記録です。送信後、TD が内容を確認してコート承認として反映します。
                </p>
                <div className="hqProgressManualPaperFormGrid">
                  <label className="hqProgressManualPaperField">
                    <span>赤 選手ID</span>
                    <input
                      type="text"
                      value={paperForm.redPlayerId ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, redPlayerId: e.target.value }))
                      }
                      autoComplete="off"
                    />
                  </label>
                  <label className="hqProgressManualPaperField">
                    <span>青 選手ID</span>
                    <input
                      type="text"
                      value={paperForm.bluePlayerId ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, bluePlayerId: e.target.value }))
                      }
                      autoComplete="off"
                    />
                  </label>
                  <label className="hqProgressManualPaperField">
                    <span>赤スコア</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={paperForm.redScore ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, redScore: e.target.value }))
                      }
                    />
                  </label>
                  <label className="hqProgressManualPaperField">
                    <span>青スコア</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={paperForm.blueScore ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, blueScore: e.target.value }))
                      }
                    />
                  </label>
                  <label className="hqProgressManualPaperField">
                    <span>赤 勝ちエンド（任意）</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={paperForm.redEndsWon ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, redEndsWon: e.target.value }))
                      }
                    />
                  </label>
                  <label className="hqProgressManualPaperField">
                    <span>青 勝ちエンド（任意）</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={paperForm.blueEndsWon ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, blueEndsWon: e.target.value }))
                      }
                    />
                  </label>
                  <label className="hqProgressManualPaperField hqProgressManualPaperFieldWide">
                    <span>勝者（選手ID）</span>
                    <select
                      value={paperForm.winnerPlayerId ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, winnerPlayerId: e.target.value }))
                      }
                    >
                      <option value="">選択してください</option>
                      <option value={String(paperForm.redPlayerId ?? '').trim()}>
                        赤 {String(paperForm.redPlayerId ?? '').trim() || '—'}
                      </option>
                      <option value={String(paperForm.bluePlayerId ?? '').trim()}>
                        青 {String(paperForm.bluePlayerId ?? '').trim() || '—'}
                      </option>
                    </select>
                  </label>
                  <label className="hqProgressManualPaperField hqProgressManualPaperFieldWide">
                    <span>審判名（必須）</span>
                    <input
                      type="text"
                      value={paperForm.refereeName ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, refereeName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="hqProgressManualPaperField hqProgressManualPaperFieldWide">
                    <span>オペレーター名（任意）</span>
                    <input
                      type="text"
                      value={paperForm.operatorName ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, operatorName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="hqProgressManualPaperField hqProgressManualPaperFieldFull">
                    <span>備考（任意）</span>
                    <textarea
                      rows={2}
                      value={paperForm.note ?? ''}
                      onChange={(e) =>
                        setPaperForm((f) => ({ ...f, note: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="hqProgressManualPaperModalActions">
                  <button
                    type="button"
                    className="hqProgressActionButton"
                    onClick={() => setManualPaperModal(null)}
                    disabled={manualPaperSaving}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="hqProgressActionButton hqProgressManualPaperSubmitButton"
                    onClick={() => submitManualPaperResult()}
                    disabled={manualPaperSaving}
                  >
                    {manualPaperSaving ? '送信中…' : '本部へ送信（承認待ち）'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="hq-manual-paper-title" className="hqProgressManualPaperModalTitle">
                  紙スコア結果の承認
                </h2>
                <p className="hqProgressManualPaperModalNote">
                  内容を確認し、問題なければ「コート承認として反映」を押してください。反映後は通常どおり「本部承認」へ進めます。
                </p>
                {manualPaperModal.request ? (
                  <dl className="hqProgressManualPaperReviewGrid">
                    <dt>赤 選手ID</dt>
                    <dd>{manualPaperModal.request.redPlayerId}</dd>
                    <dt>青 選手ID</dt>
                    <dd>{manualPaperModal.request.bluePlayerId}</dd>
                    <dt>赤スコア</dt>
                    <dd>{manualPaperModal.request.redScore}</dd>
                    <dt>青スコア</dt>
                    <dd>{manualPaperModal.request.blueScore}</dd>
                    <dt>赤 勝ちエンド</dt>
                    <dd>
                      {manualPaperModal.request.redEndsWon != null
                        ? manualPaperModal.request.redEndsWon
                        : '—'}
                    </dd>
                    <dt>青 勝ちエンド</dt>
                    <dd>
                      {manualPaperModal.request.blueEndsWon != null
                        ? manualPaperModal.request.blueEndsWon
                        : '—'}
                    </dd>
                    <dt>勝者</dt>
                    <dd>{manualPaperModal.request.winnerPlayerId}</dd>
                    <dt>審判名</dt>
                    <dd>{manualPaperModal.request.refereeName}</dd>
                    <dt>オペレーター</dt>
                    <dd>{manualPaperModal.request.operatorName || '—'}</dd>
                    <dt>備考</dt>
                    <dd>{manualPaperModal.request.note || '—'}</dd>
                    <dt>送信時刻</dt>
                    <dd className="hqProgressManualPaperMono">{manualPaperModal.request.createdAt || '—'}</dd>
                  </dl>
                ) : null}
                <label className="hqProgressManualPaperField hqProgressManualPaperFieldFull">
                  <span>却下理由（却下時のみ）</span>
                  <textarea
                    rows={2}
                    value={paperRejectReason}
                    onChange={(e) => setPaperRejectReason(e.target.value)}
                    placeholder="必要に応じて入力"
                  />
                </label>
                <div className="hqProgressManualPaperModalActions">
                  <button
                    type="button"
                    className="hqProgressActionButton"
                    onClick={() => setManualPaperModal(null)}
                    disabled={manualPaperSaving}
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    className="hqProgressActionButton hqProgressManualPaperRejectButton"
                    onClick={() => rejectManualPaperRequest()}
                    disabled={manualPaperSaving}
                  >
                    {manualPaperSaving ? '処理中…' : '却下'}
                  </button>
                  <button
                    type="button"
                    className="hqProgressActionButton hqProgressManualPaperApproveButton"
                    onClick={() => approveManualPaperRequest()}
                    disabled={manualPaperSaving}
                  >
                    {manualPaperSaving ? '処理中…' : 'コート承認として反映'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
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
            <form
              className="hqProgressApproverModalForm"
              onSubmit={(event) => {
                event.preventDefault();
                handleApproverModalSubmit();
              }}
            >
              <input
                type="text"
                className="hqProgressApproverInput"
                value={approverNameDraft}
                onChange={(event) => setApproverNameDraft(event.target.value)}
                autoFocus
              />
              <div className="hqProgressApproverModalActions">
                <button type="submit" className="hqProgressActionButton">
                  確定
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default HqProgress;
