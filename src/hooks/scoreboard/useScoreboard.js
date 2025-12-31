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
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('p'); // 'ctrl' または 'view'
  const isCtrl = mode === 'ctrl';
  const langParam = searchParams.get('l'); // 言語パラメータ ('en' または 'ja')

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

  // タイマー時間更新コールバック（ctrlモードでのみ保存）
  const handleRedTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        red: {
          ...gameData.red,
          time: newTime
        }
      };
      saveData(updatedGameData);
    }
  }, [isCtrl, saveData, gameData]);

  const handleBlueTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        blue: {
          ...gameData.blue,
          time: newTime
        }
      };
      saveData(updatedGameData);
    }
  }, [isCtrl, saveData, gameData]);

  const handleWarmupTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        warmup: {
          ...gameData.warmup,
          time: newTime
        }
      };
      saveData(updatedGameData);
    }
  }, [isCtrl, saveData, gameData]);

  const handleIntervalTimeUpdate = useCallback((newTime) => {
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        interval: {
          ...gameData.interval,
          time: newTime
        }
      };
      saveData(updatedGameData);
    }
  }, [isCtrl, saveData, gameData]);

  // タイマー管理（デフォルト値を設定）
  const redTimer = useTimerManagement({
    initialTime: gameData.red.time !== undefined ? gameData.red.time : gameData.red.limit,
    isRunning: gameData.red.isRun || false,
    enableAudio: true,
    onTimeUpdate: handleRedTimeUpdate,
    isViewMode: !isCtrl,
    timerType: 'red'
  });

  const blueTimer = useTimerManagement({
    initialTime: gameData.blue.time !== undefined ? gameData.blue.time : gameData.blue.limit,
    isRunning: gameData.blue.isRun || false,
    enableAudio: true,
    onTimeUpdate: handleBlueTimeUpdate,
    isViewMode: !isCtrl,
    timerType: 'blue'
  });

  const warmupTimer = useTimerManagement({
    initialTime: gameData.warmup.time !== undefined ? gameData.warmup.time : gameData.warmup.limit,
    isRunning: gameData.warmup.isRun || false,
    enableAudio: true,
    onTimeUpdate: handleWarmupTimeUpdate,
    isViewMode: !isCtrl,
    timerType: 'warmup'
  });

  const intervalTimer = useTimerManagement({
    initialTime: gameData.interval.time !== undefined ? gameData.interval.time : gameData.interval.limit,
    isRunning: gameData.interval.isRun || false,
    enableAudio: true,
    onTimeUpdate: handleIntervalTimeUpdate,
    isViewMode: !isCtrl,
    timerType: 'interval'
  });

  // ゲームデータから値を取得
  const { match, warmup, interval, red, blue, screen } = gameData;
  const { sectionID, section, end, tieBreak } = match || {};
  const { setColor, scoreAdjusting } = screen || {};
  const active = screen?.active || '';


  // プレイヤー名を取得
  const redName = gameData?.red?.name || getPlayerName(red);
  const blueName = gameData?.blue?.name || getPlayerName(blue);

  // イベントハンドラー
  const handlers = useScoreboardHandlers({
    gameData,
    updateField,
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
    const isRunning = !gameData.warmup.isRun;
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
          isRun: isRunning,
          time: currentTime
        }
      };
      saveData(updatedGameData);
    }
  }, [gameData, warmupTimer.remainingMs, updateTimer, isCtrl, saveData]);

  // インターバルタイマー切り替えハンドラー（intervalTimer.remainingMsを使用）
  const handleIntervalTimerToggle = useCallback(() => {
    const isRunning = !gameData.interval.isRun;
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
          isRun: isRunning,
          time: currentTime
        }
      };
      saveData(updatedGameData);
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

  // bodyのdata-mode属性を設定
  useEffect(() => {
    const dataMode = isCtrl ? 'ctrl' : 'view';
    document.body.setAttribute('data-mode', dataMode);
    
    return () => {
      document.body.removeAttribute('data-mode');
    };
  }, [isCtrl]);

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
          handlers.handleTimerToggle('red', !gameData.red.isRun, redTimer.remainingMs);
          break;
        case '2':
          event.preventDefault();
          handlers.handleTimerToggle('blue', !gameData.blue.isRun, blueTimer.remainingMs);
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
    if (redTimer.remainingMs <= 0 && gameData.red.isRun && !redTimerEndedRef.current) {
      redTimerEndedRef.current = true;
      handlers.handleTimerEnd();
      // タイマーを停止し、ballを0にする
      updateTimer('red', 0, false);
      updateBall('red', 0);
      
      // screen.activeを空にする（ctrlモードのみ）
      if (isCtrl) {
        updateScreenActive('');
      }
      
      // ctrlモードの場合のみ保存
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          red: {
            ...gameData.red,
            isRun: false,
            time: 0,
            ball: 0
          },
          screen: {
            ...gameData.screen,
            active: ''
          }
        };
        saveData(updatedGameData);
      }
    } else if (gameData.red.isRun && redTimer.remainingMs > 0) {
      // タイマーが再開されたらフラグをリセット
      redTimerEndedRef.current = false;
    }
  }, [redTimer.remainingMs, gameData.red.isRun, handlers, updateTimer, updateBall, updateScreenActive, isCtrl, saveData, gameData]);

  useEffect(() => {
    if (blueTimer.remainingMs <= 0 && gameData.blue.isRun && !blueTimerEndedRef.current) {
      blueTimerEndedRef.current = true;
      handlers.handleTimerEnd();
      // タイマーを停止し、ballを0にする
      updateTimer('blue', 0, false);
      updateBall('blue', 0);
      
      // screen.activeを空にする（ctrlモードのみ）
      if (isCtrl) {
        updateScreenActive('');
      }
      
      // ctrlモードの場合のみ保存
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          blue: {
            ...gameData.blue,
            isRun: false,
            time: 0,
            ball: 0
          },
          screen: {
            ...gameData.screen,
            active: ''
          }
        };
        saveData(updatedGameData);
      }
    } else if (gameData.blue.isRun && blueTimer.remainingMs > 0) {
      // タイマーが再開されたらフラグをリセット
      blueTimerEndedRef.current = false;
    }
  }, [blueTimer.remainingMs, gameData.blue.isRun, handlers, updateTimer, updateBall, updateScreenActive, isCtrl, saveData, gameData]);

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
      updateField('screen', 'penaltyThrow', true);
      
      // データを保存
      if (saveData) {
        const updatedGameData = {
          ...gameData,
          red: {
            ...gameData.red,
            ball: redPenaltyBall,
            time: redPenaltyBall > 0 ? 60000 : gameData.red.time,
            isRun: false
          },
          blue: {
            ...gameData.blue,
            ball: bluePenaltyBall,
            time: bluePenaltyBall > 0 ? 60000 : gameData.blue.time,
            isRun: false
          },
          screen: {
            ...gameData.screen,
            penaltyThrow: true
          }
        };
        saveData(updatedGameData);
      }
    }
    // 赤・青両方のペナルティボールが0になった場合、penaltyThrow中を終了
    if (redPenaltyBall === 0 && bluePenaltyBall === 0 && gameData.screen?.penaltyThrow) {
      updateField('screen', 'penaltyThrow', false);
      if (saveData) {
        const updatedGameData = {
          ...gameData,
          screen: {
            ...gameData.screen,
            penaltyThrow: false
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [gameData.red?.ball, gameData.blue?.ball, gameData.red?.penaltyBall, gameData.blue?.penaltyBall, isCtrl, updateTimer, updateBall, saveData, gameData]);

  useEffect(() => {
    if (warmupTimer.remainingMs <= 0 && gameData.warmup.isRun) {
      handlers.handleTimerEnd();
      // ウォームアップタイマーが0になったら次のセクションへ移行
      handlers.handleNextSection();
    }
  }, [warmupTimer.remainingMs, gameData.warmup.isRun, handlers]);

  useEffect(() => {
    if (intervalTimer.remainingMs <= 0 && gameData.interval.isRun) {
      handlers.handleTimerEnd();
      // インターバルタイマーが0になったら次のセクションへ移行
      handlers.handleNextSection();
    }
  }, [intervalTimer.remainingMs, gameData.interval.isRun, handlers]);

  // 勝敗判定
  const { isTie } = determineWinner(gameData.red.score, gameData.blue.score);
  const isLastEndSection = isLastEnd(section, gameData.match.ends);

  return {
    // URL パラメータ
    id,
    court,
    isCtrl,
    
    // 状態
    active,
    scoreAdjusting,
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
    setColor,
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
