import { useCallback } from 'react';
import { TIMER_LIMITS, UI_CONSTANTS, GAME_SECTIONS } from '../../utils/scoreboard/constants';
import { getText as getLocalizedText } from '../../locales';
import { calculateBallCount } from '../../utils/scoreboard/gameLogic';

/**
 * スコアボードのイベントハンドラーを管理するカスタムフック
 */
export const useScoreboardHandlers = ({
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
  currentLang
}) => {
  // スコア選択ハンドラー
  const handleSelect = useCallback((color) => {
    // スコアボタンを押したときにdata-activeを設定（ctrlモードのみ）
    if (isCtrl) {
      const activeValue = color === 'red' ? 'red-score' : 'blue-score';
      updateScreenActive(activeValue);
      // スコアボタンを押しても、scoreAdjustingフラグはリセットしない
      // （インターバル開始ボタンは＋ボタンを押したときに表示され、スコアボタンを押しても消えない）
      
      // スコアボタンを押したとき、赤と青のタイマーを停止
      if (gameData && gameData.red && gameData.blue) {
        const redTime = gameData.red.time || 0;
        const blueTime = gameData.blue.time || 0;
        updateTimer('red', redTime, false);
        updateTimer('blue', blueTime, false);
        
        // ゲームデータを保存（screen.activeも含める、scoreAdjustingフラグは保持）
        if (saveData) {
          const updatedGameData = {
            ...gameData,
            red: {
              ...gameData.red,
              isRun: false
            },
            blue: {
              ...gameData.blue,
              isRun: false
            },
            screen: {
              ...gameData.screen,
              active: activeValue,
              scoreAdjusting: gameData.screen?.scoreAdjusting ?? false
            }
          };
          saveData(updatedGameData);
        }
      }
    }
  }, [updateScreenActive, isCtrl, gameData, updateTimer, saveData]);

  // スコア調整ハンドラー
  const scoreAdjust = useCallback((color, delta) => {
    if (!gameData || !gameData[color]) {
      return;
    }
    
    const currentScore = gameData[color].score;
    const newScore = Math.max(0, currentScore + delta);
    updateScore(color, newScore);
    
    // エンドスコアも更新
    const currentSection = gameData.match?.section || '';
    const sectionID = gameData.match?.sectionID || 0;
    const sections = gameData.match?.sections || [];
    
    let endIndex = -1;
    
    if (currentSection === 'interval') {
      // インターバルセクションの場合、1つ前のエンドセクションを取得
      const prevSectionID = sectionID - 1;
      const prevSection = sections[prevSectionID];
      
      if (prevSection && prevSection.startsWith('end')) {
        // 前のセクションがエンドの場合、そのエンド番号を取得
        const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
        endIndex = prevEndNumber - 1; // エンド番号からインデックスに変換（エンド1 → インデックス0）
      }
    } else {
      // エンドセクションまたはタイブレークセクションの場合
      const end = gameData.match?.end || 0;
      if (end > 0) {
        endIndex = end - 1;
      }
    }
    
    if (endIndex >= 0) {
      const currentScores = gameData[color].scores || [];
      const newScores = [...currentScores];
      
      // 配列の長さを確保
      while (newScores.length <= endIndex) {
        newScores.push(0);
      }
      
      // endIndexのインデックスに加算
      newScores[endIndex] = Math.max(0, (newScores[endIndex] || 0) + delta);
      
      // スコア配列を更新
      updateField(color, 'scores', newScores);
    }
    
    // エンドセクションまたはタイブレークセクションの場合、点数加算ボタンが押されたらsectionNavを表示
    if (currentSection.startsWith('end') || currentSection === 'tieBreak') {
      if (isCtrl) {
        // ctrlモードの時は、activeを設定し、scoreAdjustingフラグをtrueにする
        if (color === 'red') {
          updateScreenActive('red-score');
        } else if (color === 'blue') {
          updateScreenActive('blue-score');
        }
        // 得点調整ボタンが押されたことを示すフラグを設定
        if (updateScoreAdjusting) {
          updateScoreAdjusting(true);
        }
      } else {
        // viewモードの時は、scoreを設定
        updateScreenActive('score');
      }
    }
    
    // スコア調整後、データを保存（更新されたgameDataを渡す）
    if (isCtrl) {
      // エンドスコアを含む更新データを準備
      const currentScores = gameData[color].scores || [];
      const newScores = [...currentScores];
      
      // endIndexが計算されている場合はそれを使用、そうでない場合は従来のロジック
      if (endIndex >= 0) {
        // 配列の長さを確保
        while (newScores.length <= endIndex) {
          newScores.push(0);
        }
        newScores[endIndex] = Math.max(0, (newScores[endIndex] || 0) + delta);
      } else {
        // フォールバック（既存のロジック）
        const end = gameData.match?.end || 0;
        if (end > 0) {
          const fallbackEndIndex = end - 1;
          while (newScores.length <= fallbackEndIndex) {
            newScores.push(0);
          }
          newScores[fallbackEndIndex] = Math.max(0, (newScores[fallbackEndIndex] || 0) + delta);
        }
      }
      
      const updatedGameData = {
        ...gameData,
        [color]: {
          ...gameData[color],
          score: newScore,
          scores: newScores
        },
        screen: {
          ...gameData.screen,
          active: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? `${color}-score` : (gameData.screen?.active || ''),
          scoreAdjusting: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? true : (gameData.screen?.scoreAdjusting || false)
        }
      };
      saveData(updatedGameData);
    }
  }, [gameData, updateScore, updateField, updateScreenActive, updateScoreAdjusting, saveData, isCtrl]);

  // タイマー切り替えハンドラー
  const handleTimerToggle = useCallback((color, isRunning, updatedTime = null) => {
    const currentTime = updatedTime || gameData[color].time;
    
    if (isRunning) {
      // 他のタイマーが動いている場合は停止
      if (color === 'red' && gameData.blue.isRun) {
        updateTimer('blue', gameData.blue.time, false);
      } else if (color === 'blue' && gameData.red.isRun) {
        updateTimer('red', gameData.red.time, false);
      }
      
      // タイマー開始
      updateTimer(color, currentTime, true);
      // data-activeを設定（ctrlモードのみ）
      if (isCtrl) {
        updateScreenActive(`${color}-time`);
        
        // タイマー開始を保存（ctrlモードの場合のみ）
        if (saveData) {
          const updatedGameData = {
            ...gameData,
            [color]: {
              ...gameData[color],
              isRun: true,
              time: currentTime
            },
            screen: {
              ...gameData.screen,
              active: `${color}-time`
            }
          };
          saveData(updatedGameData);
        }
      }
    } else {
      // タイマー停止
      updateTimer(color, currentTime, false);
      
      // penaltyThrow中かどうかを判定
      // gameData.screen.penaltyThrowの状態を使用
      // 開始条件：すべてのボールが0で、ペナルティボールが1以上
      // 終了条件：ボールを投げきる（すべてのボールが0になる）
      const isPenaltyThrow = gameData.screen?.penaltyThrow || false;
      
      // penaltyThrow中の場合、ペナルティボールを-1
      if (isPenaltyThrow && gameData[color].penaltyBall > 0) {
        const newPenaltyBall = gameData[color].penaltyBall - 1;
        updateField(color, 'penaltyBall', newPenaltyBall);
        
        // まだペナルティボールが1以上残っている場合、タイマーを1分に戻す
        const shouldResetTimer = newPenaltyBall > 0;
        const timerTime = shouldResetTimer ? 60000 : currentTime;
        
        if (shouldResetTimer) {
          updateTimer(color, 60000, false);
        }
        
        // タイマー停止時にボールを1つ減らす
        if (gameData[color].ball > 0) {
          const newBallCount = gameData[color].ball - 1;
          updateBall(color, newBallCount);
          
          // ボール更新とペナルティボール更新を保存（ctrlモードの場合のみ）
          if (isCtrl && saveData) {
            const updatedGameData = {
              ...gameData,
              [color]: {
                ...gameData[color],
                isRun: false,
                time: timerTime,
                ball: newBallCount,
                penaltyBall: newPenaltyBall
              },
              screen: {
                ...gameData.screen,
                active: ''
              }
            };
            saveData(updatedGameData);
          }
        } else {
          // ボールが0の場合でもタイマー停止とペナルティボール更新を保存（ctrlモードの場合のみ）
          if (isCtrl && saveData) {
            const updatedGameData = {
              ...gameData,
              [color]: {
                ...gameData[color],
                isRun: false,
                time: timerTime,
                penaltyBall: newPenaltyBall
              },
              screen: {
                ...gameData.screen,
                active: ''
              }
            };
            saveData(updatedGameData);
          }
        }
      } else {
        // 通常のタイマー停止処理（penaltyThrow中でない場合）
        // タイマー停止時にボールを1つ減らす（ボールが0より大きい場合のみ）
        if (gameData[color].ball > 0) {
          const newBallCount = gameData[color].ball - 1;
          updateBall(color, newBallCount);
          
          // ボール更新を保存（ctrlモードの場合のみ）
          if (isCtrl && saveData) {
            const updatedGameData = {
              ...gameData,
              [color]: {
                ...gameData[color],
                isRun: false,
                time: currentTime,
                ball: newBallCount
              },
              screen: {
                ...gameData.screen,
                active: ''
              }
            };
            saveData(updatedGameData);
          }
        } else {
          // ボールが0の場合でもタイマー停止を保存（ctrlモードの場合のみ）
          if (isCtrl && saveData) {
            const updatedGameData = {
              ...gameData,
              [color]: {
                ...gameData[color],
                isRun: false,
                time: currentTime
              },
              screen: {
                ...gameData.screen,
                active: ''
              }
            };
            saveData(updatedGameData);
          }
        }
      }
    }
    
    // タイマー停止時にdata-activeを空にする（ctrlモードのみ、最後に1回だけ実行）
    if (!isRunning && isCtrl) {
      updateScreenActive('');
    }
  }, [gameData, updateTimer, updateBall, updateScreenActive, saveData, isCtrl]);

  // ボール変更ハンドラー
  const handleBallChange = useCallback((color, newBallValue) => {
    updateBall(color, newBallValue);
    
    // ボール更新を保存（ctrlモードの場合のみ）
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        [color]: {
          ...gameData[color],
          ball: newBallValue
        }
      };
      saveData(updatedGameData);
    }
  }, [updateBall, gameData, saveData, isCtrl]);

  // タイブレーク選択ハンドラー
  const handleTieBreakSelect = useCallback((event) => {
    event.stopPropagation();
    event.preventDefault();
    
    const scoreboardElement = document.getElementById('scoreboard');
    if (scoreboardElement) {
      // ボタンの色を取得（redまたはblue）
      const buttonName = event.target.name;
      const color = buttonName.includes('red') ? 'red' : 'blue';
      const otherColor = color === 'red' ? 'blue' : 'red';
      
      // data-tieBreak属性を設定
      scoreboardElement.setAttribute('data-tieBreak', color);
      
      // 押されたボタンのvalueを"true"に変更（非表示にするため）
      event.target.value = 'true';
      
      // もう一方のボタンのvalueを"false"に戻す（復活させるため）
      const otherButton = document.querySelector(`[name="${otherColor}TieBreakBtnPanel"]`);
      if (otherButton) {
        otherButton.value = 'false';
      }
      
      // エンドセクションまたはタイブレークセクションの場合、点数調整と同じ処理を行う
      const currentSection = gameData.match?.section || '';
      if (currentSection.startsWith('end') || currentSection === 'tieBreak') {
        if (isCtrl) {
          // ctrlモードの時は、activeを設定し、scoreAdjustingフラグをtrueにする
          if (color === 'red') {
            updateScreenActive('red-score');
          } else if (color === 'blue') {
            updateScreenActive('blue-score');
          }
          // 得点調整ボタンが押されたことを示すフラグを設定
          if (updateScoreAdjusting) {
            updateScoreAdjusting(true);
          }
        }
      }
      
      // game.jsonのred.tieBreakまたはblue.tieBreakをtrueに設定
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          [color]: {
            ...gameData[color],
            tieBreak: true
          },
          [otherColor]: {
            ...gameData[otherColor],
            tieBreak: false
          },
          screen: {
            ...gameData.screen,
            active: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? `${color}-score` : (gameData.screen?.active || ''),
            scoreAdjusting: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? true : (gameData.screen?.scoreAdjusting || false)
          }
        };
        saveData(updatedGameData);
      }
      
      scoreboardElement.classList.add('next');
    }
  }, [isCtrl, saveData, gameData, updateScreenActive, updateScoreAdjusting]);

  // セクション進行ハンドラー
  const handleNextSection = useCallback(() => {
    const currentSectionID = gameData.match?.sectionID || 0;
    const currentSection = gameData.match?.section || 'standby';
    const nextSectionID = currentSectionID + 1;
    const sections = gameData.match?.sections || GAME_SECTIONS;
    const nextSection = sections[nextSectionID];

    if (nextSection) {
      // エンド番号を計算
      const extractEndNumber = (sectionName) => {
        if (sectionName && sectionName.startsWith('end')) {
          return parseInt(sectionName.replace('end', ''), 10);
        }
        return 0;
      };
      const endNumber = extractEndNumber(nextSection);
      
      // 現在のセクションがwarmupの場合、ウォームアップタイマーを停止し、limitにリセット
      if (currentSection === 'warmup') {
        updateTimer('warmup', gameData.warmup.limit, false);
      }
      
      // インターバルセクションに移行するとき、インターバルタイマーを1分に設定して開始
      if (nextSection === 'interval') {
        // インターバルタイマーを1分（60000ミリ秒）に設定してカウントダウン開始
        updateTimer('interval', TIMER_LIMITS.INTERVAL, true);
        
        if (isCtrl) {
          // scoreAdjustingフラグをリセット
          if (updateScoreAdjusting) {
            updateScoreAdjusting(false);
          }
        }
      }
      
      // エンドセクションの場合、タイマーとボール数をリセット（データ保存の前に実行）
      if (nextSection.startsWith('end')) {
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
        updateTimer('red', TIMER_LIMITS.GAME, false);
        updateTimer('blue', TIMER_LIMITS.GAME, false);
        
        // エンド開始時はすべてのタイマーを停止状態にし、時間をlimitにリセット
        updateField('warmup', 'isRun', false);
        updateField('warmup', 'time', gameData.warmup.limit);
        updateField('interval', 'isRun', false);
        updateField('interval', 'time', gameData.interval.limit);
        
        // エンド開始時はdata-tieBreak属性を空にする
        const scoreboardElement = document.getElementById('scoreboard');
        if (scoreboardElement) {
          scoreboardElement.removeAttribute('data-tieBreak');
        }
        
        // エンド開始時はsectionNavを非表示にするため、screen.activeを空にする
        if (isCtrl) {
          updateScreenActive('');
          // エンド開始時はscoreAdjustingフラグもリセット
          if (updateScoreAdjusting) {
            updateScoreAdjusting(false);
          }
        }
      }
      
      // タイブレークセクションの場合、tieBreakの値に応じてボール数とタイマーを設定
      if (nextSection === 'tieBreak') {
        // "finalShot"の場合はボール1、タイマー1分、それ以外（"extraEnd"など）の場合はボール6、タイマー通常
        const tieBreakType = gameData.match?.tieBreak || 'extraEnd';
        const redBalls = tieBreakType === 'finalShot' ? 1 : 6;
        const blueBalls = tieBreakType === 'finalShot' ? 1 : 6;
        const redTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
        const blueTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
        
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
        updateTimer('red', redTime, false);
        updateTimer('blue', blueTime, false);
        
        // エンド開始時はすべてのタイマーを停止状態にし、時間をlimitにリセット
        updateField('warmup', 'isRun', false);
        updateField('warmup', 'time', gameData.warmup.limit);
        updateField('interval', 'isRun', false);
        updateField('interval', 'time', gameData.interval.limit);
        
        // エンド開始時はsectionNavを非表示にするため、screen.activeを空にする
        if (isCtrl) {
          updateScreenActive('');
          // エンド開始時はscoreAdjustingフラグもリセット
          if (updateScoreAdjusting) {
            updateScoreAdjusting(false);
          }
        }
      }
      
      // 試合終了セクションに移行する場合、勝敗判定を行う
      if (nextSection === 'matchFinished') {
        const scoreboardElement = document.getElementById('scoreboard');
        const redScore = gameData.red?.score || 0;
        const blueScore = gameData.blue?.score || 0;
        let winner = null;

        // まずスコアを比較（スコアが高い方が勝者を優先）
        if (redScore > blueScore) {
          winner = 'red';
          // スコアに差がある場合、タイブレーク関連をリセット
          if (scoreboardElement) {
            scoreboardElement.removeAttribute('data-tieBreak');
          }
        } else if (blueScore > redScore) {
          winner = 'blue';
          // スコアに差がある場合、タイブレーク関連をリセット
          if (scoreboardElement) {
            scoreboardElement.removeAttribute('data-tieBreak');
          }
        } else {
          // 同点の場合、タイブレークで勝敗を判断
          const tieBreakColor = scoreboardElement?.getAttribute('data-tieBreak');
          if (tieBreakColor === 'red') {
            winner = 'red';
          } else if (tieBreakColor === 'blue') {
            winner = 'blue';
          } else {
            // data-tieBreak属性がない場合、gameDataのtieBreakフィールドを確認
            if (gameData.red?.tieBreak === true) {
              winner = 'red';
            } else if (gameData.blue?.tieBreak === true) {
              winner = 'blue';
            }
            // タイブレークもない場合は引き分け（winner = null）
          }
        }
        
        // data-win属性を設定
        if (scoreboardElement) {
          if (winner === 'red') {
            scoreboardElement.setAttribute('data-win', 'red');
          } else if (winner === 'blue') {
            scoreboardElement.setAttribute('data-win', 'blue');
          } else {
            scoreboardElement.setAttribute('data-win', 'draw');
          }
        }
      }
      
      updateSection(nextSection, nextSectionID);
      
      // 更新されたゲームデータを保存
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          match: {
            ...gameData.match,
            sectionID: nextSectionID,
            section: nextSection,
            end: endNumber
          },
          screen: {
            ...gameData.screen,
            active: nextSection.startsWith('end') ? '' : gameData.screen?.active || '',
            // インターバルセクションに移行するとき、scoreAdjustingをfalseにリセット
            scoreAdjusting: nextSection === 'interval' ? false : (nextSection.startsWith('end') ? false : gameData.screen?.scoreAdjusting || false)
          }
        };
        
        // warmupセクションから移行する場合、タイマーも停止状態で保存し、limitにリセット
        if (currentSection === 'warmup') {
          updatedGameData.warmup = {
            ...gameData.warmup,
            time: gameData.warmup.limit,
            isRun: false
          };
        }
        
        // インターバルセクションに移行する場合、インターバルタイマーを開始状態で保存
        if (nextSection === 'interval') {
          updatedGameData.interval = {
            ...gameData.interval,
            time: TIMER_LIMITS.INTERVAL,
            isRun: true
          };
        }
        
        // エンドセクションの場合、タイマーとボール数のリセット状態も保存
        if (nextSection.startsWith('end')) {
          const redBalls = calculateBallCount(endNumber, 'red');
          const blueBalls = calculateBallCount(endNumber, 'blue');
          
          updatedGameData.red = {
            ...gameData.red,
            time: TIMER_LIMITS.GAME,
            isRun: false,
            ball: redBalls
          };
          updatedGameData.blue = {
            ...gameData.blue,
            time: TIMER_LIMITS.GAME,
            isRun: false,
            ball: blueBalls
          };
          
          // エンド開始時はすべてのタイマーを停止状態で保存し、時間をlimitにリセット
          updatedGameData.warmup = {
            ...gameData.warmup,
            time: gameData.warmup.limit,
            isRun: false
          };
          updatedGameData.interval = {
            ...gameData.interval,
            time: gameData.interval.limit,
            isRun: false
          };
          
          // エンド開始時はtieBreakをfalseにリセット
          updatedGameData.match = {
            ...updatedGameData.match,
            tieBreak: false
          };
        }
        
        // タイブレークセクションの場合、tieBreakの値に応じてボール数とタイマーを設定
        if (nextSection === 'tieBreak') {
          // "finalShot"の場合はボール1、タイマー1分、それ以外（"extraEnd"など）の場合はボール6、タイマー通常
          const tieBreakType = gameData.match?.tieBreak || 'extraEnd';
          const redBalls = tieBreakType === 'finalShot' ? 1 : 6;
          const blueBalls = tieBreakType === 'finalShot' ? 1 : 6;
          const redTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
          const blueTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
          
          updatedGameData.red = {
            ...gameData.red,
            time: redTime,
            isRun: false,
            ball: redBalls
          };
          updatedGameData.blue = {
            ...gameData.blue,
            time: blueTime,
            isRun: false,
            ball: blueBalls
          };
          
          // エンド開始時はすべてのタイマーを停止状態で保存し、時間をlimitにリセット
          updatedGameData.warmup = {
            ...gameData.warmup,
            time: gameData.warmup.limit,
            isRun: false
          };
          updatedGameData.interval = {
            ...gameData.interval,
            time: gameData.interval.limit,
            isRun: false
          };
        }
        
        // 試合終了セクションの場合、勝敗判定を行い、resultフィールドを設定
        if (nextSection === 'matchFinished') {
          const scoreboardElement = document.getElementById('scoreboard');
          const redScore = gameData.red?.score || 0;
          const blueScore = gameData.blue?.score || 0;
          let winner = null;

          // まずスコアを比較（スコアが高い方が勝者を優先）
          if (redScore > blueScore) {
            winner = 'red';
            // スコアに差がある場合、タイブレーク関連をリセット
            updatedGameData.red = {
              ...gameData.red,
              tieBreak: false,
              result: 'win'
            };
            updatedGameData.blue = {
              ...gameData.blue,
              tieBreak: false,
              result: 'lose'
            };
          } else if (blueScore > redScore) {
            winner = 'blue';
            // スコアに差がある場合、タイブレーク関連をリセット
            updatedGameData.red = {
              ...gameData.red,
              tieBreak: false,
              result: 'lose'
            };
            updatedGameData.blue = {
              ...gameData.blue,
              tieBreak: false,
              result: 'win'
            };
          } else {
            // 同点の場合、タイブレークで勝敗を判断
            const tieBreakColor = scoreboardElement?.getAttribute('data-tieBreak');
            if (tieBreakColor === 'red') {
              winner = 'red';
            } else if (tieBreakColor === 'blue') {
              winner = 'blue';
            } else {
              // data-tieBreak属性がない場合、gameDataのtieBreakフィールドを確認
              if (gameData.red?.tieBreak === true) {
                winner = 'red';
              } else if (gameData.blue?.tieBreak === true) {
                winner = 'blue';
              }
              // タイブレークもない場合は引き分け（winner = null）
            }
            
            // resultフィールドを設定
            updatedGameData.red = {
              ...gameData.red,
              result: winner === 'red' ? 'win' : (winner === 'blue' ? 'lose' : 'draw')
            };
            updatedGameData.blue = {
              ...gameData.blue,
              result: winner === 'blue' ? 'win' : (winner === 'red' ? 'lose' : 'draw')
            };
          }
        }
        
        saveData(updatedGameData);
      }
    }
  }, [gameData, updateSection, updateBall, updateTimer, updateScoreAdjusting, isCtrl, saveData]);

  // ウォームアップ開始ハンドラー
  const handleStartWarmup = useCallback(() => {
    updateSection('warmup', 1);
    
    // ウォームアップタイマーを開始
    const warmupTime = gameData.warmup.time !== undefined ? gameData.warmup.time : gameData.warmup.limit;
    updateTimer('warmup', warmupTime, true);
    
    // ctrlモードの場合のみ保存
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        match: {
          ...gameData.match,
          sectionID: 1,
          section: 'warmup'
        },
        warmup: {
          ...gameData.warmup,
          isRun: true,
          time: warmupTime
        }
      };
      saveData(updatedGameData);
    }
  }, [updateSection, updateTimer, gameData, isCtrl, saveData]);

  // ウォームアップタイマー切り替えハンドラー（useScoreboardで上書きされる）
  const handleWarmupTimerToggle = useCallback(() => {
    // この関数はuseScoreboardで上書きされます
  }, []);

  // インターバルタイマー切り替えハンドラー（useScoreboardで上書きされる）
  const handleIntervalTimerToggle = useCallback(() => {
    // この関数はuseScoreboardで上書きされます
  }, []);

  // タイブレーク（追加エンド）ハンドラー
  const handleTieBreak = useCallback(() => {
    const currentSectionID = gameData.match?.sectionID || 0;
    const sections = [...(gameData.match?.sections || GAME_SECTIONS)];
    
    // 既にタイブレークセクションが存在する場合は、そのセクションに移行
    const existingTieBreakIndex = sections.indexOf('tieBreak');
    if (existingTieBreakIndex !== -1) {
      const totalEnds = gameData.match?.totalEnds || 0;
      const tieBreakEnd = totalEnds + 1;
      
      // タイブレークセクションの時は、tieBreakの値に応じてボール数とタイマーを設定
      // "finalShot"の場合はボール1、タイマー1分、それ以外（"extraEnd"など）の場合はボール6、タイマー通常
      const tieBreakType = gameData.match?.tieBreak || 'extraEnd';
      const redBalls = tieBreakType === 'finalShot' ? 1 : 6;
      const blueBalls = tieBreakType === 'finalShot' ? 1 : 6;
      const redTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
      const blueTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
      
      updateBall('red', redBalls);
      updateBall('blue', blueBalls);
      updateTimer('red', redTime, false);
      updateTimer('blue', blueTime, false);
      
      updateSection('tieBreak', existingTieBreakIndex);
      
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          match: {
            ...gameData.match,
            sectionID: existingTieBreakIndex,
            section: 'tieBreak',
            end: tieBreakEnd
          },
          red: {
            ...gameData.red,
            time: redTime,
            isRun: false,
            ball: redBalls
          },
          blue: {
            ...gameData.blue,
            time: blueTime,
            isRun: false,
            ball: blueBalls
          },
          screen: {
            ...gameData.screen,
            active: ''
          }
        };
        saveData(updatedGameData);
      }
      return;
    }
    
    // 現在のセクションが最終エンドの場合、タイブレークとその前のインターバルを動的に追加
    const currentSection = sections[currentSectionID];
    const isLastEnd = currentSection && currentSection.startsWith('end') && 
      parseInt(currentSection.replace('end', ''), 10) === (gameData.match?.totalEnds || 0);
    
    if (isLastEnd) {
      // 最終エンドの後に、インターバルとタイブレークを追加
      const newSections = [...sections];
      const insertIndex = currentSectionID + 1;
      newSections.splice(insertIndex, 0, 'interval', 'tieBreak');
      
      // インターバルセクションのインデックスを計算
      const intervalSectionID = insertIndex;
      
      // インターバルタイマーを1分に設定して開始
      updateTimer('interval', TIMER_LIMITS.INTERVAL, true);
      
      // scoreAdjustingフラグをリセット
      if (isCtrl && updateScoreAdjusting) {
        updateScoreAdjusting(false);
      }
      
      // インターバルセクションに移行（sections配列も更新）
      updateSection('interval', intervalSectionID, newSections);
      
      // 更新されたゲームデータを保存（sections配列も更新）
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          match: {
            ...gameData.match,
            sectionID: intervalSectionID,
            section: 'interval',
            sections: newSections,
            end: 0
          },
          interval: {
            ...gameData.interval,
            time: TIMER_LIMITS.INTERVAL,
            isRun: true
          },
          screen: {
            ...gameData.screen,
            active: '',
            scoreAdjusting: false
          }
        };
        saveData(updatedGameData);
      }
    }
  }, [updateSection, updateTimer, updateScoreAdjusting, gameData, isCtrl, saveData, updateBall]);

  // ファイナルショットハンドラー
  const handleFinalShot = useCallback(() => {
    resetForFinalShot();
    const finalShotSectionID = gameData.match.sections?.indexOf('finalShot') || 5;
    updateSection('finalShot', finalShotSectionID);
    
    // 更新されたゲームデータを保存
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        match: {
          ...gameData.match,
          sectionID: finalShotSectionID,
          section: 'finalShot',
          end: 0
        },
        screen: {
          ...gameData.screen,
          active: ''
        }
      };
      saveData(updatedGameData);
    }
  }, [resetForFinalShot, updateSection, gameData, isCtrl, saveData]);


  // タイマー終了時のモーダル表示ハンドラー
  const handleTimerEnd = useCallback(() => {
    setShowTimeModal(true);
    setTimeout(() => setShowTimeModal(false), UI_CONSTANTS.TIME_MODAL_DISPLAY_DURATION);
  }, [setShowTimeModal]);

  // リセットハンドラー
  const handleReset = useCallback(() => {
    // ゲームデータをリセット
    if (saveData) {
      const resetData = {
        matchID: '',
        match: {
          totalEnds: 4,
          sectionID: 0
        },
        screen: {
          active: '',
          setColor: false
        },
        warmup: {
          limit: 120000
        },
        interval: {
          limit: 60000
        },
        red: {
          name: '',
          score: 0,
          scores: [],
          limit: 300000,
          ball: 7,
          isRun: false,
          time: 300000,
          tieBreak: false,
          result: '',
          playerID: ''
        },
        blue: {
          name: '',
          score: 0,
          scores: [],
          limit: 300000,
          ball: 6,
          isRun: false,
          time: 300000,
          tieBreak: false,
          result: '',
          playerID: '',
          reset: ''
        },
        courtId: '',
        class: '',
        matchName: '',
        lastUpdated: new Date().toISOString()
      };
      saveData(resetData);
    }
  }, [saveData]);

  // セクション変更ハンドラー
  const handleSectionChange = useCallback((section, sectionID) => {
    // セクション情報を更新
    if (updateSection) {
      updateSection(section, sectionID);
    }
    
    // セクション変更時にボール数を再計算
    const { redBalls, blueBalls } = calculateBallCount(gameData, sectionID);
    if (redBalls !== gameData.red.ball) {
      updateBall('red', redBalls);
    }
    if (blueBalls !== gameData.blue.ball) {
      updateBall('blue', blueBalls);
    }
  }, [gameData, updateSection, updateBall]);

  // エンド選択ハンドラー
  const handleEndsSelect = useCallback((e) => {
    // 子要素（円やラベル）をクリックした場合でも、ボタン要素から値を取得
    const button = e.currentTarget;
    const sectionID = parseInt(button.value);
    const section = button.getAttribute('data-word');
    
    if (!section || isNaN(sectionID)) {
      return;
    }
    
    // エンド番号を計算
    const extractEndNumber = (sectionName) => {
      if (sectionName && sectionName.startsWith('end')) {
        return parseInt(sectionName.replace('end', ''), 10);
      }
      return 0;
    };
    const endNumber = extractEndNumber(section);
    
    // エンドセクションに切り替える場合、タイマーとボールをリセット（インターバル終了時と同じ処理）
    if (section.startsWith('end')) {
      const redBalls = calculateBallCount(endNumber, 'red');
      const blueBalls = calculateBallCount(endNumber, 'blue');
      
      updateBall('red', redBalls);
      updateBall('blue', blueBalls);
      updateTimer('red', TIMER_LIMITS.GAME, false);
      updateTimer('blue', TIMER_LIMITS.GAME, false);
      
      // エンド開始時はすべてのタイマーを停止状態にし、時間をlimitにリセット
      updateField('warmup', 'isRun', false);
      updateField('warmup', 'time', gameData.warmup.limit);
      updateField('interval', 'isRun', false);
      updateField('interval', 'time', gameData.interval.limit);
    }
    
    handleSectionChange(section, sectionID);
    
    // エンド切り替え時はsectionNavの中身を消すため、activeとscoreAdjustingをリセット
    if (isCtrl) {
      updateScreenActive('');
      if (updateScoreAdjusting) {
        updateScoreAdjusting(false);
      }
    }
    
    // 更新されたゲームデータを保存
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        match: {
          ...gameData.match,
          sectionID: sectionID,
          section: section,
          end: endNumber
        },
        screen: {
          ...gameData.screen,
          active: '',
          scoreAdjusting: false
        }
      };
      
      // エンドセクションの場合、タイマーとボール数のリセット状態も保存
      if (section.startsWith('end')) {
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        
        updatedGameData.red = {
          ...gameData.red,
          time: TIMER_LIMITS.GAME,
          isRun: false,
          ball: redBalls
        };
        updatedGameData.blue = {
          ...gameData.blue,
          time: TIMER_LIMITS.GAME,
          isRun: false,
          ball: blueBalls
        };
        
        // エンド開始時はすべてのタイマーを停止状態で保存し、時間をlimitにリセット
        updatedGameData.warmup = {
          ...gameData.warmup,
          time: gameData.warmup.limit,
          isRun: false
        };
        updatedGameData.interval = {
          ...gameData.interval,
          time: gameData.interval.limit,
          isRun: false
        };
      }
      
      saveData(updatedGameData);
    }
  }, [handleSectionChange, isCtrl, saveData, gameData, updateScreenActive, updateScoreAdjusting, updateBall, updateTimer, updateField]);

  // 時間調整ハンドラー
  const handleTimeAdjust = useCallback((timerType, adjustment) => {
    const adjustmentMs = parseInt(adjustment);
    const currentTime = gameData[timerType]?.time || 0;
    const limit = gameData[timerType]?.limit || 300000; // デフォルト5分
    
    // 新しい時間を計算（limitを超えない、0ミリ秒以下にならない）
    const newTime = Math.max(0, Math.min(limit, currentTime + adjustmentMs));
    
    // 時間が変更されていない場合は何もしない
    if (newTime === currentTime) {
      return;
    }
    
    // タイマーの種類に応じて更新方法を分岐
    if (timerType === 'interval' || timerType === 'warmup') {
      // interval と warmup の場合は updateField を直接使用
      updateField(timerType, 'time', newTime);
    } else {
      // red と blue の場合は updateTimer を使用（isRun は現在の状態を維持）
      const isRun = gameData[timerType]?.isRun || false;
      updateTimer(timerType, newTime, isRun);
    }
    
    // ゲームデータを保存
    if (saveData) {
      const updatedGameData = {
        ...gameData,
        [timerType]: {
          ...gameData[timerType],
          time: newTime
        }
      };
      saveData(updatedGameData);
    }
  }, [gameData, updateField, updateTimer, saveData]);

  // エンド再開ハンドラー
  const handleRestartEnd = useCallback(() => {
    // data-scoreadjustをfalseに、data-activeを空にする
    if (isCtrl) {
      updateScreenActive('');
      if (updateScoreAdjusting) {
        updateScoreAdjusting(false);
      }
    }
    
    // 更新されたゲームデータを保存
    if (isCtrl && saveData) {
      const updatedGameData = {
        ...gameData,
        screen: {
          ...gameData.screen,
          active: '',
          scoreAdjusting: false
        }
      };
      saveData(updatedGameData);
    }
  }, [isCtrl, updateScreenActive, updateScoreAdjusting, gameData, saveData]);

  // 現在の言語でテキストを取得する関数
  const getText = useCallback((key) => {
    return getLocalizedText(key, currentLang);
  }, [currentLang]);

  // チーム名を入れ替えるハンドラー
  const handleSwapTeamNames = useCallback(() => {
    if (!gameData || !gameData.red || !gameData.blue) {
      return;
    }
    
    const redName = gameData.red.name || '';
    const blueName = gameData.blue.name || '';
    
    // 名前を入れ替える
    const updatedGameData = {
      ...gameData,
      red: {
        ...gameData.red,
        name: blueName
      },
      blue: {
        ...gameData.blue,
        name: redName
      }
    };
    
    // updateFieldで名前を更新
    if (updateField) {
      updateField('red', 'name', blueName);
      updateField('blue', 'name', redName);
    }
    
    // ctrlモードの場合のみ保存
    if (isCtrl && saveData) {
      saveData(updatedGameData);
    }
  }, [gameData, updateField, saveData, isCtrl]);

  return {
    handleSelect,
    scoreAdjust,
    handleTimerToggle,
    handleBallChange,
    handleTieBreakSelect,
    handleTieBreak,
    handleRestartEnd,
    handleNextSection,
    handleStartWarmup,
    handleWarmupTimerToggle,
    handleIntervalTimerToggle,
    handleFinalShot,
    handleTimerEnd,
    handleReset,
    handleSectionChange,
    handleEndsSelect,
    handleTimeAdjust,
    handleSwapTeamNames,
    getText
  };
};

