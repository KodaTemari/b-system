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
  // 統合されたスコアボードロジック
  const {
    // URL パラメータ
    isCtrl,
    
    // 状態
    active,
    scoreAdjusting,
    showTimeModal,
    settingOpen,
    setSettingOpen,
    currentLang,
    
    // データ
    gameData,
    isLoading,
    error,
    
    // URL パラメータ
    id,
    court,
    
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
    category,
    matchName,
    classification,
    
    // タイマー
    redTimer,
    blueTimer,
    warmupTimer,
    intervalTimer,
    
    // 判定
    isTie,
    isLastEndSection,
    
    // ハンドラー
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
    handleFinalShot,
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

  // 設定モーダル開閉ハンドラー
  const handleSettingModalOpen = () => {
    setSettingOpen(true);
    document.getElementById('settingModal').showModal();
  };

  const handleSettingModalClose = () => {
    setSettingOpen(false);
  };

  // 反則モーダルの状態管理
  const [penaltyModalOpen, setPenaltyModalOpen] = useState(false);
  const [selectedTeamColor, setSelectedTeamColor] = useState(null);
  
  // タイムアウトモーダルの状態管理
  const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);
  const [selectedTimeoutTeamColor, setSelectedTimeoutTeamColor] = useState(null);
  const [timeoutTimerModalOpen, setTimeoutTimerModalOpen] = useState(false);
  const [timeoutTimerTeamColor, setTimeoutTimerTeamColor] = useState(null);
  const [timeoutTimerType, setTimeoutTimerType] = useState(null);
  
  // 確認モーダルの状態管理
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingPenalty, setPendingPenalty] = useState(null); // { teamColor, penaltyId }
  const [pendingReset, setPendingReset] = useState(false); // リセット確認用
  
  // penaltyThrow中かどうかを判定
  // gameData.screen.penaltyThrowの状態を使用
  const isPenaltyThrow = gameData?.screen?.penaltyThrow || false;

  // 反則ボタンクリックハンドラー
  const handlePenaltyClick = (teamColor) => {
    setSelectedTeamColor(teamColor);
    setPenaltyModalOpen(true);
    // モーダルを表示
    setTimeout(() => {
      const dialog = document.getElementById('penaltyModal');
      if (dialog) {
        dialog.showModal();
      }
    }, 0);
  };

  // タイムアウトボタンクリックハンドラー
  const handleTimeoutClick = (teamColor) => {
    setSelectedTimeoutTeamColor(teamColor);
    setTimeoutModalOpen(true);
  };

  // タイムアウトモーダルの表示管理
  useEffect(() => {
    if (timeoutModalOpen && selectedTimeoutTeamColor) {
      const dialog = document.getElementById('timeoutModal');
      if (dialog) {
        dialog.showModal();
      }
    }
  }, [timeoutModalOpen, selectedTimeoutTeamColor]);
  
  // タイムアウトタイマーモーダルの表示制御
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
  
  // LocalStorageからタイムアウトタイマーの状態を監視（ctrlとviewの両方で表示）
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
                // タイマーが実行中の場合、モーダルを開く
                if (!timeoutTimerModalOpen || timeoutTimerTeamColor !== teamColor || timeoutTimerType !== timeoutType) {
                  setTimeoutTimerTeamColor(teamColor);
                  setTimeoutTimerType(timeoutType);
                  setTimeoutTimerModalOpen(true);
                }
              } else if (!data.isRunning && timeoutTimerModalOpen && timeoutTimerTeamColor === teamColor && timeoutTimerType === timeoutType) {
                // タイマーが停止した場合、モーダルを閉じる（viewモードでも動作）
                setTimeoutTimerModalOpen(false);
                setTimeoutTimerTeamColor(null);
                setTimeoutTimerType(null);
              }
            } else if (timeoutTimerModalOpen && timeoutTimerTeamColor === teamColor && timeoutTimerType === timeoutType) {
              // LocalStorageから削除された場合、モーダルを閉じる
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
    
    // 初回チェック
    checkTimeoutTimers();
    
    // LocalStorageの変更を監視
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
    
    // 定期的にチェック（同じウィンドウ内の更新を検知）
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
  

  // 反則選択ハンドラー
  const handlePenaltySelect = (teamColor, penaltyId) => {
    if (!gameData || !isCtrl) return;
    
    // 確認が必要な反則かどうかを判定
    const requiresConfirmation = ['redCard', 'restartedEnd', 'forfeit'].includes(penaltyId);
    
    // 2枚目のイエローカードの場合も確認が必要
    if (penaltyId === 'yellowCard' || penaltyId === 'penaltyBallAndYellowCard') {
      const currentYellowCard = gameData[teamColor]?.yellowCard || 0;
      if (currentYellowCard === 1) {
        // 2枚目になる場合、確認モーダルを表示
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
      // 反則モーダルは閉じない（確認後に閉じる）
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
    
    // 反則負けになるかどうかを判定
    const isForfeit = penaltyId === 'redCard' || penaltyId === 'forfeit' || 
                      (penaltyId === 'yellowCard' && (currentTeamData.yellowCard || 0) === 1) ||
                      (penaltyId === 'penaltyBallAndYellowCard' && (currentTeamData.yellowCard || 0) === 1);
    
    // ペナルティIDに応じてカウントを増やす
    switch (penaltyId) {
      case 'penaltyBall':
        // ペナルティーボールは相手チームに追加
        updatedOpponentData.penaltyBall = (currentOpponentData.penaltyBall || 0) + 1;
        break;
      case 'yellowCard':
        // イエローカードは反則したチームに追加
        updatedTeamData.yellowCard = (currentTeamData.yellowCard || 0) + 1;
        break;
      case 'penaltyBallAndYellowCard':
        // ペナルティーボールは相手チームに、イエローカードは反則したチームに追加
        updatedOpponentData.penaltyBall = (currentOpponentData.penaltyBall || 0) + 1;
        updatedTeamData.yellowCard = (currentTeamData.yellowCard || 0) + 1;
        break;
      case 'redCard':
        // レッドカードは反則したチームに追加
        updatedTeamData.redCard = (currentTeamData.redCard || 0) + 1;
        break;
      case 'retractionAndPenaltyBall':
        // ペナルティーボールは相手チームに追加（リトラクションは反則したチームのもの）
        updatedOpponentData.penaltyBall = (currentOpponentData.penaltyBall || 0) + 1;
        break;
      case 'restartedEnd': {
        // リスターテッドエンドの処理：エンドを最初からやり直す
        // 現在のエンド番号を取得
        const currentEnd = gameData.match?.end || 0;
        if (currentEnd > 0) {
          // ボール数をリセット
          const redBalls = calculateBallCount(currentEnd, 'red');
          const blueBalls = calculateBallCount(currentEnd, 'blue');
          updatedTeamData.ball = redBalls;
          updatedOpponentData.ball = blueBalls;
          
          // タイマーをリセット
          updatedTeamData.time = TIMER_LIMITS.GAME;
          updatedTeamData.isRun = false;
          updatedOpponentData.time = TIMER_LIMITS.GAME;
          updatedOpponentData.isRun = false;
        }
        break;
      }
      case 'forfeit':
        // 没収試合の処理（必要に応じて実装）
        break;
      default:
        break;
    }
    
    // 反則負けの場合、スコアを設定（反則負けチーム0、相手6）
    if (isForfeit) {
      updatedTeamData.score = 0;
      updatedOpponentData.score = 6;
    }
    
    // gameDataを更新して保存
    const updatedGameData = {
      ...gameData,
      [teamColor]: updatedTeamData,
      [opponentColor]: updatedOpponentData
    };
    
    // リスターテッドエンドの場合、ボール数とタイマーを更新
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
    
    // データを保存（これにより、useDataSyncが更新を検知して、gameDataが更新される）
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
      return getLocalizedText('confirm.reset', getCurrentLanguage()) || 'すべてのデータをリセットします。よろしいですか？';
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
      if (redPenaltyBall === 0 && bluePenaltyBall === 0 && updatedGameData.screen?.penaltyThrow) {
        updatedGameData.screen = {
          ...updatedGameData.screen,
          penaltyThrow: false
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

  // data-tieBreak属性をred?.tieBreakとblue?.tieBreakの値から設定（すべてのセクションで）
  useEffect(() => {
    const scoreboardElement = document.getElementById('scoreboard');
    if (!scoreboardElement) return;

    const redTieBreak = red?.tieBreak || false;
    const blueTieBreak = blue?.tieBreak || false;
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
  }, [red?.tieBreak, blue?.tieBreak, red?.score, blue?.score]);

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
      const redTieBreak = red?.tieBreak || false;
      const blueTieBreak = blue?.tieBreak || false;
      
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
  }, [section, red?.score, blue?.score, red?.tieBreak, blue?.tieBreak, isCtrl, id, court, resetTieBreakData]);

  // ローディング表示
  if (isLoading) {
    return (
      <div className="loading">
        <div>データを読み込み中...</div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="error">
        <div>エラーが発生しました: {error}</div>
      </div>
    );
  }

  return (
    <div id="scoreboard" data-section={section} data-setcolor={setColor} data-active={active} data-scoreadjust={scoreAdjusting ? 'true' : 'false'} data-penaltythrow={isPenaltyThrow ? 'true' : 'false'} className={settingOpen ? 'settingOpen' : ''}>
      <Header
        section={section}
        sectionID={sectionID}
        end={end}
        match={match}
        tieBreak={tieBreak}
        option=""
        onSettingToggle={isCtrl ? handleSettingModalOpen : null}
        onFullscreenToggle={() => {}}
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
          redScores={red?.scores || []}
          blueScores={blue?.scores || []}
        />
      )}

      {/* resultApprovalセクション（viewモードでも表示） */}
      {section === 'resultApproval' && (
        <div id="resultApproval">
          {/* 承認ボタンはviewモードでも表示 */}
          <div className="approvalButtons">
            <button
              type="button"
              className={`btn approval ${approvals.red ? 'approved' : ''}`}
              onClick={() => handleApproval('red')}
            >
              {getLocalizedText('buttons.redApproval', getCurrentLanguage())}
            </button>
            <button
              type="button"
              className={`btn approval ${approvals.referee ? 'approved' : ''}`}
              onClick={() => handleApproval('referee')}
            >
              {getLocalizedText('buttons.refereeApproval', getCurrentLanguage())}
            </button>
            <button
              type="button"
              className={`btn approval ${approvals.blue ? 'approved' : ''}`}
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
        setColor={setColor}
        section={section}
        sectionID={sectionID}
        totalEnds={match?.totalEnds}
        tieBreak={tieBreak}
        sections={match?.sections}
        category={category}
        matchName={matchName}
        classification={classification}
        warmup={warmup}
        warmupEnabled={match?.warmup !== 'none'}
        warmupMode={match?.warmup || 'simultaneous'}
        interval={interval}
        intervalEnabled={match?.interval !== 'none'}
        isTie={isTie}
        warmupTimer={warmupTimer}
        intervalTimer={intervalTimer}
        isCtrl={isCtrl}
        scoreAdjusting={scoreAdjusting}
        redPenaltyBall={red?.penaltyBall || 0}
        bluePenaltyBall={blue?.penaltyBall || 0}
        onConfirmColorToggle={() => updateConfirmColor(!setColor, saveData)}
        onStartWarmup={handleStartWarmup}
        onWarmupTimerToggle={handleWarmupTimerToggle}
        onNextSection={handleNextSection}
        onIntervalTimerToggle={handleIntervalTimerToggle}
        onTieBreak={handleTieBreak}
        onSwapTeamNames={handleSwapTeamNames}
        key={currentLang}
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
            handleEndsSelect={handleEndsSelect}
            handleTimeAdjust={handleTimeAdjust}
            getText={getText}
            onClose={handleSettingModalClose}
            scoreAdjusting={scoreAdjusting}
            onRestartEnd={handleRestartEnd}
            onPenaltyClick={handlePenaltyClick}
            onTimeoutClick={handleTimeoutClick}
            gameData={gameData}
            id={id}
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