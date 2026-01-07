import { useCallback } from 'react';
import { TIMER_LIMITS, UI_CONSTANTS, GAME_SECTIONS, DEFAULT_GAME_DATA } from '../../utils/scoreboard/constants';
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
  currentLang,
  id,
  court
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
            match: {
              ...gameData.match
            },
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

  // 勝敗判定を行うヘルパー関数
  const determineMatchWinner = useCallback((redScore, blueScore, gameData, scoreboardElement) => {
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
    
    return winner;
  }, []);


  // セクション進行ハンドラー
  const handleNextSection = useCallback(() => {
    const currentSectionID = gameData.match?.sectionID || 0;
    const currentSection = gameData.match?.section || 'standby';
    const sections = gameData.match?.sections || GAME_SECTIONS;
    const totalEnds = gameData.match?.totalEnds || 0;
    
    // 最終エンド終了時に「試合終了」ボタンを押した場合、matchFinishedセクションに直接遷移
    let nextSectionID = currentSectionID + 1;
    let nextSection = sections[nextSectionID];
    const intervalEnabled = gameData.match?.interval !== 'none';
    
    // 現在のセクションが最終エンドの場合
    if (currentSection && currentSection.startsWith('end')) {
      const currentEndNumber = parseInt(currentSection.replace('end', ''), 10);
      if (currentEndNumber === totalEnds) {
        // 最終エンド終了時は、matchFinishedセクションを探す
        const matchFinishedIndex = sections.findIndex(s => s === 'matchFinished');
        if (matchFinishedIndex !== -1) {
          nextSectionID = matchFinishedIndex;
          nextSection = 'matchFinished';
        }
      } else if (!intervalEnabled) {
        // インターバルが「なし」の場合、インターバルをスキップして次のエンドに直接遷移
        const nextEndNumber = currentEndNumber + 1;
        const nextEndSection = `end${nextEndNumber}`;
        const nextEndIndex = sections.findIndex(s => s === nextEndSection);
        if (nextEndIndex !== -1) {
          nextSectionID = nextEndIndex;
          nextSection = nextEndSection;
        }
      }
    }
    
    // タイブレークセクションの後は、必ずmatchFinishedに遷移
    if (currentSection === 'tieBreak') {
      const matchFinishedIndex = sections.findIndex(s => s === 'matchFinished');
      if (matchFinishedIndex !== -1) {
        nextSectionID = matchFinishedIndex;
        nextSection = 'matchFinished';
      }
    }
    
    // インターバルが「なし」の場合、インターバルセクションをスキップ
    if (!intervalEnabled && nextSection === 'interval') {
      // 次のエンドセクションを探す
      const nextEndIndex = sections.findIndex((s, idx) => idx > nextSectionID && s.startsWith('end'));
      if (nextEndIndex !== -1) {
        nextSectionID = nextEndIndex;
        nextSection = sections[nextEndIndex];
      } else {
        // 次のエンドがない場合は、matchFinishedを探す
        const matchFinishedIndex = sections.findIndex(s => s === 'matchFinished');
        if (matchFinishedIndex !== -1) {
          nextSectionID = matchFinishedIndex;
          nextSection = 'matchFinished';
        }
      }
    }

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
      if (currentSection === 'warmup' || currentSection === 'warmup1' || currentSection === 'warmup2') {
        updateTimer('warmup', gameData.warmup.limit, false);
      }
      
      // warmup1の後はwarmup2に遷移（ウォームアップが「別々」の場合）
      if (currentSection === 'warmup1' && nextSection !== 'warmup2') {
        const warmup2Index = sections.findIndex(s => s === 'warmup2');
        if (warmup2Index !== -1) {
          nextSectionID = warmup2Index;
          nextSection = 'warmup2';
        }
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
      
      // セクション変更時のリセット処理（すべてのセクション変更時に適用）
      // エンドセクションの場合はボール数をエンド番号に応じて設定
      if (nextSection.startsWith('end')) {
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
      } else {
        // エンドセクション以外はボール数を6にリセット
        updateBall('red', 6);
        updateBall('blue', 6);
      }
      
      // タイマーをリセット
      updateTimer('red', gameData.red.limit || TIMER_LIMITS.GAME, false);
      updateTimer('blue', gameData.blue.limit || TIMER_LIMITS.GAME, false);
      updateField('warmup', 'isRun', false);
      updateField('warmup', 'time', gameData.warmup.limit);
      updateField('interval', 'isRun', false);
      updateField('interval', 'time', gameData.interval.limit);
      
      // スクリーン表示をリセット
      if (isCtrl) {
        updateScreenActive('');
        if (updateScoreAdjusting) {
          updateScoreAdjusting(false);
        }
      }
      
      // ペナルティボールをリセット
      updateField('red', 'penaltyBall', 0);
      updateField('blue', 'penaltyBall', 0);
      updateField('screen', 'penaltyThrow', false);
      
      // data-tieBreak属性を空にする
      const scoreboardElement = document.getElementById('scoreboard');
      if (scoreboardElement) {
        scoreboardElement.removeAttribute('data-tieBreak');
      }
      
      // タイブレークセクションの場合、tieBreakの値に応じてボール数とタイマーを設定
      if (nextSection === 'tieBreak') {
        // "finalShot"の場合はボール1、タイマー1分、それ以外（"extraEnd"など）の場合はボール6、タイマー通常
        const tieBreakType = gameData.match?.tieBreak || 'extraEnd';
        const redBalls = tieBreakType === 'finalShot' ? 1 : 6;
        const blueBalls = tieBreakType === 'finalShot' ? 1 : 6;
        const redTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : (gameData.red?.limit || TIMER_LIMITS.GAME);
        const blueTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : (gameData.blue?.limit || TIMER_LIMITS.GAME);
        
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
        updateTimer('red', redTime, false);
        updateTimer('blue', blueTime, false);
      }
      
      // 試合終了セクションに移行する場合、勝敗判定を行う
      if (nextSection === 'matchFinished') {
        const scoreboardElement = document.getElementById('scoreboard');
        const redScore = gameData.red?.score || 0;
        const blueScore = gameData.blue?.score || 0;
        const winner = determineMatchWinner(redScore, blueScore, gameData, scoreboardElement);
        
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
            active: '',
            setColor: false,
            scoreAdjusting: false,
            penaltyThrow: false
          }
        };
        
        // warmupセクションから移行する場合、タイマーも停止状態で保存し、limitにリセット
        if (currentSection === 'warmup' || currentSection === 'warmup1' || currentSection === 'warmup2') {
          updatedGameData.warmup = {
            ...gameData.warmup,
            time: gameData.warmup.limit,
            isRun: false
          };
        }
        
        // セクション変更時のリセット処理を適用（すべてのセクション変更時に適用）
        // タイマー、スクリーン表示、ボールのリセット
        updatedGameData.warmup = {
          ...gameData.warmup,
          time: gameData.warmup?.limit || TIMER_LIMITS.WARMUP,
          isRun: false
        };
        
        // インターバルセクションに移行する場合、インターバルタイマーを開始状態で保存
        if (nextSection === 'interval') {
          updatedGameData.interval = {
            ...gameData.interval,
            time: TIMER_LIMITS.INTERVAL,
            isRun: true
          };
        } else {
          updatedGameData.interval = {
            ...gameData.interval,
            time: gameData.interval?.limit || TIMER_LIMITS.INTERVAL,
            isRun: false
          };
        }
        updatedGameData.screen = {
          ...gameData.screen,
          active: '',
          setColor: false,
          scoreAdjusting: false,
          penaltyThrow: false
        };
        
        // エンドセクションの場合、ボール数をエンド番号に応じて設定
        if (nextSection.startsWith('end')) {
          const redBalls = calculateBallCount(endNumber, 'red');
          const blueBalls = calculateBallCount(endNumber, 'blue');
          updatedGameData.red = {
            ...gameData.red,
            ball: redBalls,
            isRun: false,
            time: gameData.red?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
          updatedGameData.blue = {
            ...gameData.blue,
            ball: blueBalls,
            isRun: false,
            time: gameData.blue?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
          
          // エンド開始時はtieBreakをfalseにリセット
          updatedGameData.match = {
            ...updatedGameData.match,
            tieBreak: false
          };
        } else if (nextSection === 'tieBreak') {
          // タイブレークセクションの場合、tieBreakの値に応じてボール数とタイマーを設定
          const tieBreakType = gameData.match?.tieBreak || 'extraEnd';
          const redBalls = tieBreakType === 'finalShot' ? 1 : 6;
          const blueBalls = tieBreakType === 'finalShot' ? 1 : 6;
          const redTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : (gameData.red?.limit || TIMER_LIMITS.GAME);
          const blueTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : (gameData.blue?.limit || TIMER_LIMITS.GAME);
          
          updatedGameData.red = {
            ...gameData.red,
            ball: redBalls,
            isRun: false,
            time: redTime,
            penaltyBall: 0
          };
          updatedGameData.blue = {
            ...gameData.blue,
            ball: blueBalls,
            isRun: false,
            time: blueTime,
            penaltyBall: 0
          };
        } else {
          // その他のセクションの場合、ボール数を6にリセット
          updatedGameData.red = {
            ...gameData.red,
            ball: 6,
            isRun: false,
            time: gameData.red?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
          updatedGameData.blue = {
            ...gameData.blue,
            ball: 6,
            isRun: false,
            time: gameData.blue?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
        }
        
        // 試合終了セクションの場合、勝敗判定を行い、resultフィールドを設定
        if (nextSection === 'matchFinished') {
          const scoreboardElement = document.getElementById('scoreboard');
          const redScore = gameData.red?.score || 0;
          const blueScore = gameData.blue?.score || 0;
          const winner = determineMatchWinner(redScore, blueScore, gameData, scoreboardElement);

          // resultフィールドを設定
          if (redScore > blueScore || blueScore > redScore) {
            // スコアに差がある場合、タイブレーク関連をリセット
            updatedGameData.red = {
              ...updatedGameData.red,
              tieBreak: false,
              result: winner === 'red' ? 'win' : 'lose'
            };
            updatedGameData.blue = {
              ...updatedGameData.blue,
              tieBreak: false,
              result: winner === 'blue' ? 'win' : 'lose'
            };
          } else {
            // 同点の場合
            updatedGameData.red = {
              ...updatedGameData.red,
              result: winner === 'red' ? 'win' : (winner === 'blue' ? 'lose' : 'draw')
            };
            updatedGameData.blue = {
              ...updatedGameData.blue,
              result: winner === 'blue' ? 'win' : (winner === 'red' ? 'lose' : 'draw')
            };
          }
        }
        
        saveData(updatedGameData);
      }
    }
  }, [gameData, updateSection, updateBall, updateTimer, updateScoreAdjusting, isCtrl, saveData, determineMatchWinner]);

  // ウォームアップ開始ハンドラー
  const handleStartWarmup = useCallback(() => {
    const warmupMode = gameData.match?.warmup || 'simultaneous';
    const warmupEnabled = warmupMode !== 'none';
    const sections = gameData.match?.sections || GAME_SECTIONS;
    
    if (warmupEnabled) {
      // ウォームアップありの場合
      let warmupSection = 'warmup';
      let warmupSectionID = 1;
      
      if (warmupMode === 'separate') {
        // ウォームアップが「別々」の場合は、warmup1から開始
        warmupSection = 'warmup1';
        warmupSectionID = sections.indexOf('warmup1');
        if (warmupSectionID === -1) {
          warmupSectionID = 1;
        }
      } else {
        // ウォームアップが「同時」の場合は、warmupから開始
        warmupSectionID = sections.indexOf('warmup');
        if (warmupSectionID === -1) {
          warmupSectionID = 1;
        }
      }
      
      updateSection(warmupSection, warmupSectionID);
      
      // ウォームアップタイマーを開始
      const warmupTime = gameData.warmup.time !== undefined ? gameData.warmup.time : gameData.warmup.limit;
      updateTimer('warmup', warmupTime, true);
      
      // ctrlモードの場合のみ保存
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          match: {
            ...gameData.match,
            sectionID: warmupSectionID,
            section: warmupSection
          },
          warmup: {
            ...gameData.warmup,
            isRun: true,
            time: warmupTime
          }
        };
        saveData(updatedGameData);
      }
    } else {
      // ウォームアップなしの場合、最初のエンドに直接遷移
      const firstEndSection = sections.find(s => s.startsWith('end'));
      if (firstEndSection) {
        const firstEndIndex = sections.indexOf(firstEndSection);
        const endNumber = parseInt(firstEndSection.replace('end', ''), 10);
        
        // 最初のエンドのボール数とタイマーを設定
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
        updateTimer('red', gameData.red.limit || TIMER_LIMITS.GAME, false);
        updateTimer('blue', gameData.blue.limit || TIMER_LIMITS.GAME, false);
        
        updateSection(firstEndSection, firstEndIndex);
        
        // ctrlモードの場合のみ保存
        if (isCtrl && saveData) {
          const updatedGameData = {
            ...gameData,
            match: {
              ...gameData.match,
              sectionID: firstEndIndex,
              section: firstEndSection,
              end: endNumber
            },
            red: {
              ...gameData.red,
              time: gameData.red.limit || TIMER_LIMITS.GAME,
              isRun: false,
              ball: redBalls
            },
            blue: {
              ...gameData.blue,
              time: gameData.blue.limit || TIMER_LIMITS.GAME,
              isRun: false,
              ball: blueBalls
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
    }
  }, [updateSection, updateTimer, updateBall, gameData, isCtrl, saveData, calculateBallCount]);

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
      const intervalEnabled = gameData.match?.interval !== 'none';
      const newSections = [...sections];
      const insertIndex = currentSectionID + 1;
      
      if (intervalEnabled) {
        // インターバルありの場合、インターバルとタイブレークを追加
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
      } else {
        // インターバルなしの場合、タイブレークのみを追加
        newSections.splice(insertIndex, 0, 'tieBreak');
        
        // タイブレークセクションのインデックスを計算
        const tieBreakSectionID = insertIndex;
        const totalEnds = gameData.match?.totalEnds || 0;
        const tieBreakEnd = totalEnds + 1;
        
        // タイブレークセクションの時は、tieBreakの値に応じてボール数とタイマーを設定
        const tieBreakType = gameData.match?.tieBreak || 'extraEnd';
        const redBalls = tieBreakType === 'finalShot' ? 1 : 6;
        const blueBalls = tieBreakType === 'finalShot' ? 1 : 6;
        const redTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
        const blueTime = tieBreakType === 'finalShot' ? TIMER_LIMITS.INTERVAL : TIMER_LIMITS.GAME;
        
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
        updateTimer('red', redTime, false);
        updateTimer('blue', blueTime, false);
        
        // scoreAdjustingフラグをリセット
        if (isCtrl && updateScoreAdjusting) {
          updateScoreAdjusting(false);
        }
        
        // タイブレークセクションに移行（sections配列も更新）
        updateSection('tieBreak', tieBreakSectionID, newSections);
        
        // 更新されたゲームデータを保存（sections配列も更新）
        if (isCtrl && saveData) {
          const updatedGameData = {
            ...gameData,
            match: {
              ...gameData.match,
              sectionID: tieBreakSectionID,
              section: 'tieBreak',
              sections: newSections,
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
              active: '',
              scoreAdjusting: false
            }
          };
          saveData(updatedGameData);
        }
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

  // リセットハンドラー（次の試合のためのリセット）
  const handleReset = useCallback(async () => {
    // constants.jsからデフォルト値を生成してリセット
    if (!id || !court || !saveData) return;
    
    try {
      const apiUrl = 'http://localhost:3001';
      
      // デフォルトデータを生成
      const resetData = JSON.parse(JSON.stringify(DEFAULT_GAME_DATA));
      
      // init.jsonからsectionsとtieBreakを取得（存在する場合）
      try {
        const initUrl = `${apiUrl}/data/${id}/init.json`;
        const initResponse = await fetch(initUrl);
        if (initResponse.ok) {
          const initData = await initResponse.json();
          if (initData.match?.sections) {
            resetData.match.sections = initData.match.sections;
          }
          if (initData.match?.tieBreak || initData.tieBreak) {
            resetData.match.tieBreak = initData.match?.tieBreak || initData.tieBreak;
          }
        }
      } catch (initError) {
        console.warn('init.jsonの読み込みに失敗しました（デフォルト値を使用）:', initError);
      }
      
      // 現在のgameDataから設定を維持（ユーザー設定）
        const preservedSettings = {
          classification: gameData?.classification || '',
          category: gameData?.category || '',
          matchName: gameData?.matchName || '',
          red: {
            name: gameData?.red?.name || '',
            limit: gameData?.red?.limit || TIMER_LIMITS.GAME
          },
          blue: {
            name: gameData?.blue?.name || '',
            limit: gameData?.blue?.limit || TIMER_LIMITS.GAME
          },
          match: {
            warmup: gameData?.match?.warmup || 'simultaneous',
            interval: gameData?.match?.interval || 'enabled',
            totalEnds: gameData?.match?.totalEnds || 4,
            rules: gameData?.match?.rules || 'worldBoccia',
            resultApproval: gameData?.match?.resultApproval || 'enabled',
            sections: gameData?.match?.sections || resetData.match?.sections,
            tieBreak: gameData?.match?.tieBreak || resetData.match?.tieBreak || 'extraEnd'
          }
        };
        
        // preservedSettingsにsectionsとtieBreakがない場合、resetDataから取得
        if (!preservedSettings.match.sections) {
          preservedSettings.match.sections = resetData.match?.sections;
        }
        if (!preservedSettings.match.tieBreak) {
          preservedSettings.match.tieBreak = resetData.match?.tieBreak || 'extraEnd';
        }
        
        // リセットデータに設定を適用
        const resetGameData = {
          ...resetData,
          ...preservedSettings,
          match: {
            ...resetData.match,
            sectionID: 0,
            section: 'standby',
            end: 0,
            ...preservedSettings.match,
            approvals: {
              red: false,
              referee: false,
              blue: false
            }
          },
          red: {
            ...resetData.red,
            score: 0,
            scores: [],
            tieBreak: false,
            result: '',
            yellowCard: 0,
            redCard: 0,
            ...preservedSettings.red,
            ball: 6,
            isRun: false,
            time: preservedSettings.red.limit,
            penaltyBall: 0
          },
          blue: {
            ...resetData.blue,
            score: 0,
            scores: [],
            tieBreak: false,
            result: '',
            yellowCard: 0,
            redCard: 0,
            ...preservedSettings.blue,
            ball: 6,
            isRun: false,
            time: preservedSettings.blue.limit,
            penaltyBall: 0
          },
          warmup: {
            ...resetData.warmup,
            time: resetData.warmup?.limit || TIMER_LIMITS.WARMUP,
            isRun: false
          },
          interval: {
            ...resetData.interval,
            time: resetData.interval?.limit || TIMER_LIMITS.INTERVAL,
            isRun: false
          },
          screen: {
            active: '',
            setColor: false,
            scoreAdjusting: false,
            penaltyThrow: false
          },
          lastUpdated: new Date().toISOString()
        };
        
        // DOM属性をリセット（勝敗・タイブレーク・反則負けの表示をクリア）
        const scoreboardElement = document.getElementById('scoreboard');
        if (scoreboardElement) {
          scoreboardElement.removeAttribute('data-win');
          scoreboardElement.removeAttribute('data-tieBreak');
          scoreboardElement.removeAttribute('data-forfeit');
        }
        
        saveData(resetGameData);
    } catch (error) {
      console.error('リセット処理エラー:', error);
    }
  }, [id, court, saveData, gameData]);

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
    
      // セクション変更時のリセット処理（すべてのセクション変更時に適用）
      // エンドセクションの場合、ボール数をエンド番号に応じて設定
      if (section.startsWith('end')) {
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        updateBall('red', redBalls);
        updateBall('blue', blueBalls);
      } else {
        // エンドセクション以外はボール数を6にリセット
        updateBall('red', 6);
        updateBall('blue', 6);
      }
      
      // タイマーをリセット
      updateTimer('red', gameData.red.limit || TIMER_LIMITS.GAME, false);
      updateTimer('blue', gameData.blue.limit || TIMER_LIMITS.GAME, false);
      updateField('warmup', 'isRun', false);
      updateField('warmup', 'time', gameData.warmup.limit);
      updateField('interval', 'isRun', false);
      updateField('interval', 'time', gameData.interval.limit);
      
      // スクリーン表示をリセット
      if (isCtrl) {
        updateScreenActive('');
        if (updateScoreAdjusting) {
          updateScoreAdjusting(false);
        }
      }
      updateField('screen', 'setColor', false);
      updateField('screen', 'penaltyThrow', false);
      
      // ペナルティボールをリセット
      updateField('red', 'penaltyBall', 0);
      updateField('blue', 'penaltyBall', 0);
      
      // セクション情報を更新
      updateSection(section, sectionID);
    
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
        // セクション変更時のリセット処理を適用（すべてのセクション変更時に適用）
        // タイマー、スクリーン表示、ボールのリセット
        warmup: {
          ...gameData.warmup,
          time: gameData.warmup?.limit || TIMER_LIMITS.WARMUP,
          isRun: false
        },
        interval: {
          ...gameData.interval,
          time: gameData.interval?.limit || TIMER_LIMITS.INTERVAL,
          isRun: false
        },
        screen: {
          ...gameData.screen,
          active: '',
          setColor: false,
          scoreAdjusting: false,
          penaltyThrow: false
        }
      };
      
      // エンドセクションの場合、ボール数をエンド番号に応じて設定
      if (section.startsWith('end')) {
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        updatedGameData.red = {
          ...gameData.red,
          ball: redBalls,
          isRun: false,
          time: gameData.red?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
        updatedGameData.blue = {
          ...gameData.blue,
          ball: blueBalls,
          isRun: false,
          time: gameData.blue?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
      } else {
        // エンドセクション以外はボール数を6にリセット
        updatedGameData.red = {
          ...gameData.red,
          ball: 6,
          isRun: false,
          time: gameData.red?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
        updatedGameData.blue = {
          ...gameData.blue,
          ball: 6,
          isRun: false,
          time: gameData.blue?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
      }
      
      saveData(updatedGameData);
    }
  }, [isCtrl, saveData, gameData, updateScreenActive, updateScoreAdjusting, updateBall, updateTimer, updateField, updateSection]);

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
    handleEndsSelect,
    handleTimeAdjust,
    handleSwapTeamNames,
    getText
  };
};

