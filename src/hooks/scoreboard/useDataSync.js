import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_GAME_DATA, TIMER_LIMITS } from '../../utils/scoreboard/constants';
import {
  GAME_ONLY_DEBOUNCE_MS,
  EMPTY_TIMER_RUNNING_SNAP,
  snapTimerRunningFlags,
  anyTimerStoppedTransition,
} from '../../utils/scoreboard/gameOnlyPersist';

/** init.json の display.scoreboardPlayerNameFontSize（数値は vmin 相当） */
function parseScoreboardPlayerNameFontSizeFromInit(initData) {
  const raw = initData?.display?.scoreboardPlayerNameFontSize;
  if (raw === undefined || raw === null) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/** init.json の display.showClassification（false のときスコアボードに種別行を出さない） */
function parseShowClassificationFromInit(initData) {
  return initData?.display?.showClassification !== false;
}

/** settings に無い timer limit を init.json で補完（game.json 側の古い 5 分と混ざるのを防ぐ） */
function enrichSettingsTimerLimitsFromInit(settingsData, initData) {
  if (!initData) {
    return settingsData;
  }
  const next = { ...settingsData };
  next.red = { ...(settingsData.red || {}) };
  next.blue = { ...(settingsData.blue || {}) };
  next.warmup = { ...(settingsData.warmup || {}) };
  next.interval = { ...(settingsData.interval || {}) };
  if (next.red.limit == null && initData.red?.limit != null) {
    next.red.limit = initData.red.limit;
  }
  if (next.blue.limit == null && initData.blue?.limit != null) {
    next.blue.limit = initData.blue.limit;
  }
  if (next.warmup.limit == null && initData.warmup?.limit != null) {
    next.warmup.limit = initData.warmup.limit;
  }
  if (next.interval.limit == null && initData.interval?.limit != null) {
    next.interval.limit = initData.interval.limit;
  }
  return next;
}

/** game.json は進行用。limit は settings 専用のためマージ前に除外（古い 300000 が再混入しないように） */
function withoutTimerLimit(obj) {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  const { limit: _omit, ...rest } = obj;
  return rest;
}

function capTimeToLimit(team) {
  if (!team || team.limit == null || team.time == null) {
    return team;
  }
  const capped = Math.min(team.time, team.limit);
  if (capped === team.time) {
    return team;
  }
  return { ...team, time: capped };
}

function capSectionTimeToLimit(section) {
  if (!section || section.limit == null || section.time == null) {
    return section;
  }
  const capped = Math.min(section.time, section.limit);
  if (capped === section.time) {
    return section;
  }
  return { ...section, time: capped };
}

/** 本部配信などサーバー側で更新され得る項目の比較用 */
function buildHqBroadcastSignature(data) {
  if (!data) {
    return '';
  }
  return [
    data.matchID ?? '',
    data.matchName ?? '',
    data.classification ?? '',
    data.category ?? '',
    data.red?.name ?? '',
    data.red?.playerID ?? '',
    data.red?.limit ?? '',
    data.red?.time ?? '',
    data.blue?.name ?? '',
    data.blue?.playerID ?? '',
    data.blue?.limit ?? '',
    data.blue?.time ?? '',
  ].join('\u0001');
}

/** game.json PUT 用ボディ（settings 専用フィールドを除去）— saveToGameJson と gameOnly バッチで共用 */
function buildGameJsonPutBody(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }
  return {
    ...data,
    classification: undefined,
    category: undefined,
    matchName: undefined,
    match: {
      ...data.match,
      totalEnds: undefined,
      warmup: undefined,
      interval: undefined,
      rules: undefined,
      resultApproval: undefined,
      tieBreak: undefined,
      sections: undefined
    },
    red: {
      ...data.red,
      name: undefined,
      limit: undefined,
      country: undefined,
      profilePic: undefined
    },
    blue: {
      ...data.blue,
      name: undefined,
      limit: undefined,
      country: undefined,
      profilePic: undefined
    },
    warmup: {
      ...data.warmup,
      limit: undefined
    },
    interval: {
      ...data.interval,
      limit: undefined
    }
  };
}

/**
 * データ同期のカスタムフック
 * Local Storage同期を管理
 */
export const useDataSync = (id, court, isCtrl) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [localData, setLocalData] = useState(null);
  const [eventName, setEventName] = useState('');
  const [classificationCount, setClassificationCount] = useState(null);
  const [scoreboardPlayerNameFontSize, setScoreboardPlayerNameFontSize] = useState(null);
  const [showClassification, setShowClassification] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  /** gameOnly: LocalStorage + PUT をまとめてデバウンス（低スペック端末での merge / stringify 連発を防ぐ） */
  const gameOnlyUnifiedTimerRef = useRef(null);
  const pendingGameOnlyDataRef = useRef(null);
  /** gameOnlyLocal: タイマー tick 用。LS のみ更新し PUT しない */
  const gameOnlyLocalTimerRef = useRef(null);
  const pendingGameOnlyLocalRef = useRef(null);
  /** 直近でキューした gameOnly の実行フラグ（停止直後に古い「実行中」ペイロードが遅延フラッシュされるのを検知する） */
  const lastGameOnlyRunningRef = useRef({ ...EMPTY_TIMER_RUNNING_SNAP });

  useEffect(() => {
    lastGameOnlyRunningRef.current = { ...EMPTY_TIMER_RUNNING_SNAP };
  }, [id, court]);

  // スタンドアロンモード判定（id, courtがない場合）
  const isStandaloneMode = !id || !court;
  

  const loadGameData = useCallback(async (loadOpts = {}) => {
    const silent = Boolean(loadOpts.silent);
    let initProfilePicMode = 'enabled';
    // スタンドアロンモードの場合は、サーバーからの読み込みをスキップ
    if (isStandaloneMode) {
      setIsLoading(true);
      setError(null);
      
      // デフォルトデータを生成
      const defaultData = JSON.parse(JSON.stringify(DEFAULT_GAME_DATA));
      setLocalData(defaultData);
      
      // LocalStorageキーをスタンドアロン用に設定
      const standaloneKey = 'scoreboard_standalone_data';
      const storedData = localStorage.getItem(standaloneKey);
      
      if (storedData) {
        try {
          const parsedData = JSON.parse(storedData);
          setLocalData(parsedData);
        } catch (err) {
          console.error('LocalStorage読み込みエラー:', err);
          localStorage.setItem(standaloneKey, JSON.stringify(defaultData));
        }
      } else {
        localStorage.setItem(standaloneKey, JSON.stringify(defaultData));
      }
      
      setIsLoading(false);
      return;
    }

    // 大会モードの場合は通常通りサーバーから読み込み
    if (!id || !court) return;

    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [settingsRes, gameRes, initRes] = await Promise.all([
        fetch(`/api/data/${id}/court/${court}/settings`),
        fetch(`/api/data/${id}/court/${court}/game`),
        fetch(`/data/${encodeURIComponent(id)}/init.json`),
      ]);

      let settingsData = {};
      let gameDataState = {};
      let initData = null;

      if (initRes.ok) {
        initData = await initRes.json();
        initProfilePicMode = String(initData.profilePic ?? 'enabled');
        setEventName(initData.gameName || initData.eventName || id);
        setClassificationCount(Array.isArray(initData.classifications) ? initData.classifications.length : null);
        setShowClassification(parseShowClassificationFromInit(initData));
      }

      if (settingsRes.ok) {
        settingsData = await settingsRes.json();
      } else if (initData) {
        settingsData = {
          classification: '',
          category: '',
          matchName: '',
          match: {
            totalEnds: initData.match?.totalEnds || 6,
            warmup: initData.match?.warmup || 'simultaneous',
            interval: initData.match?.interval || 'enabled',
            rules: initData.match?.rules || 'worldBoccia',
            resultApproval: initData.match?.resultApproval || 'enabled',
            tieBreak: initData.match?.tieBreak || 'finalShot',
            sections: initData.match?.sections,
          },
          red: { name: 'Red', limit: initData.red?.limit ?? TIMER_LIMITS.GAME },
          blue: { name: 'Blue', limit: initData.blue?.limit ?? TIMER_LIMITS.GAME },
          warmup: { limit: initData.warmup?.limit ?? TIMER_LIMITS.WARMUP },
          interval: { limit: initData.interval?.limit ?? TIMER_LIMITS.INTERVAL },
        };
      } else {
        settingsData = {
          match: { totalEnds: 6, warmup: 'simultaneous', interval: 'enabled', rules: 'worldBoccia', resultApproval: 'enabled', tieBreak: 'finalShot' },
          red: { name: 'Red', limit: TIMER_LIMITS.GAME },
          blue: { name: 'Blue', limit: TIMER_LIMITS.GAME },
        };
      }

      if (initData) {
        settingsData = enrichSettingsTimerLimitsFromInit(settingsData, initData);
      }

      if (gameRes.ok) {
        gameDataState = await gameRes.json();
      } else {
        gameDataState = JSON.parse(JSON.stringify(DEFAULT_GAME_DATA));
      }

      const gameRed = withoutTimerLimit(gameDataState.red);
      const gameBlue = withoutTimerLimit(gameDataState.blue);
      const gameWarmup = withoutTimerLimit(gameDataState.warmup);
      const gameInterval = withoutTimerLimit(gameDataState.interval);

      const mergedData = {
        ...gameDataState,
        ...settingsData,
        profilePic: initProfilePicMode,
        match: {
          ...gameDataState.match,
          ...(settingsData.match || {}),
        },
        red: {
          ...gameRed,
          ...(settingsData.red || {}),
        },
        blue: {
          ...gameBlue,
          ...(settingsData.blue || {}),
        },
        warmup: {
          ...gameWarmup,
          ...(settingsData.warmup || {}),
        },
        interval: {
          ...gameInterval,
          ...(settingsData.interval || {}),
        },
      };

      mergedData.red = capTimeToLimit(mergedData.red);
      mergedData.blue = capTimeToLimit(mergedData.blue);
      mergedData.warmup = capSectionTimeToLimit(mergedData.warmup);
      mergedData.interval = capSectionTimeToLimit(mergedData.interval);

      if (initProfilePicMode === 'none') {
        mergedData.red = {
          ...mergedData.red,
          profilePic: '',
        };
        mergedData.blue = {
          ...mergedData.blue,
          profilePic: '',
        };
      }

      // totalEndsとsectionsの不整合を解消
      if (mergedData.match?.totalEnds && mergedData.match?.sections) {
        const currentTotalEnds = mergedData.match.totalEnds;
        const sections = mergedData.match.sections;
        const lastEndSection = sections.filter(s => s.startsWith('end')).pop();
        const lastEndNumber = lastEndSection ? parseInt(lastEndSection.replace('end', ''), 10) : 0;
        
        if (lastEndNumber !== currentTotalEnds) {
          console.log(`不整合を検知: totalEnds=${currentTotalEnds}, sections内の最後のエンド=${lastEndNumber}`);
          // sectionsを再計算（settings.jsonの内容を信頼するが、sectionsが古い場合のみ）
          const recalculateSections = (total, warmup, interval, resultApproval) => {
            const newSections = ['standby'];
            if (warmup === 'simultaneous') newSections.push('warmup');
            else if (warmup === 'separate') newSections.push('warmup1', 'warmup2');
            for (let i = 1; i <= total; i++) {
              newSections.push(`end${i}`);
              if (i < total && interval !== 'none') newSections.push('interval');
            }
            newSections.push('matchFinished');
            if (resultApproval !== 'none') newSections.push('resultApproval');
            return newSections;
          };
          
          mergedData.match.sections = recalculateSections(
            currentTotalEnds,
            mergedData.match.warmup || 'simultaneous',
            mergedData.match.interval || 'enabled',
            mergedData.match.resultApproval || 'enabled'
          );
        }
      }
      
      const storageKey = `scoreboard_${id}_${court}_data`;

      if (silent) {
        // 本部の announce 等でサーバーだけ更新されたとき、スコア・タイマーを壊さず表示名だけ追従する
        setLocalData((prev) => {
          if (!prev) {
            localStorage.setItem(storageKey, JSON.stringify(mergedData));
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent('scoreboardDataUpdate', {
                detail: { key: storageKey, data: mergedData },
              }));
            });
            return mergedData;
          }
          // 色未確定中（スタンバイ運用でコート側が色決め中）は、
          // 同一 matchID に対してサーバー側の赤青表示で上書きしない。
          const shouldPreserveLocalColorDraft =
            prev.screen?.isColorSet === false &&
            String(prev.matchID ?? '') !== '' &&
            String(prev.matchID ?? '') === String(mergedData.matchID ?? '');

          const incomingForMerge = shouldPreserveLocalColorDraft
            ? {
              ...mergedData,
              red: {
                ...mergedData.red,
                name: prev.red?.name,
                playerID: prev.red?.playerID,
              },
              blue: {
                ...mergedData.blue,
                name: prev.blue?.name,
                playerID: prev.blue?.playerID,
              },
            }
            : mergedData;

          const prevMatchId = String(prev.matchID ?? '');
          const nextMatchId = String(incomingForMerge.matchID ?? '');
          const isMatchSwitched = prevMatchId !== nextMatchId;

          // 試合IDが切り替わったら、旧試合の section / score / approvals を引き継がない。
          // 配信直後はサーバー側の game.json（standby初期状態）をそのまま採用する。
          if (isMatchSwitched) {
            localStorage.setItem(storageKey, JSON.stringify(incomingForMerge));
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent('scoreboardDataUpdate', {
                detail: { key: storageKey, data: incomingForMerge },
              }));
            });
            return incomingForMerge;
          }

          if (buildHqBroadcastSignature(incomingForMerge) === buildHqBroadcastSignature(prev)) {
            return prev;
          }
          const redLimitMerged = incomingForMerge.red?.limit ?? prev.red?.limit;
          const blueLimitMerged = incomingForMerge.blue?.limit ?? prev.blue?.limit;
          const incomingRedTime = incomingForMerge.red?.time ?? prev.red?.time;
          const incomingBlueTime = incomingForMerge.blue?.time ?? prev.blue?.time;
          const stoppedRedTime = prev.red?.isRunning
            ? prev.red?.time
            : (redLimitMerged != null && incomingRedTime != null
              ? Math.min(incomingRedTime, redLimitMerged)
              : incomingRedTime);
          const stoppedBlueTime = prev.blue?.isRunning
            ? prev.blue?.time
            : (blueLimitMerged != null && incomingBlueTime != null
              ? Math.min(incomingBlueTime, blueLimitMerged)
              : incomingBlueTime);

          const next = {
            ...prev,
            matchID: incomingForMerge.matchID,
            matchName: incomingForMerge.matchName,
            classification: incomingForMerge.classification,
            category: incomingForMerge.category,
            red: {
              ...prev.red,
              name: incomingForMerge.red?.name,
              playerID: incomingForMerge.red?.playerID,
              limit: redLimitMerged,
              time: stoppedRedTime,
            },
            blue: {
              ...prev.blue,
              name: incomingForMerge.blue?.name,
              playerID: incomingForMerge.blue?.playerID,
              limit: blueLimitMerged,
              time: stoppedBlueTime,
            },
          };
          localStorage.setItem(storageKey, JSON.stringify(next));
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('scoreboardDataUpdate', {
              detail: { key: storageKey, data: next },
            }));
          });
          return next;
        });
      } else {
        setLocalData(mergedData);
        lastGameOnlyRunningRef.current = snapTimerRunningFlags(mergedData);
        localStorage.setItem(storageKey, JSON.stringify(mergedData));

        // 初回のみ：ファイルが存在しなかった場合、作成したデフォルトをサーバーに保存
        if (!settingsRes.ok || !gameRes.ok) {
          if (isCtrl) {
            saveToGameJson(mergedData);
          }
        }
      }
    } catch (err) {
      console.error('データ読み込みエラー:', err);
      if (!silent) {
        setError('データの読み込みに失敗しました');
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [id, court, isStandaloneMode, isCtrl]);

  // データを保存（設定と進行を分離して保存）
  // options.gameOnly: true のときは game.json のみ書き込む（タイマー等の高頻度更新で settings PUT を待たない）
  const saveToGameJson = useCallback(async (data, _options = {}) => {
    // スタンドアロンモードの場合は、サーバー保存をスキップ
    if (isStandaloneMode || !id || !court || !data) return;

    try {
      // 1. 設定データ (settings.json)
      const settingsToSave = {
        classification: data.classification,
        category: data.category,
        matchName: data.matchName,
        match: {
          totalEnds: data.match?.totalEnds,
          warmup: data.match?.warmup,
          interval: data.match?.interval,
          rules: data.match?.rules,
          resultApproval: data.match?.resultApproval,
          tieBreak: data.match?.tieBreak,
          sections: data.match?.sections
        },
        red: {
          name: data.red?.name,
          limit: data.red?.limit,
          country: data.red?.country,
          profilePic: data.red?.profilePic
        },
        blue: {
          name: data.blue?.name,
          limit: data.blue?.limit,
          country: data.blue?.country,
          profilePic: data.blue?.profilePic
        },
        warmup: { limit: data.warmup?.limit },
        interval: { limit: data.interval?.limit }
      };

      // 2. 進行データ (game.json)
      const gameStateToSave = buildGameJsonPutBody(data);

      // gameOnly は saveData 側で LocalStorage とまとめてデバウンスするためここには来ない
      // 非同期で両方のファイルを更新（設定変更時・初回整形など）
      await Promise.all([
        fetch(`/api/data/${id}/court/${court}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsToSave)
        }),
        fetch(`/api/data/${id}/court/${court}/game`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gameStateToSave)
        })
      ]);
    } catch (error) {
      console.error('保存エラー:', error);
    }
  }, [id, court, isStandaloneMode]);


  // Local Storageからデータを取得
  const loadFromLocalStorage = useCallback(() => {
    // スタンドアロンモードと大会モードでキーを分ける
    const storageKey = isStandaloneMode 
      ? 'scoreboard_standalone_data'
      : `scoreboard_${id}_${court}_data`;
    
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        setLocalData(JSON.parse(storedData));
      } catch (err) {
        console.error('Local Storage読み込みエラー:', err);
        setError('データの読み込みに失敗しました');
      }
    }
  }, [id, court, isStandaloneMode]);

  // データをLocal Storageに保存
  const saveToLocalStorage = useCallback((data) => {
    // スタンドアロンモードと大会モードでキーを分ける
    const key = isStandaloneMode 
      ? 'scoreboard_standalone_data'
      : `scoreboard_${id}_${court}_data`;
    
    localStorage.setItem(key, JSON.stringify(data));
    setLocalData(data);
    
    // 他のクライアントに変更を通知（CustomEventを使用）
    window.dispatchEvent(new CustomEvent('scoreboardDataUpdate', {
      detail: { key, data }
    }));
  }, [id, court, isStandaloneMode]);

  // データをLocal Storageとgame.jsonの両方に保存
  // options.gameOnly: true でサーバーは game.json のみ更新（進行中のタイマー・スコア等）
  // options.gameOnlyLocal: true のときは LS のみ（PUT しない）。タイマー実行中の tick 用。停止・スコア操作等は gameOnly のみ。
  const saveData = useCallback(async (data, options = {}) => {
    if (!data) return;
    
    // totalEndsが失われないように保護
    // data.matchが存在し、totalEndsが含まれていない場合のみ推測
    const protectedData = {
      ...data,
      match: data.match ? {
        ...data.match,
        // totalEndsが存在しない場合、sectionsから推測
        totalEnds: data.match.totalEnds ?? (data.match.sections 
          ? (() => {
              const endSections = data.match.sections.filter(s => s.startsWith('end'));
              if (endSections.length > 0) {
                const endNumbers = endSections.map(s => parseInt(s.replace('end', ''), 10));
                return Math.max(...endNumbers);
              }
              return 4; // デフォルト値
            })()
          : 4)
      } : data.match
    };

    const gameOnly = Boolean(options.gameOnly);
    const gameOnlyLocal = Boolean(options.gameOnlyLocal);

    // gameOnlyLocal: タイマー tick のみ。merge / PUT 競合を避けるためサーバーは触らない（view は storage で追随）
    if (isCtrl && gameOnly && gameOnlyLocal) {
      pendingGameOnlyLocalRef.current = protectedData;
      const nextRun = snapTimerRunningFlags(protectedData);
      lastGameOnlyRunningRef.current = nextRun;

      const performGameOnlyLocalFlush = () => {
        if (gameOnlyLocalTimerRef.current != null) {
          clearTimeout(gameOnlyLocalTimerRef.current);
          gameOnlyLocalTimerRef.current = null;
        }
        const d = pendingGameOnlyLocalRef.current;
        pendingGameOnlyLocalRef.current = null;
        if (!d || isStandaloneMode || !id || !court) {
          return;
        }
        saveToLocalStorage(d);
      };

      if (gameOnlyLocalTimerRef.current != null) {
        clearTimeout(gameOnlyLocalTimerRef.current);
      }
      gameOnlyLocalTimerRef.current = window.setTimeout(
        performGameOnlyLocalFlush,
        GAME_ONLY_DEBOUNCE_MS
      );
      return;
    }

    // フルの gameOnly に進むときは local-only の待ちを破棄（停止などが優先）
    if (gameOnlyLocalTimerRef.current != null) {
      clearTimeout(gameOnlyLocalTimerRef.current);
      gameOnlyLocalTimerRef.current = null;
    }
    pendingGameOnlyLocalRef.current = null;

    // gameOnly: LocalStorage + PUT を同一デバウンス（Surface Go 等で stringify / merge の連発を抑える）
    if (isCtrl && gameOnly) {
      pendingGameOnlyDataRef.current = protectedData;
      const prevRun = lastGameOnlyRunningRef.current;
      const nextRun = snapTimerRunningFlags(protectedData);
      const stopTransition =
        anyTimerStoppedTransition(prevRun, nextRun) || Boolean(options.gameOnlyImmediate);
      lastGameOnlyRunningRef.current = nextRun;

      const performGameOnlyFlush = () => {
        if (gameOnlyUnifiedTimerRef.current != null) {
          clearTimeout(gameOnlyUnifiedTimerRef.current);
          gameOnlyUnifiedTimerRef.current = null;
        }
        const d = pendingGameOnlyDataRef.current;
        pendingGameOnlyDataRef.current = null;
        if (!d || isStandaloneMode || !id || !court) {
          return;
        }
        saveToLocalStorage(d);
        const body = buildGameJsonPutBody(d);
        fetch(`/api/data/${id}/court/${court}/game`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).catch((error) => {
          console.error('保存エラー:', error);
        });
      };

      // タイマー停止時は遅延フラッシュが「停止より前の実行中スナップショット」になり得るため即書き込み
      if (stopTransition) {
        performGameOnlyFlush();
        return;
      }

      if (gameOnlyUnifiedTimerRef.current != null) {
        clearTimeout(gameOnlyUnifiedTimerRef.current);
      }
      gameOnlyUnifiedTimerRef.current = window.setTimeout(
        performGameOnlyFlush,
        GAME_ONLY_DEBOUNCE_MS
      );
      return;
    }

    saveToLocalStorage(protectedData);

    if (isCtrl) {
      await saveToGameJson(protectedData, options);
    }
  }, [saveToLocalStorage, saveToGameJson, isCtrl, id, court, isStandaloneMode]);

  // Local Storageの変更を監視
  useEffect(() => {
    // スタンドアロンモードと大会モードでキーを分ける
    const storageKey = isStandaloneMode 
      ? 'scoreboard_standalone_data'
      : `scoreboard_${id}_${court}_data`;
    
    const handleStorageChange = (e) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const newData = JSON.parse(e.newValue);
          setLocalData(newData);
        } catch (err) {
          console.error('Local Storage更新エラー:', err);
        }
      }
    };

    const handleCustomEvent = (e) => {
      if (e.detail.key === storageKey) {
        setLocalData(e.detail.data);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('scoreboardDataUpdate', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('scoreboardDataUpdate', handleCustomEvent);
    };
  }, [id, court, isStandaloneMode]);

  useEffect(() => {
    return () => {
      if (gameOnlyUnifiedTimerRef.current != null) {
        clearTimeout(gameOnlyUnifiedTimerRef.current);
        gameOnlyUnifiedTimerRef.current = null;
      }
      if (gameOnlyLocalTimerRef.current != null) {
        clearTimeout(gameOnlyLocalTimerRef.current);
        gameOnlyLocalTimerRef.current = null;
      }
    };
  }, []);

  /**
   * view かつ LocalStorage 命中時は loadGameData を呼ばないため、ここで init の表示設定だけ必ず同期する。
   */
  useEffect(() => {
    if (isStandaloneMode || !id) {
      setScoreboardPlayerNameFontSize(null);
      setShowClassification(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const initRes = await fetch(`/data/${encodeURIComponent(id)}/init.json`);
        if (cancelled) {
          return;
        }
        if (!initRes.ok) {
          setScoreboardPlayerNameFontSize(null);
          setShowClassification(true);
          return;
        }
        const initData = await initRes.json();
        if (cancelled) {
          return;
        }
        setScoreboardPlayerNameFontSize(parseScoreboardPlayerNameFontSizeFromInit(initData));
        setShowClassification(parseShowClassificationFromInit(initData));
      } catch {
        if (!cancelled) {
          setScoreboardPlayerNameFontSize(null);
          setShowClassification(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isStandaloneMode]);

  // 初期データ読み込み
  useEffect(() => {
    if (isStandaloneMode) {
      // スタンドアロンモードは常にloadGameData()を呼ぶ（LocalStorageから読み込む）
      loadGameData();
    } else if (isCtrl) {
      // 大会モードのctrlは常にサーバーから読み込み
      loadGameData();
    } else {
      // 大会モードのviewはLocalStorageを優先
      const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
      if (storedData) {
        loadFromLocalStorage();
      } else {
        loadGameData();
      }
    }
  }, [loadGameData, loadFromLocalStorage, isCtrl, id, court, isStandaloneMode]);

  // WebSocket を主経路として接続し、更新通知を受けたらサイレント再取得する
  useEffect(() => {
    if (!id || !court || isStandaloneMode) {
      setRealtimeStatus('disconnected');
      return undefined;
    }
    if (typeof window === 'undefined' || typeof window.WebSocket === 'undefined') {
      setRealtimeStatus('unsupported');
      return undefined;
    }

    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      clearReconnectTimer();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const endpoint = `${protocol}//${window.location.host}/api/realtime?eventId=${encodeURIComponent(id)}&courtId=${encodeURIComponent(court)}`;
      setRealtimeStatus('connecting');
      const ws = new window.WebSocket(endpoint);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          return;
        }
        reconnectAttemptsRef.current = 0;
        setRealtimeStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'scoreboard-updated') {
            // ctrl画面は本部配信由来の settings 更新のみを取り込む。
            // game更新まで追従すると、進行中のローカル状態を不意に上書きしやすい。
            if (isCtrl && payload?.filename !== 'settings') {
              return;
            }
            loadGameData({ silent: true });
          }
        } catch {
          // 想定外メッセージは無視
        }
      };

      ws.onclose = () => {
        if (disposed) {
          return;
        }
        setRealtimeStatus('degraded');
        reconnectAttemptsRef.current += 1;
        const retryMs = Math.min(1000 * (2 ** reconnectAttemptsRef.current), 10000);
        reconnectTimerRef.current = setTimeout(connect, retryMs);
      };

      ws.onerror = () => {
        setRealtimeStatus('degraded');
      };
    };

    connect();
    return () => {
      disposed = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      // OPEN のみここで閉じる。CONNECTING のまま unmount した場合は onopen 側の disposed 判定で閉じる
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      setRealtimeStatus('disconnected');
    };
  }, [id, court, isStandaloneMode, isCtrl, loadGameData]);

  // ポーリングはバックアップのみ（WS未対応/切断中のみ）
  useEffect(() => {
    if (!id || !court || isStandaloneMode) {
      return undefined;
    }
    if (isCtrl) {
      return undefined;
    }
    const shouldPoll = realtimeStatus === 'unsupported' || realtimeStatus === 'degraded' || realtimeStatus === 'disconnected';
    if (!shouldPoll) {
      return undefined;
    }
    const intervalMs = 3000;
    const timer = setInterval(() => {
      loadGameData({ silent: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [id, court, isStandaloneMode, isCtrl, loadGameData, realtimeStatus]);

  return {
    localData,
    isLoading,
    error,
    eventName,
    classificationCount,
    scoreboardPlayerNameFontSize,
    showClassification,
    saveToLocalStorage,
    saveData
  };
};
