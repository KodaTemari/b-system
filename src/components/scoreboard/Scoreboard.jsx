import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useScoreboard } from '../../hooks/scoreboard/useScoreboard';
import { getText as getLocalizedText, getCurrentLanguage } from '../../locales';
import { calculateBallCount } from '../../utils/scoreboard/gameLogic';
import { TIMER_LIMITS } from '../../utils/scoreboard/constants';
import Header from './ui/Header';
import PlayerInfoPanel from './ui/PlayerInfoPanel';
import SectionNav from './ui/SectionNav';
import SettingModal from './ui/SettingModal';
import PenaltyModal from './ui/PenaltyModal';
import TimeoutModal from './ui/TimeoutModal';
import TimeoutTimerModal from './ui/TimeoutTimerModal';
import ConfirmModal from './ui/ConfirmModal';
import ResultTable from './ui/ResultTable';
import './Scoreboard.css';

/**
 * メインのスコアボードコンポーネント
 */
const Scoreboard = () => {
  // Main game state
  const {
    // URL Params
    isCtrl,
    setSearchParams,
    classParam,
    genderParam,

    // State
    active,
    isScoreAdjusting,
    showTimeModal,
    settingOpen,
    setSettingOpen,
    currentLang,

    // Data
    gameData,
    isLoading,
    error,

    // URL Params
    id,
    court,

    // Game Info
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
    category,
    matchName,
    classification,

    // Timers
    redTimer,
    blueTimer,
    warmupTimer,
    intervalTimer,

    // Logic
    isTie,

    // Handlers
    handleSelect,
    scoreAdjust,
    handleTimerToggle,
    handleBallChange,
    handleNextSection,
    handleStartWarmup,
    handleWarmupTimerToggle,
    handleIntervalTimerToggle,
    handleTieBreak,
    handleTieBreakSelect,
    handleRestartEnd,
    handleReset,
    handleEndsSelect,
    handleTimeAdjust,
    handleSwapTeamNames,
    getText,
    updateConfirmColor,
    saveData,
    updateField,
    updateDirectField
  } = useScoreboard();

  // Tracks pending changes in the settings modal
  const [settingPendingChanges, setSettingPendingChanges] = useState({});

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('フルスクリーンに移行できませんでした', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('フルスクリーンを終了できませんでした', err);
      });
    }
  }, []);


  // Clear settingPendingChanges when gameData updates to match (Optimistic UI sync)
  useEffect(() => {
    if (Object.keys(settingPendingChanges).length === 0) return;

    const newPending = { ...settingPendingChanges };
    let changed = false;

    Object.entries(newPending).forEach(([key, pendingValue]) => {
      const [parent, child] = key.split('.');
      let gameValue;

      if (child) {
        gameValue = gameData?.[parent]?.[child];
      } else {
        gameValue = gameData?.[parent];
      }

      if (gameValue !== undefined && gameValue === pendingValue) {
        delete newPending[key];
        changed = true;
      }
    });

    if (changed) {
      setSettingPendingChanges(newPending);
    }
  }, [gameData, settingPendingChanges]);

  const handleSettingModalOpen = () => {
    setSettingOpen(true);
    document.getElementById('settingModal').showModal();
  };

  const handleSettingModalClose = () => {
    setSettingOpen(false);
    document.getElementById('settingModal').close();
  };

  const [penaltyModalOpen, setPenaltyModalOpen] = useState(false);
  const [selectedTeamColor, setSelectedTeamColor] = useState(null);

  const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);
  const [selectedTimeoutTeamColor, setSelectedTimeoutTeamColor] = useState(null);
  const [timeoutTimerModalOpen, setTimeoutTimerModalOpen] = useState(false);
  const [timeoutTimerTeamColor, setTimeoutTimerTeamColor] = useState(null);
  const [timeoutTimerType, setTimeoutTimerType] = useState(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingPenalty, setPendingPenalty] = useState(null); // { teamColor, penaltyId }
  const [pendingReset, setPendingReset] = useState(false);

  const isPenaltyThrow = gameData?.screen?.isPenaltyThrow || false;

  const handlePenaltyClick = (teamColor) => {
    setSelectedTeamColor(teamColor);
    setPenaltyModalOpen(true);
    setTimeout(() => {
      const dialog = document.getElementById('penaltyModal');
      if (dialog) {
        dialog.showModal();
      }
    }, 0);
  };

  const handleTimeoutClick = (teamColor) => {
    setSelectedTimeoutTeamColor(teamColor);
    setTimeoutModalOpen(true);
  };

  useEffect(() => {
    if (timeoutModalOpen && selectedTimeoutTeamColor) {
      const dialog = document.getElementById('timeoutModal');
      if (dialog) {
        dialog.showModal();
      }
    }
  }, [timeoutModalOpen, selectedTimeoutTeamColor]);

  useEffect(() => {
    if (timeoutTimerModalOpen && timeoutTimerTeamColor && timeoutTimerType) {
      const dialog = document.getElementById('timeoutTimerModal');
      if (dialog) {
        dialog.showModal();
      }
    } else {
      const dialog = document.getElementById('timeoutTimerModal');
      if (dialog) {
        dialog.close();
      }
    }
  }, [timeoutTimerModalOpen, timeoutTimerTeamColor, timeoutTimerType]);

  // Monitor timeout timers from LocalStorage (Syncs between ctrl/view)
  useEffect(() => {
    const checkTimeoutTimers = () => {
      const timeoutTypes = ['medical', 'technical'];
      const teamColors = ['red', 'blue'];

      for (const teamColor of teamColors) {
        for (const timeoutType of timeoutTypes) {
          const storageKey = `timeout_${teamColor}_${timeoutType}`;
          try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
              const data = JSON.parse(stored);
              if (data.isRunning && data.time > 0) {
                if (!timeoutTimerModalOpen || timeoutTimerTeamColor !== teamColor || timeoutTimerType !== timeoutType) {
                  setTimeoutTimerTeamColor(teamColor);
                  setTimeoutTimerType(timeoutType);
                  setTimeoutTimerModalOpen(true);
                }
              } else if (!data.isRunning && timeoutTimerModalOpen && timeoutTimerTeamColor === teamColor && timeoutTimerType === timeoutType) {
                setTimeoutTimerModalOpen(false);
                setTimeoutTimerTeamColor(null);
                setTimeoutTimerType(null);
              }
            } else if (timeoutTimerModalOpen && timeoutTimerTeamColor === teamColor && timeoutTimerType === timeoutType) {
              setTimeoutTimerModalOpen(false);
              setTimeoutTimerTeamColor(null);
              setTimeoutTimerType(null);
            }
          } catch (error) {
            console.error('Error checking timeout timer:', error);
          }
        }
      }
    };

    checkTimeoutTimers();

    const handleStorageChange = (e) => {
      if (e.key && e.key.startsWith('timeout_')) {
        checkTimeoutTimers();
      }
    };

    const handleCustomEvent = (e) => {
      if (e.detail?.key && e.detail.key.startsWith('timeout_')) {
        checkTimeoutTimers();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('timeoutTimerUpdate', handleCustomEvent);

    const interval = setInterval(checkTimeoutTimers, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('timeoutTimerUpdate', handleCustomEvent);
      clearInterval(interval);
    };
  }, [timeoutTimerModalOpen, timeoutTimerTeamColor, timeoutTimerType]);

  // タイムアウト選択ハンドラー（ローカルのみで管理、JSONには保存しない）
  const handleTimeoutSelect = (teamColor, timeoutId, time) => {
    // タイムアウトタイマーモーダルを開く
    setTimeoutTimerTeamColor(teamColor);
    setTimeoutTimerType(timeoutId);
    setTimeoutTimerModalOpen(true);

    // タイムアウト選択モーダルを閉じる
    setTimeoutModalOpen(false);
    setSelectedTimeoutTeamColor(null);

    // タイマーを開始（LocalStorageに保存）
    const storageKey = `timeout_${teamColor}_${timeoutId}`;
    try {
      const data = {
        time: time,
        isRunning: true
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('timeoutTimerUpdate', {
        detail: { key: storageKey, data }
      }));
    } catch (error) {
      console.error('Error starting timeout timer:', error);
    }
  };


  // Penalty selection handler
  const handlePenaltySelect = (teamColor, penaltyId) => {
    if (!gameData || !isCtrl) return;

    // Check if penalty requires confirmation
    const requiresConfirmation = ['redCard', 'restartedEnd', 'forfeit'].includes(penaltyId);

    // Check for second yellow card
    if (penaltyId === 'yellowCard' || penaltyId === 'penaltyBallAndYellowCard') {
      const currentYellowCard = gameData[teamColor]?.yellowCard || 0;
      if (currentYellowCard === 1) {
        // Show confirmation modal for second yellow card
        setPendingPenalty({ teamColor, penaltyId });
        setConfirmModalOpen(true);
        setTimeout(() => {
          const dialog = document.getElementById('confirmModal');
          if (dialog) {
            dialog.showModal();
          }
        }, 0);
        return;
      }
    }

    if (requiresConfirmation) {
      // 確認が必要な場合は、確認モーダルを表示
      setPendingPenalty({ teamColor, penaltyId });
      setConfirmModalOpen(true);
      setTimeout(() => {
        const dialog = document.getElementById('confirmModal');
        if (dialog) {
          dialog.showModal();
        }
      }, 0);
      // Penalty modal remains open (closes after confirmation)
    } else {
      // 確認が不要な場合は、直接処理を実行
      executePenalty(teamColor, penaltyId);
    }
  };

  // 反則処理の実行
  const executePenalty = (teamColor, penaltyId) => {
    if (!gameData || !isCtrl) return;

    const currentTeamData = gameData[teamColor] || {};
    const opponentColor = teamColor === 'red' ? 'blue' : 'red';
    const currentOpponentData = gameData[opponentColor] || {};

    let updatedTeamData = { ...currentTeamData };
    let updatedOpponentData = { ...currentOpponentData };

    // Determine if penalty leads to forfeit
    const isForfeit = penaltyId === 'redCard' || penaltyId === 'forfeit' ||
      (penaltyId === 'yellowCard' && (currentTeamData.yellowCard || 0) === 1) ||
      (penaltyId === 'penaltyBallAndYellowCard' && (currentTeamData.yellowCard || 0) === 1);

    // Increment counts based on penalty ID
    switch (penaltyId) {
      case 'penaltyBall':
        // Penalty ball added to opponent
        updatedOpponentData.penaltyBall = (currentOpponentData.penaltyBall || 0) + 1;
        break;
      case 'yellowCard':
        // Yellow card added to fouling team
        updatedTeamData.yellowCard = (currentTeamData.yellowCard || 0) + 1;
        break;
      case 'penaltyBallAndYellowCard':
        // Penalty ball to opponent, yellow card to fouling team
        updatedOpponentData.penaltyBall = (currentOpponentData.penaltyBall || 0) + 1;
        updatedTeamData.yellowCard = (currentTeamData.yellowCard || 0) + 1;
        break;
      case 'redCard':
        // Red card added to fouling team
        updatedTeamData.redCard = (currentTeamData.redCard || 0) + 1;
        break;
      case 'retractionAndPenaltyBall':
        // Penalty ball to opponent (retraction belongs to fouling team)
        updatedOpponentData.penaltyBall = (currentOpponentData.penaltyBall || 0) + 1;
        break;
      case 'restartedEnd': {
        // Restarted End: Reset end from beginning
        // Get current end number
        const currentEnd = gameData.match?.end || 0;
        if (currentEnd > 0) {
          // Reset ball counts
          const redBalls = calculateBallCount(currentEnd, 'red');
          const blueBalls = calculateBallCount(currentEnd, 'blue');
          updatedTeamData.ball = redBalls;
          updatedOpponentData.ball = blueBalls;

          // Reset timers
          updatedTeamData.time = gameData[teamColor].limit || TIMER_LIMITS.GAME;
          updatedTeamData.isRunning = false;
          updatedOpponentData.time = gameData[opponentColor].limit || TIMER_LIMITS.GAME;
          updatedOpponentData.isRunning = false;
        }
        break;
      }
      case 'forfeit':
        // Forfeit processing (implement if needed)
        break;
      default:
        break;
    }

    // Set score for forfeit (0-6)
    if (isForfeit) {
      updatedTeamData.score = 0;
      updatedOpponentData.score = 6;
    }

    // Record penalty in current end
    const currentEnd = gameData.match?.end || 0;
    const ends = [...(gameData.match?.ends || [])];

    if (currentEnd > 0) {
      // List of penalties to record (excluding restartedEnd and forfeit)
      const recordablePenalties = ['lineCross', 'throwBeforeInstruction', 'retraction', 'penaltyBall',
        'retractionAndPenaltyBall', 'penaltyBallAndYellowCard', 'yellowCard', 'redCard'];

      if (recordablePenalties.includes(penaltyId)) {
        // Update match.ends array
        let endEntryIndex = ends.findIndex(e => e.end === currentEnd);

        if (endEntryIndex === -1) {
          // エンドエントリが存在しない場合、新規作成
          ends.push({
            end: currentEnd,
            shots: [],
            redScore: teamColor === 'red' ? updatedTeamData.score : updatedOpponentData.score,
            blueScore: teamColor === 'blue' ? updatedTeamData.score : updatedOpponentData.score,
            [teamColor === 'red' ? 'redPenalties' : 'bluePenalties']: [penaltyId]
          });
        } else {
          // エンドエントリが存在する場合
          const penaltyField = teamColor === 'red' ? 'redPenalties' : 'bluePenalties';
          const existingPenalties = ends[endEntryIndex][penaltyField] || [];
          
          if (!existingPenalties.includes(penaltyId)) {
            ends[endEntryIndex] = {
              ...ends[endEntryIndex],
              [penaltyField]: [...existingPenalties, penaltyId]
            };
          }
        }
      }
    }

    // Update and save gameData
    const updatedGameData = {
      ...gameData,
      match: {
        ...gameData.match,
        ends: ends
      },
      [teamColor]: updatedTeamData,
      [opponentColor]: updatedOpponentData
    };

    // Update balls and timer for Restarted End
    if (penaltyId === 'restartedEnd') {
      const currentEnd = gameData.match?.end || 0;
      if (currentEnd > 0) {
        // ボール数をリセット
        const redBalls = calculateBallCount(currentEnd, 'red');
        const blueBalls = calculateBallCount(currentEnd, 'blue');
        handleBallChange('red', redBalls);
        handleBallChange('blue', blueBalls);

        // タイマーをリセット
        handleTimerToggle('red', false, TIMER_LIMITS.GAME);
        handleTimerToggle('blue', false, TIMER_LIMITS.GAME);

        // ペナルティスロー状態を解除
        const finalGameData = {
          ...updatedGameData,
          screen: {
            ...updatedGameData.screen,
            penaltyThrow: false
          }
        };
        saveData(finalGameData);
      }
    }

    // Save data (triggering useDataSync update)
    saveData(updatedGameData);

    // 反則負けの場合、試合終了セクションへ移動
    if (isForfeit) {
      // #scoreboardにdata-forfeit="true"を設定
      const scoreboardElement = document.getElementById('scoreboard');
      if (scoreboardElement) {
        scoreboardElement.setAttribute('data-forfeit', 'true');
      }

      // matchFinishedセクションに移動
      const sections = gameData.match?.sections || [];
      const matchFinishedIndex = sections.findIndex(s => s === 'matchFinished');
      if (matchFinishedIndex !== -1) {
        // セクションを更新するために、gameDataを直接更新
        const finalGameData = {
          ...updatedGameData,
          match: {
            ...updatedGameData.match,
            sectionID: matchFinishedIndex,
            section: 'matchFinished'
          }
        };
        saveData(finalGameData);
      }
    }

    // モーダルを閉じる
    const penaltyDialog = document.getElementById('penaltyModal');
    if (penaltyDialog) {
      penaltyDialog.close();
    }
    const settingDialog = document.getElementById('settingModal');
    if (settingDialog) {
      settingDialog.close();
    }
    handleSettingModalClose();
  };

  // リセット確認ハンドラー
  const handleResetClick = () => {
    setPendingReset(true);
    setConfirmModalOpen(true);
    setTimeout(() => {
      const dialog = document.getElementById('confirmModal');
      if (dialog) {
        dialog.showModal();
      }
    }, 0);
  };

  // リセット直接実行（確認モーダルなし）
  const handleResetDirect = () => {
    handleReset();
  };

  // エンド選択ハンドラー（スタンバイボタンの場合は確認モーダルを表示）
  const handleEndsSelectWithConfirm = (e) => {
    const button = e.currentTarget;
    const sectionID = parseInt(button.value);
    const section = button.getAttribute('data-word');

    // スタンバイボタン（value="0"またはdata-word="standby"）の場合は確認モーダルを表示
    if (sectionID === 0 || section === 'standby') {
      handleResetClick();
    } else {
      // それ以外の場合は通常通りエンド選択を実行
      handleEndsSelect(e);
    }
  };

  // 確認モーダルのOKハンドラー
  const handleConfirmOk = () => {
    if (pendingReset) {
      handleReset();
      setPendingReset(false);
    } else if (pendingPenalty) {
      executePenalty(pendingPenalty.teamColor, pendingPenalty.penaltyId);
      setPendingPenalty(null);
    }
    setConfirmModalOpen(false);
  };

  // 確認モーダルのキャンセルハンドラー
  const handleConfirmCancel = () => {
    setPendingPenalty(null);
    setPendingReset(false);
    setConfirmModalOpen(false);
  };

  // 確認モーダルのメッセージを取得
  const getConfirmMessage = () => {
    if (pendingReset) {
      return getLocalizedText('confirm.reset', getCurrentLanguage()) || '試合データをリセットします';
    }

    if (!pendingPenalty) return '';

    const { teamColor, penaltyId } = pendingPenalty;

    if (penaltyId === 'restartedEnd') {
      return getLocalizedText('confirm.restartedEnd', getCurrentLanguage()) || 'エンドをやりなおします。';
    } else if (penaltyId === 'redCard' || penaltyId === 'forfeit') {
      const teamText = teamColor === 'red'
        ? getLocalizedText('confirm.redForfeit', getCurrentLanguage()) || '赤の反則負けになります。'
        : getLocalizedText('confirm.blueForfeit', getCurrentLanguage()) || '青の反則負けになります。';
      return teamText;
    } else if (penaltyId === 'yellowCard' || penaltyId === 'penaltyBallAndYellowCard') {
      // 2枚目のイエローカード
      const teamText = teamColor === 'red'
        ? getLocalizedText('confirm.redSecondYellowCard', getCurrentLanguage()) || '2枚目のイエローカードで赤の反則負けになります。'
        : getLocalizedText('confirm.blueSecondYellowCard', getCurrentLanguage()) || '2枚目のイエローカードで青の反則負けになります。';
      return teamText;
    }

    return '';
  };

  // ペナルティ削除ハンドラー
  const handlePenaltyRemove = (teamColor, penaltyType) => {
    if (!gameData || !isCtrl) return;

    const currentTeamData = gameData[teamColor] || {};
    const currentCount = currentTeamData[penaltyType] || 0;

    if (currentCount <= 0) return;

    let updatedTeamData = { ...currentTeamData };

    // カウントが2以上の場合、-1する。1の場合のみ0にする
    if (currentCount >= 2) {
      updatedTeamData[penaltyType] = currentCount - 1;
    } else {
      updatedTeamData[penaltyType] = 0;
    }

    // gameDataを更新して保存
    const updatedGameData = {
      ...gameData,
      [teamColor]: updatedTeamData
    };

    // ペナルティボールを削除した場合、penaltyThrow終了条件をチェック
    if (penaltyType === 'penaltyBall') {
      const redPenaltyBall = updatedGameData.red?.penaltyBall || 0;
      const bluePenaltyBall = updatedGameData.blue?.penaltyBall || 0;

      // 赤・青両方のペナルティボールが0になった場合、penaltyThrow中を終了
      if (redPenaltyBall === 0 && bluePenaltyBall === 0 && updatedGameData.screen?.isPenaltyThrow) {
        updatedGameData.screen = {
          ...updatedGameData.screen,
          isPenaltyThrow: false
        };
      }
    }

    saveData(updatedGameData);
  };

  // 反則モーダル閉じるハンドラー
  const handlePenaltyModalClose = () => {
    setPenaltyModalOpen(false);
    setSelectedTeamColor(null);
  };

  // 結果承認セクションの承認状態管理（gameDataから読み込み）
  const approvals = gameData?.match?.approvals || {
    red: false,
    referee: false,
    blue: false
  };

  const handleApproval = (type) => {
    // gameDataから最新の承認状態を取得
    const currentApprovals = gameData?.match?.approvals || {
      red: false,
      referee: false,
      blue: false
    };

    const newApprovals = {
      ...currentApprovals,
      [type]: !currentApprovals[type]
    };

    // gameDataに保存してctrlとviewで連動
    const updatedGameData = {
      ...gameData,
      match: {
        ...(gameData.match || {}),
        approvals: newApprovals
      }
    };
    saveData(updatedGameData);
  };

  const allApproved = approvals.red && approvals.referee && approvals.blue;

  // data-tieBreak属性をred?.isTieBreakとblue?.isTieBreakの値から設定（すべてのセクションで）
  useEffect(() => {
    const scoreboardElement = document.getElementById('scoreboard');
    if (!scoreboardElement) return;

    const redTieBreak = red?.isTieBreak || false;
    const blueTieBreak = blue?.isTieBreak || false;
    const redScore = red?.score || 0;
    const blueScore = blue?.score || 0;

    // スコアに差がある場合、data-tieBreak属性を削除
    if (redScore !== blueScore) {
      const currentTieBreak = scoreboardElement.getAttribute('data-tieBreak');
      if (currentTieBreak) {
        scoreboardElement.removeAttribute('data-tieBreak');
      }
    } else {
      // 同点の場合、redTieBreakとblueTieBreakの値に基づいてdata-tieBreak属性を設定
      if (redTieBreak === true) {
        scoreboardElement.setAttribute('data-tieBreak', 'red');
      } else if (blueTieBreak === true) {
        scoreboardElement.setAttribute('data-tieBreak', 'blue');
      } else {
        // タイブレークがない場合は削除
        const currentTieBreak = scoreboardElement.getAttribute('data-tieBreak');
        if (currentTieBreak) {
          scoreboardElement.removeAttribute('data-tieBreak');
        }
      }
    }
  }, [red?.isTieBreak, blue?.isTieBreak, red?.score, blue?.score]);

  // タイブレークリセット処理のヘルパー関数
  const resetTieBreakData = useCallback((scoreboardElement, isCtrl, saveData, id, court, scoresChanged) => {
    if (!isCtrl || !saveData || !scoresChanged) return;

    const currentTieBreak = scoreboardElement?.getAttribute('data-tieBreak');
    if (currentTieBreak) {
      scoreboardElement.removeAttribute('data-tieBreak');
    }

    // 前回の値と比較して、変更がある場合のみ保存（無限ループを防ぐため非同期で実行）
    setTimeout(() => {
      if (id && court) {
        const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
        if (storedData) {
          try {
            const currentGameData = JSON.parse(storedData);
            const updatedGameData = {
              ...currentGameData,
              red: {
                ...currentGameData.red,
                tieBreak: false
              },
              blue: {
                ...currentGameData.blue,
                tieBreak: false
              }
            };
            saveData(updatedGameData);
          } catch (err) {
            console.error('データ更新エラー:', err);
          }
        }
      }
    }, 0);
  }, []);

  // matchFinishedセクションとresultApprovalセクションの時に勝敗判定を行う
  const prevScoresRef = useRef({ red: null, blue: null });
  const prevTieBreaksRef = useRef({ red: null, blue: null });
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (section === 'matchFinished' || section === 'resultApproval') {
      const scoreboardElement = document.getElementById('scoreboard');
      if (!scoreboardElement) return;

      const redScore = red?.score || 0;
      const blueScore = blue?.score || 0;
      const redTieBreak = red?.isTieBreak || false;
      const blueTieBreak = blue?.isTieBreak || false;

      // スコアまたはタイブレークが変更された場合のみ処理
      const scoresChanged = prevScoresRef.current.red !== redScore || prevScoresRef.current.blue !== blueScore;
      const tieBreaksChanged = prevTieBreaksRef.current.red !== redTieBreak || prevTieBreaksRef.current.blue !== blueTieBreak;

      if (!scoresChanged && !tieBreaksChanged && hasProcessedRef.current) {
        return; // 変更がない場合は処理をスキップ
      }

      let winner = null;

      // まずスコアを比較（スコアが高い方が勝者を優先）
      if (redScore > blueScore) {
        winner = 'red';
        // スコアに差がある場合、タイブレーク関連をリセット
        if ((redTieBreak !== false || blueTieBreak !== false) && scoresChanged) {
          resetTieBreakData(scoreboardElement, isCtrl, saveData, id, court, scoresChanged);
        }
      } else if (blueScore > redScore) {
        winner = 'blue';
        // スコアに差がある場合、タイブレーク関連をリセット
        if ((redTieBreak !== false || blueTieBreak !== false) && scoresChanged) {
          resetTieBreakData(scoreboardElement, isCtrl, saveData, id, court, scoresChanged);
        }
      } else {
        // 同点の場合、タイブレークで勝敗を判断
        // redTieBreakとblueTieBreakの値に基づいてdata-tieBreak属性を確実に設定
        if (redTieBreak === true) {
          winner = 'red';
          // data-tieBreak属性を設定（winMark表示のため）
          scoreboardElement.setAttribute('data-tieBreak', 'red');
        } else if (blueTieBreak === true) {
          winner = 'blue';
          // data-tieBreak属性を設定（winMark表示のため）
          scoreboardElement.setAttribute('data-tieBreak', 'blue');
        } else {
          // タイブレークがない場合は引き分け（winner = null）
          // data-tieBreak属性を削除
          scoreboardElement.removeAttribute('data-tieBreak');
        }
      }

      // data-win属性を設定
      const currentWin = scoreboardElement.getAttribute('data-win');
      if (winner === 'red' && currentWin !== 'red') {
        scoreboardElement.setAttribute('data-win', 'red');
      } else if (winner === 'blue' && currentWin !== 'blue') {
        scoreboardElement.setAttribute('data-win', 'blue');
      } else if (winner === null && currentWin !== 'draw') {
        scoreboardElement.setAttribute('data-win', 'draw');
      }

      // 前回の値を更新
      prevScoresRef.current = { red: redScore, blue: blueScore };
      prevTieBreaksRef.current = { red: redTieBreak, blue: blueTieBreak };
      hasProcessedRef.current = true;
    } else {
      // sectionがmatchFinishedまたはresultApprovalでない場合はリセット
      hasProcessedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, red?.score, blue?.score, red?.isTieBreak, blue?.isTieBreak, isCtrl, id, court, resetTieBreakData]);

  // ローディング表示
  if (isLoading) {
    return (
      <div className="isLoading">
        <div>データを読み込み中...</div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="isError">
        <div>エラーが発生しました: {error}</div>
      </div>
    );
  }


  return (
    <div id="scoreboard" data-section={section} data-setcolor={isColorSet} data-active={active} data-scoreadjust={isScoreAdjusting ? 'true' : 'false'} data-penaltythrow={isPenaltyThrow ? 'true' : 'false'} className={settingOpen ? 'settingOpen' : ''}>
      <Header
        section={section}
        sectionID={sectionID}
        end={end}
        match={match}
        tieBreak={tieBreak}
        option=""
        onSettingToggle={isCtrl ? handleSettingModalOpen : null}
        onFullscreenToggle={handleFullscreenToggle}
        isCtrl={isCtrl}
      />

      <main data-active={active}>
        <PlayerInfoPanel
          color="red"
          playerName={redName}
          score={red.score}
          time={redTimer.displayTime}
          remainingMs={redTimer.remainingMs}
          isRun={redTimer.isRunning}
          otherIsRun={blueTimer.isRunning}
          dataBall={red.ball}
          onScoreChange={(delta) => scoreAdjust('red', delta)}
          onAdjust={(color, delta) => scoreAdjust(color, delta)}
          onTimerToggle={(isRunning) => handleTimerToggle('red', isRunning, redTimer.remainingMs)}
          onBallChange={(newBallValue) => handleBallChange('red', newBallValue)}
          onSelect={handleSelect}
          onTieBreakSelect={handleTieBreakSelect}
          penaltyBall={red?.penaltyBall || 0}
          yellowCard={red?.yellowCard || 0}
          redCard={red?.redCard || 0}
          onPenaltyRemove={handlePenaltyRemove}
          isCtrl={isCtrl}
        />

        <PlayerInfoPanel
          color="blue"
          playerName={blueName}
          score={blue.score}
          time={blueTimer.displayTime}
          remainingMs={blueTimer.remainingMs}
          isRun={blueTimer.isRunning}
          otherIsRun={redTimer.isRunning}
          dataBall={blue.ball}
          onScoreChange={(delta) => scoreAdjust('blue', delta)}
          onAdjust={(color, delta) => scoreAdjust(color, delta)}
          onTimerToggle={(isRunning) => handleTimerToggle('blue', isRunning, blueTimer.remainingMs)}
          onBallChange={(newBallValue) => handleBallChange('blue', newBallValue)}
          onSelect={handleSelect}
          onTieBreakSelect={handleTieBreakSelect}
          penaltyBall={blue?.penaltyBall || 0}
          yellowCard={blue?.yellowCard || 0}
          redCard={blue?.redCard || 0}
          onPenaltyRemove={handlePenaltyRemove}
          isCtrl={isCtrl}
        />
      </main>

      {/* penaltyThrow中に「ペナルティボール」を表示 */}
      {isPenaltyThrow && (
        <div id="penaltyThrowLabel">
          {getLocalizedText('penalties.penaltyBall', getCurrentLanguage()) || 'ペナルティボール'}
        </div>
      )}

      {/* 結果表 - resultApprovalセクションの時のみ表示 */}
      {section === 'resultApproval' && (
        <ResultTable
          ends={match?.ends || []}
        />
      )}

      {/* resultApprovalセクション（viewモードでも表示） */}
      {section === 'resultApproval' && (
        <div id="resultApproval">
          {/* 承認ボタンはviewモードでも表示 */}
          <div className="approvalButtons">
            <button
              type="button"
              className={`btn approval ${approvals.red ? 'isApproved' : ''}`}
              onClick={() => handleApproval('red')}
            >
              {getLocalizedText('buttons.redApproval', getCurrentLanguage())}
            </button>
            <button
              type="button"
              className={`btn approval ${approvals.referee ? 'isApproved' : ''}`}
              onClick={() => handleApproval('referee')}
            >
              {getLocalizedText('buttons.refereeApproval', getCurrentLanguage())}
            </button>
            <button
              type="button"
              className={`btn approval ${approvals.blue ? 'isApproved' : ''}`}
              onClick={() => handleApproval('blue')}
            >
              {getLocalizedText('buttons.blueApproval', getCurrentLanguage())}
            </button>
          </div>
          <div className={`matchCompleted ${allApproved ? 'visible' : ''}`}>
            {getLocalizedText('buttons.matchCompleted', getCurrentLanguage())}
          </div>
        </div>
      )}

      {/* セクション進行ナビゲーション */}
      <SectionNav
        setColor={gameData.screen?.isColorSet}
        section={gameData.match?.section}
        sectionID={gameData.match?.sectionID}
        totalEnds={gameData.match?.totalEnds}
        tieBreak={gameData.match?.tieBreak}
        sections={gameData.match?.sections}
        category={gameData.category}
        matchName={settingPendingChanges.matchName !== undefined ? settingPendingChanges.matchName : matchName}
        classification={settingPendingChanges.classification !== undefined ? settingPendingChanges.classification : classification}
        warmup={warmup}
        warmupEnabled={gameData.match?.warmup !== 'none'}
        warmupMode={gameData.match?.warmup}
        interval={interval}
        intervalEnabled={gameData.match?.interval !== 'none'}
        isTie={isTie}
        warmupTimer={warmupTimer}
        intervalTimer={intervalTimer}
        isCtrl={isCtrl}
        scoreAdjusting={gameData.screen?.isScoreAdjusting}
        redPenaltyBall={gameData.red?.penaltyBall}
        bluePenaltyBall={gameData.blue?.penaltyBall}
        currentLang={getCurrentLanguage()}
        redCountry={gameData.red?.country}
        redProfilePic={gameData.red?.profilePic}
        blueCountry={gameData.blue?.country}
        blueProfilePic={gameData.blue?.profilePic}
        onConfirmColorToggle={() => updateConfirmColor(!isColorSet, saveData)}
        onStartWarmup={handleStartWarmup}
        onWarmupTimerToggle={handleWarmupTimerToggle}
        onNextSection={handleNextSection}
        onIntervalTimerToggle={handleIntervalTimerToggle}
        onTieBreak={handleTieBreak}
        onSwapTeamNames={handleSwapTeamNames}
      />

      {/* タイムモーダル */}
      {showTimeModal && (
        <div className="timeModal">
          <div className="timeModalContent">
            <p>タイム！</p>
          </div>
        </div>
      )}

      {/* 設定モーダル - ctrl画面の時のみ表示 */}
      {isCtrl && (
        <SettingModal
          sectionID={sectionID}
          section={section}
          sections={gameData.match?.sections}
          totalEnds={match?.totalEnds}
          handleReset={handleResetClick}
          handleResetDirect={handleResetDirect}
          handleEndsSelect={handleEndsSelectWithConfirm}
          handleTimeAdjust={handleTimeAdjust}
          getText={getText}
          onClose={handleSettingModalClose}
          scoreAdjusting={isScoreAdjusting}
          onRestartEnd={handleRestartEnd}
          onPenaltyClick={handlePenaltyClick}
          onTimeoutClick={handleTimeoutClick}
          gameData={gameData}
          id={id}
          saveData={saveData}
          setSearchParams={setSearchParams}
          classParam={classParam}
          genderParam={genderParam}
          onPendingChangesChange={setSettingPendingChanges}
          onUpdateField={(parent, child, value) => {
            if (child) {
              // red.name や blue.name の場合
              updateField(parent, child, value);
              if (saveData) {
                let updatedGameData = {
                  ...gameData,
                  [parent]: {
                    ...gameData[parent],
                    [child]: value
                  }
                };

                // ウォームアップ設定を変更した場合、セクション配列も更新
                if (parent === 'match' && child === 'warmup' && gameData.match?.sections) {
                  let updatedSections = [...gameData.match.sections];
                  if (value === 'none') {
                    // ウォームアップが「なし」の場合は、warmupとwarmup1、warmup2を削除
                    updatedSections = updatedSections.filter(s => s !== 'warmup' && s !== 'warmup1' && s !== 'warmup2');
                  } else if (value === 'simultaneous') {
                    // ウォームアップが「同時」の場合は、warmup1とwarmup2を削除し、warmupを追加（存在しない場合）
                    updatedSections = updatedSections.filter(s => s !== 'warmup1' && s !== 'warmup2');
                    if (!updatedSections.includes('warmup')) {
                      const standbyIndex = updatedSections.indexOf('standby');
                      if (standbyIndex !== -1) {
                        updatedSections.splice(standbyIndex + 1, 0, 'warmup');
                      }
                    }
                  } else if (value === 'separate') {
                    // ウォームアップが「別々」の場合は、warmupを削除し、warmup1とwarmup2を追加（存在しない場合）
                    updatedSections = updatedSections.filter(s => s !== 'warmup');
                    if (!updatedSections.includes('warmup1') || !updatedSections.includes('warmup2')) {
                      const standbyIndex = updatedSections.indexOf('standby');
                      if (standbyIndex !== -1) {
                        // warmup1とwarmup2が存在しない場合のみ追加
                        if (!updatedSections.includes('warmup1')) {
                          updatedSections.splice(standbyIndex + 1, 0, 'warmup1');
                        }
                        if (!updatedSections.includes('warmup2')) {
                          const warmup1Index = updatedSections.indexOf('warmup1');
                          if (warmup1Index !== -1) {
                            updatedSections.splice(warmup1Index + 1, 0, 'warmup2');
                          }
                        }
                      }
                    }
                  }
                  updatedGameData.match = {
                    ...updatedGameData.match,
                    sections: updatedSections
                  };
                }

                // インターバル設定を変更した場合、セクション配列も更新
                if (parent === 'match' && child === 'interval' && gameData.match?.sections) {
                  let updatedSections = [...gameData.match.sections];
                  if (value === 'none') {
                    // intervalを削除
                    updatedSections = updatedSections.filter(s => s !== 'interval');
                  } else {
                    // intervalが存在しない場合は、エンドの後に追加
                    // 各エンドの後にintervalを追加（最終エンドの後は除く）
                    const totalEnds = gameData.match?.totalEnds || 0;
                    for (let i = 1; i <= totalEnds; i++) {
                      const endSection = `end${i}`;
                      const endIndex = updatedSections.indexOf(endSection);
                      if (endIndex !== -1 && i < totalEnds) {
                        // 次のセクションがintervalでない場合、追加
                        const nextSection = updatedSections[endIndex + 1];
                        if (nextSection !== 'interval') {
                          updatedSections.splice(endIndex + 1, 0, 'interval');
                        }
                      }
                    }
                  }
                  updatedGameData.match = {
                    ...updatedGameData.match,
                    sections: updatedSections
                  };
                }

                // 結果承認設定を変更した場合、セクション配列も更新
                if (parent === 'match' && child === 'resultApproval' && gameData.match?.sections) {
                  let updatedSections = [...gameData.match.sections];
                  if (value === 'none') {
                    // resultApprovalを削除
                    updatedSections = updatedSections.filter(s => s !== 'resultApproval');
                  } else {
                    // resultApprovalが存在しない場合は、matchFinishedの後に追加
                    if (!updatedSections.includes('resultApproval')) {
                      const matchFinishedIndex = updatedSections.indexOf('matchFinished');
                      if (matchFinishedIndex !== -1) {
                        updatedSections.splice(matchFinishedIndex + 1, 0, 'resultApproval');
                      }
                    }
                  }
                  updatedGameData.match = {
                    ...updatedGameData.match,
                    sections: updatedSections
                  };
                }

                // totalEndsが変更された場合、セクション配列を完全に再計算
                if (parent === 'match' && child === 'totalEnds') {
                  const recalculateSections = (totalEnds, warmup, interval, resultApproval) => {
                    const newSections = ['standby'];

                    // ウォームアップの追加
                    if (warmup === 'simultaneous') {
                      newSections.push('warmup');
                    } else if (warmup === 'separate') {
                      newSections.push('warmup1', 'warmup2');
                    }

                    // エンドとインターバルの追加
                    for (let i = 1; i <= totalEnds; i++) {
                      newSections.push(`end${i}`);
                      // 最後のエンド以外で、インターバルが有効な場合はintervalを追加
                      if (i < totalEnds && interval !== 'none') {
                        newSections.push('interval');
                      }
                    }

                    // 試合終了
                    newSections.push('matchFinished');

                    // 結果承認の追加
                    if (resultApproval !== 'none') {
                      newSections.push('resultApproval');
                    }

                    return newSections;
                  };

                  const currentWarmup = updatedGameData.match?.warmup || gameData.match?.warmup || 'simultaneous';
                  const currentInterval = updatedGameData.match?.interval || gameData.match?.interval || 'enabled';
                  const currentResultApproval = updatedGameData.match?.resultApproval || gameData.match?.resultApproval || 'enabled';

                  const newSections = recalculateSections(
                    value,
                    currentWarmup,
                    currentInterval,
                    currentResultApproval
                  );

                  updatedGameData.match = {
                    ...updatedGameData.match,
                    sections: newSections
                  };

                  // totalEndsが変更された場合、scores配列は既存のエントリのみ保持（事前生成しない）
                }

                saveData(updatedGameData);
              }
            } else {
              // classification, category, matchName の場合（直接プロパティ）
              updateDirectField(parent, value);
              if (saveData) {
                const updatedGameData = {
                  ...gameData,
                  [parent]: value
                };
                saveData(updatedGameData);
              }
            }
          }}
        />
      )}

      {/* 反則選択モーダル */}
      {penaltyModalOpen && selectedTeamColor && (
        <PenaltyModal
          teamColor={selectedTeamColor}
          onSelectPenalty={handlePenaltySelect}
          onClose={handlePenaltyModalClose}
          getText={getText}
          gameData={gameData}
        />
      )}

      {/* タイムアウト選択モーダル */}
      {timeoutModalOpen && selectedTimeoutTeamColor && (
        <TimeoutModal
          teamColor={selectedTimeoutTeamColor}
          onSelectTimeout={handleTimeoutSelect}
          onClose={() => {
            setTimeoutModalOpen(false);
            setSelectedTimeoutTeamColor(null);
          }}
          getText={getText}
          timeoutData={null}
          onTimeoutTimeUpdate={null}
        />
      )}

      {/* タイムアウトタイマーモーダル */}
      {timeoutTimerModalOpen && timeoutTimerTeamColor && timeoutTimerType && (
        <TimeoutTimerModal
          teamColor={timeoutTimerTeamColor}
          timeoutType={timeoutTimerType}
          isCtrl={isCtrl}
          onClose={() => {
            setTimeoutTimerModalOpen(false);
            setTimeoutTimerTeamColor(null);
            setTimeoutTimerType(null);
            // ctrlモードの場合、設定モーダルも閉じる
            if (isCtrl) {
              setSettingOpen(false);
              const settingDialog = document.getElementById('settingModal');
              if (settingDialog) {
                settingDialog.close();
              }
            }
          }}
        />
      )}

      {/* 確認モーダル */}
      {confirmModalOpen && (pendingPenalty || pendingReset) && (
        <ConfirmModal
          message={getConfirmMessage()}
          onConfirm={handleConfirmOk}
          onCancel={handleConfirmCancel}
        />
      )}
    </div>
  );
};

export default Scoreboard;