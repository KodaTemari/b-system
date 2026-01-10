import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useGameState } from './useGameState';
import { useTimerManagement } from './useTimerManagement';
import { useDataSync } from './useDataSync';
import { useScoreboardHandlers } from './useScoreboardHandlers';
import { getPlayerName, isLastEnd, determineWinner } from '../../utils/scoreboard/gameLogic';
import { setLanguage, getCurrentLanguage } from '../../locales';

/**
 * スコアボードのメインロジックを統合したカスタムフック
 */
export const useScoreboard = () => {
  // URL パラメータとクエリパラメータ
  const { id, court } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('p'); // 'ctrl' または 'view'
  const isCtrl = mode === 'ctrl';
  const langParam = searchParams.get('l'); // 言語パラメータ ('en' または 'ja')
  const classParam = searchParams.get('c'); // クラスパラメータ (例: 'BC1')
  const genderParam = searchParams.get('g'); // 性別パラメータ (例: 'm', 'f', または空)

  // 状態管理
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage()); // 言語状態（再レンダリング用）

  // データ同期
  const { localData, isLoading, error, saveData } = useDataSync(id, 'FRD', court, isCtrl);

  // ゲーム状態管理（localDataを初期データとして使用）
  const {
    gameData,
    updateField,
    updateDirectField,
    updateScore,
    updateTimer,
    updateBall,
    updateSection,
    updateConfirmColor,
    updateScreenActive,
    updateScoreAdjusting,
    updatePlayerName,
    resetForFinalShot
  } = useGameState(localData, isCtrl);

  // 表示上の数字が変わった時のみ保存するためのref（秒単位）
  const lastSavedRedDisplayTimeRef = useRef(null);
  const lastSavedBlueDisplayTimeRef = useRef(null);
  const lastSavedWarmupDisplayTimeRef = useRef(null);
  const lastSavedIntervalDisplayTimeRef = useRef(null);

  // タイマー時間更新コールバック（ctrlモードでのみ保存）
  // 0.1秒ごとに呼ばれるが、表示上の数字が変わった時（1秒ごと）のみ保存
  const handleRedTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      // 表示上の数字（秒単位）を計算
      const displayTimeSeconds = Math.floor(newTime / 1000);
      
      // 表示上の数字が変わった時のみ保存（負荷軽減のため）
      if (lastSavedRedDisplayTimeRef.current !== displayTimeSeconds) {
        lastSavedRedDisplayTimeRef.current = displayTimeSeconds;
        
        const updatedGameData = {
          ...gameData,
          red: {
            ...gameData.red,
            time: newTime
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [isCtrl, saveData, gameData]);

  const handleBlueTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      // 表示上の数字（秒単位）を計算
      const displayTimeSeconds = Math.floor(newTime / 1000);
      
      // 表示上の数字が変わった時のみ保存（負荷軽減のため）
      if (lastSavedBlueDisplayTimeRef.current !== displayTimeSeconds) {
        lastSavedBlueDisplayTimeRef.current = displayTimeSeconds;
        
        const updatedGameData = {
          ...gameData,
          blue: {
            ...gameData.blue,
            time: newTime
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [isCtrl, saveData, gameData]);

  // タイマー停止時のコールバック（0.1秒単位で保存）
  // gameDataの依存を避けるため、refを使用して最新の値を取得
  const gameDataRef = useRef(gameData);
  useEffect(() => {
    gameDataRef.current = gameData;
  }, [gameData]);

  const handleRedTimerStop = useCallback((newTime) => {
    if (isCtrl && saveData) {
      // refから最新のgameDataを取得
      const currentGameData = gameDataRef.current;
      const updatedGameData = {
        ...currentGameData,
        red: {
          ...currentGameData.red,
          time: newTime,
          isRunning: false
        }
      };
      saveData(updatedGameData);
      // 保存済み表示時間のrefを更新
      lastSavedRedDisplayTimeRef.current = Math.floor(newTime / 1000);
    }
  }, [isCtrl, saveData]);

  const handleBlueTimerStop = useCallback((newTime) => {
    if (isCtrl && saveData) {
      // refから最新のgameDataを取得
      const currentGameData = gameDataRef.current;
      const updatedGameData = {
        ...currentGameData,
        blue: {
          ...currentGameData.blue,
          time: newTime,
          isRunning: false
        }
      };
      saveData(updatedGameData);
      // 保存済み表示時間のrefを更新
      lastSavedBlueDisplayTimeRef.current = Math.floor(newTime / 1000);
    }
  }, [isCtrl, saveData]);

  const handleWarmupTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      // 表示上の数字（秒単位）を計算
      const displayTimeSeconds = Math.floor(newTime / 1000);
      
      // 表示上の数字が変わった時のみ保存（負荷軽減のため）
      if (lastSavedWarmupDisplayTimeRef.current !== displayTimeSeconds) {
        lastSavedWarmupDisplayTimeRef.current = displayTimeSeconds;
        
        const updatedGameData = {
          ...gameData,
          warmup: {
            ...gameData.warmup,
            time: newTime
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [isCtrl, saveData, gameData]);

  const handleIntervalTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      // 表示上の数字（秒単位）を計算
      const displayTimeSeconds = Math.floor(newTime / 1000);
      
      // 表示上の数字が変わった時のみ保存（負荷軽減のため）
      if (lastSavedIntervalDisplayTimeRef.current !== displayTimeSeconds) {
        lastSavedIntervalDisplayTimeRef.current = displayTimeSeconds;
        
        const updatedGameData = {
          ...gameData,
          interval: {
            ...gameData.interval,
            time: newTime
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [isCtrl, saveData, gameData]);

  // タイマー管理（デフォルト値を設定）
  const redTimer = useTimerManagement({
    initialTime: gameData.red.time !== undefined ? gameData.red.time : gameData.red.limit,
    isRunning: gameData.red.isRunning || false,
    enableAudio: true,
    onTimeUpdate: handleRedTimeUpdate,
    onTimerStop: handleRedTimerStop,
    isViewMode: !isCtrl,
    timerType: 'red'
  });

  const blueTimer = useTimerManagement({
    initialTime: gameData.blue.time !== undefined ? gameData.blue.time : gameData.blue.limit,
    isRunning: gameData.blue.isRunning || false,
    enableAudio: true,
    onTimeUpdate: handleBlueTimeUpdate,
    onTimerStop: handleBlueTimerStop,
    isViewMode: !isCtrl,
    timerType: 'blue'
  });

  // initialTimeが変更されたときに、保存済み表示時間のrefをリセット
  useEffect(() => {
    if (gameData.red.time !== undefined) {
      lastSavedRedDisplayTimeRef.current = Math.floor(gameData.red.time / 1000);
    }
  }, [gameData.red.time]);

  useEffect(() => {
    if (gameData.blue.time !== undefined) {
      lastSavedBlueDisplayTimeRef.current = Math.floor(gameData.blue.time / 1000);
    }
  }, [gameData.blue.time]);

  useEffect(() => {
    if (gameData.warmup.time !== undefined) {
      lastSavedWarmupDisplayTimeRef.current = Math.floor(gameData.warmup.time / 1000);
    }
  }, [gameData.warmup.time]);

  useEffect(() => {
    if (gameData.interval.time !== undefined) {
      lastSavedIntervalDisplayTimeRef.current = Math.floor(gameData.interval.time / 1000);
    }
  }, [gameData.interval.time]);

  const warmupTimer = useTimerManagement({
    initialTime: gameData.warmup.time !== undefined ? gameData.warmup.time : gameData.warmup.limit,
    isRunning: gameData.warmup.isRunning || false,
    enableAudio: true,
    onTimeUpdate: handleWarmupTimeUpdate,
    isViewMode: !isCtrl,
    timerType: 'warmup'
  });

  const intervalTimer = useTimerManagement({
    initialTime: gameData.interval.time !== undefined ? gameData.interval.time : gameData.interval.limit,
    isRunning: gameData.interval.isRunning || false,
    enableAudio: true,
    onTimeUpdate: handleIntervalTimeUpdate,
    isViewMode: !isCtrl,
    timerType: 'interval'
  });

  // ゲームデータから値を取得
  const { match, warmup, interval, red, blue, screen } = gameData;
  const { sectionID, section, end, tieBreak } = match || {};
  const { isColorSet, isScoreAdjusting } = screen || {};
  const active = screen?.active || '';


  // プレイヤー名を取得
  const redName = gameData?.red?.name || getPlayerName(red);
  const blueName = gameData?.blue?.name || getPlayerName(blue);

  // イベントハンドラー
  const handlers = useScoreboardHandlers({
    gameData,
    updateField,
    updateDirectField,
    updateScore,
    updateTimer,
    updateBall,
    updateSection,
    resetForFinalShot,
    updateScreenActive,
    updateScoreAdjusting,
    setShowTimeModal,
    saveData,
    isCtrl,
    currentLang,
    id,
    court
  });

  // ウォームアップタイマー切り替えハンドラー（warmupTimer.remainingMsを使用）
  const handleWarmupTimerToggle = useCallback(() => {
    const isRunning = !gameData.warmup.isRunning;
    // 現在の残り時間を使用（タイマーが動いている場合はwarmupTimer.remainingMs、停止している場合はgameData.warmup.time）
    // タイマーを停止するときは、現在の残り時間を保存する
    const currentTime = isRunning 
      ? (gameData.warmup.time !== undefined ? gameData.warmup.time : gameData.warmup.limit)
      : warmupTimer.remainingMs;
    
    // タイマーの開始/停止を切り替え
    updateTimer('warmup', currentTime, isRunning);
    
    // ctrlモードの場合のみ保存
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        warmup: {
          ...gameData.warmup,
          isRunning: isRunning,
          time: currentTime
        }
      };
      saveData(updatedGameData);
      // 保存済み表示時間のrefを更新
      lastSavedWarmupDisplayTimeRef.current = Math.floor(currentTime / 1000);
    }
  }, [gameData, warmupTimer.remainingMs, updateTimer, isCtrl, saveData]);

  // インターバルタイマー切り替えハンドラー（intervalTimer.remainingMsを使用）
  const handleIntervalTimerToggle = useCallback(() => {
    const isRunning = !gameData.interval.isRunning;
    // 現在の残り時間を使用（タイマーが動いている場合はintervalTimer.remainingMs、停止している場合はgameData.interval.time）
    // タイマーを停止するときは、現在の残り時間を保存する
    const currentTime = isRunning 
      ? (gameData.interval.time !== undefined ? gameData.interval.time : gameData.interval.limit)
      : intervalTimer.remainingMs;
    
    // タイマーの開始/停止を切り替え
    updateTimer('interval', currentTime, isRunning);
    
    // ctrlモードの場合のみ保存
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        interval: {
          ...gameData.interval,
          isRunning: isRunning,
          time: currentTime
        }
      };
      saveData(updatedGameData);
      // 保存済み表示時間のrefを更新
      lastSavedIntervalDisplayTimeRef.current = Math.floor(currentTime / 1000);
    }
  }, [gameData, intervalTimer.remainingMs, updateTimer, isCtrl, saveData]);

  // URLパラメータから言語を設定
  useEffect(() => {
    if (langParam === 'en' || langParam === 'ja') {
      setLanguage(langParam);
      setCurrentLang(langParam);
    }
  }, [langParam]);

  // 言語変更イベントをリッスンして再レンダリングをトリガー
  useEffect(() => {
    const handleLanguageChange = (event) => {
      setCurrentLang(event.detail.language);
    };

    window.addEventListener('languageChanged', handleLanguageChange);
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange);
    };
  }, []);

  // LocalStorageとBroadcastChannelで他のタブからの言語変更を監視（ctrl画面とview画面の連動のため）
  useEffect(() => {
    // LocalStorageから初期言語を読み込む
    const storedLang = localStorage.getItem('scoreboard_language');
    if (storedLang === 'en' || storedLang === 'ja') {
      if (storedLang !== getCurrentLanguage()) {
        setLanguage(storedLang);
        setCurrentLang(storedLang);
        // URLパラメータも更新
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.set('l', storedLang);
          return newParams;
        });
      }
    }

    // BroadcastChannelで他のタブからの言語変更を監視
    const channel = new BroadcastChannel('scoreboard_language');
    channel.onmessage = (event) => {
      const { language } = event.data;
      if (language === 'en' || language === 'ja') {
        setLanguage(language);
        setCurrentLang(language);
        // URLパラメータも更新
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.set('l', language);
          return newParams;
        });
        // 言語変更イベントを発火
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
      }
    };

    // LocalStorageの変更を監視（同じタブ内での変更も検知）
    const handleStorageChange = (e) => {
      if (e.key === 'scoreboard_language' && e.newValue) {
        const newLang = e.newValue;
        if (newLang === 'en' || newLang === 'ja') {
          if (newLang !== getCurrentLanguage()) {
            setLanguage(newLang);
            setCurrentLang(newLang);
            // URLパラメータも更新
            setSearchParams(prev => {
              const newParams = new URLSearchParams(prev);
              newParams.set('l', newLang);
              return newParams;
            });
            // 言語変更イベントを発火
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: newLang } }));
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [setSearchParams]);

  // bodyのdata-modeとdata-scene属性を設定
  useEffect(() => {
    const dataMode = isCtrl ? 'ctrl' : 'view';
    const dataScene = gameData.scene || 'official';
    document.body.setAttribute('data-mode', dataMode);
    document.body.setAttribute('data-scene', dataScene);
    
    return () => {
      document.body.removeAttribute('data-mode');
      document.body.removeAttribute('data-scene');
    };
  }, [isCtrl, gameData.scene]);

  // data-mode="view"の時にURLを書き換え
  // 将来的に本部システムと連携する際には不要になる可能性があるため、コメント化
  // useEffect(() => {
  //   if (!isCtrl && !mode) {
  //     // 現在のURLパスを取得し、?p=viewを追加
  //     const currentPath = window.location.pathname;
  //     const newUrl = `${currentPath}?p=view`;
  //     window.history.replaceState({}, '', newUrl);
  //   }
  // }, [isCtrl, mode]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (event) => {
      // 入力フィールドにフォーカスがある場合は無視
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }
      
      switch(event.key) {
        case '1':
          event.preventDefault();
          handlers.handleTimerToggle('red', !gameData.red.isRunning, redTimer.remainingMs);
          break;
        case '2':
          event.preventDefault();
          handlers.handleTimerToggle('blue', !gameData.blue.isRunning, blueTimer.remainingMs);
          break;
        default:
          break;
        case '0':
          event.preventDefault();
          updateTimer('red', 300000, false);
          updateTimer('blue', 300000, false);
          updateField('warmup', 'time', 120000);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlers, gameData, redTimer.remainingMs, blueTimer.remainingMs]);

  // タイマー終了時の処理（一度だけ実行されるようにrefを使用）
  const redTimerEndedRef = useRef(false);
  const blueTimerEndedRef = useRef(false);
  
  useEffect(() => {
    if (redTimer.remainingMs <= 0 && gameData.red.isRunning && !redTimerEndedRef.current) {
      redTimerEndedRef.current = true;
      handlers.handleTimerEnd();
      // タイマーを停止し、ballを0にする
      updateTimer('red', 0, false);
      updateBall('red', 0);
      
      // 他のタイマーが動いていない場合のみscreen.activeを空にする
      if (isCtrl && !gameData.blue.isRunning) {
        updateScreenActive('');
      }
      
      // ctrlモードの場合のみ保存
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          red: {
            ...gameData.red,
            isRunning: false,
            time: 0,
            ball: 0
          }
        };
        // 他のタイマーが動いていない場合のみscreen.activeを空にする
        if (!gameData.blue.isRunning) {
          updatedGameData.screen = {
            ...gameData.screen,
            active: ''
          };
        }
        saveData(updatedGameData);
      }
    } else if (gameData.red.isRunning && redTimer.remainingMs > 0) {
      // タイマーが再開されたらフラグをリセット
      redTimerEndedRef.current = false;
    }
  }, [redTimer.remainingMs, gameData.red.isRunning, gameData.blue.isRunning, handlers, updateTimer, updateBall, updateScreenActive, isCtrl, saveData, gameData]);

  useEffect(() => {
    if (blueTimer.remainingMs <= 0 && gameData.blue.isRunning && !blueTimerEndedRef.current) {
      blueTimerEndedRef.current = true;
      handlers.handleTimerEnd();
      // タイマーを停止し、ballを0にする
      updateTimer('blue', 0, false);
      updateBall('blue', 0);
      
      // 他のタイマーが動いていない場合のみscreen.activeを空にする
      if (isCtrl && !gameData.red.isRunning) {
        updateScreenActive('');
      }
      
      // ctrlモードの場合のみ保存
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          blue: {
            ...gameData.blue,
            isRunning: false,
            time: 0,
            ball: 0
          }
        };
        // 他のタイマーが動いていない場合のみscreen.activeを空にする
        if (!gameData.red.isRunning) {
          updatedGameData.screen = {
            ...gameData.screen,
            active: ''
          };
        }
        saveData(updatedGameData);
      }
    } else if (gameData.blue.isRunning && blueTimer.remainingMs > 0) {
      // タイマーが再開されたらフラグをリセット
      blueTimerEndedRef.current = false;
    }
  }, [blueTimer.remainingMs, gameData.blue.isRunning, gameData.red.isRunning, handlers, updateTimer, updateBall, updateScreenActive, isCtrl, saveData, gameData]);

  // ペナルティースロー表示の判定（ボール数が0で、ペナルティーボールが1以上）
  useEffect(() => {
    if (!isCtrl) return;
    
    const redBall = gameData.red?.ball || 0;
    const blueBall = gameData.blue?.ball || 0;
    const redPenaltyBall = gameData.red?.penaltyBall || 0;
    const bluePenaltyBall = gameData.blue?.penaltyBall || 0;
    
    // ボール数が0で、ペナルティーボールが1以上の場合、penaltyThrow中に切り替え
    if (redBall === 0 && blueBall === 0 && (redPenaltyBall > 0 || bluePenaltyBall > 0)) {
      // ペナルティーボールを持っているサイドのタイマーを1分（60000ms）に設定
      // 両方のサイドにペナルティーボールがある場合は、両方のタイマーを1分に設定
      if (redPenaltyBall > 0 && gameData.red.time !== 60000) {
        updateTimer('red', 60000, false);
      }
      if (bluePenaltyBall > 0 && gameData.blue.time !== 60000) {
        updateTimer('blue', 60000, false);
      }
      
      // ペナルティーボールの数だけ各サイドのボールを復活
      if (gameData.red.ball !== redPenaltyBall) {
        updateBall('red', redPenaltyBall);
      }
      if (gameData.blue.ball !== bluePenaltyBall) {
        updateBall('blue', bluePenaltyBall);
      }
      
      // penaltyThrow中の状態をgameDataに保存
      updateField('screen', 'isPenaltyThrow', true);
      
      // データを保存
      if (saveData) {
        const updatedGameData = {
          ...gameData,
          red: {
            ...gameData.red,
            ball: redPenaltyBall,
            time: redPenaltyBall > 0 ? 60000 : gameData.red.time,
            isRunning: false
          },
          blue: {
            ...gameData.blue,
            ball: bluePenaltyBall,
            time: bluePenaltyBall > 0 ? 60000 : gameData.blue.time,
            isRunning: false
          },
          screen: {
            ...gameData.screen,
            isPenaltyThrow: true
          }
        };
        saveData(updatedGameData);
      }
    }
    // 赤・青両方のペナルティボールが0になった場合、penaltyThrow中を終了
    if (redPenaltyBall === 0 && bluePenaltyBall === 0 && gameData.screen?.isPenaltyThrow) {
      updateField('screen', 'isPenaltyThrow', false);
      if (saveData) {
        const updatedGameData = {
          ...gameData,
          screen: {
            ...gameData.screen,
            isPenaltyThrow: false
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [gameData.red?.ball, gameData.blue?.ball, gameData.red?.penaltyBall, gameData.blue?.penaltyBall, isCtrl, updateTimer, updateBall, saveData, gameData]);

  useEffect(() => {
    if (warmupTimer.remainingMs <= 0 && gameData.warmup.isRunning) {
      handlers.handleTimerEnd();
      // ウォームアップタイマーが0になったら次のセクションへ移行
      handlers.handleNextSection();
    }
  }, [warmupTimer.remainingMs, gameData.warmup.isRunning, handlers]);

  useEffect(() => {
    if (intervalTimer.remainingMs <= 0 && gameData.interval.isRunning) {
      handlers.handleTimerEnd();
      // インターバルタイマーが0になったら次のセクションへ移行
      handlers.handleNextSection();
    }
  }, [intervalTimer.remainingMs, gameData.interval.isRunning, handlers]);

  // 勝敗判定
  const { isTie } = determineWinner(gameData.red.score, gameData.blue.score);
  const isLastEndSection = isLastEnd(section, gameData.match.ends);

  return {
    // URL パラメータ
    id,
    court,
    isCtrl,
    setSearchParams,
    classParam,
    genderParam,
    
    // 状態
    active,
    isScoreAdjusting,
    showTimeModal,
    settingOpen,
    setSettingOpen,
    currentLang,
    
    // データ
    localData,
    isLoading,
    error,
    gameData,
    
    // ゲーム情報
    match,
    section,
    sectionID,
    end,
    tieBreak,
    warmup,
    interval,
    red,
    blue,
    isColorSet,
    redName,
    blueName,
    category: gameData.category,
    matchName: gameData.matchName,
    classification: gameData.classification,
    
    // タイマー
    redTimer,
    blueTimer,
    warmupTimer,
    intervalTimer,
    
    // 判定
    isTie,
    isLastEndSection,
    
    // ゲーム状態更新関数
    updateConfirmColor,
    saveData,
    updateField,
    updateDirectField,
    
    // ハンドラー
    ...handlers,
    // ウォームアップタイマー切り替えハンドラーを上書き
    handleWarmupTimerToggle,
    // インターバルタイマー切り替えハンドラーを上書き
    handleIntervalTimerToggle,
    // エンド再開ハンドラー
    handleRestartEnd: handlers.handleRestartEnd
  };
};
