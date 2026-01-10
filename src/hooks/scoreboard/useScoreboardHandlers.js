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
              isRunning: false
            },
            blue: {
              ...gameData.blue,
              isRunning: false
            },
            screen: {
              ...gameData.screen,
              active: activeValue,
              isScoreAdjusting: gameData.screen?.isScoreAdjusting ?? false
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
    
    // エンドスコアも更新（red.scoreの加減算と連動）
    const currentSection = gameData.match?.section || '';
    const sectionID = gameData.match?.sectionID || 0;
    const sections = gameData.match?.sections || [];
    
    let endNumber = 0;
    
    if (currentSection === 'interval') {
      // インターバルセクションの場合、1つ前のエンドセクションを取得
      const prevSectionID = sectionID - 1;
      const prevSection = sections[prevSectionID];
      
      if (prevSection && prevSection.startsWith('end')) {
        // 前のセクションがエンドの場合、そのエンド番号を取得
        endNumber = parseInt(prevSection.replace('end', ''), 10);
      }
    } else {
      // エンドセクションまたはタイブレークセクションの場合
      endNumber = gameData.match?.end || 0;
    }
    
    if (endNumber > 0) {
      // match.ends配列を更新
      const ends = [...(gameData.match?.ends || [])];
      
      // 当該エンドのエントリを確認・作成
      let endEntryIndex = ends.findIndex(e => e.end === endNumber);
      if (endEntryIndex === -1) {
        ends.push({ 
          end: endNumber, 
          shots: [], 
          redScore: 0, 
          blueScore: 0
        });
        endEntryIndex = ends.length - 1;
      }
      
      // スコアを更新
      if (color === 'red') {
        const currentEndScore = ends[endEntryIndex].redScore || 0;
        ends[endEntryIndex] = {
          ...ends[endEntryIndex],
          redScore: Math.max(0, currentEndScore + delta)
        };
      } else {
        const currentEndScore = ends[endEntryIndex].blueScore || 0;
        ends[endEntryIndex] = {
          ...ends[endEntryIndex],
          blueScore: Math.max(0, currentEndScore + delta)
        };
      }
      
      // match.endsを更新
      updateField('match', 'ends', ends);
      
      // スコア調整後、データを保存（ends配列も含める）
      if (isCtrl && saveData) {
        const updatedGameData = {
          ...gameData,
          match: {
            ...gameData.match,
            ends: ends
          },
          red: {
            ...gameData.red,
            score: color === 'red' ? newScore : gameData.red?.score || 0
          },
          blue: {
            ...gameData.blue,
            score: color === 'blue' ? newScore : gameData.blue?.score || 0
          },
          screen: {
            ...gameData.screen,
            active: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? `${color}-score` : (gameData.screen?.active || ''),
            isScoreAdjusting: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? true : (gameData.screen?.isScoreAdjusting || false)
          }
        };
        saveData(updatedGameData);
      }
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
  }, [gameData, updateScore, updateField, updateScreenActive, updateScoreAdjusting, saveData, isCtrl]);

  // タイマー切り替えハンドラー
  const handleTimerToggle = useCallback((color, isRunning, updatedTime = null) => {
    // updatedTimeが渡されている場合はそれを使用（0.1秒単位の正確な値）
    // 渡されていない場合はgameDataから取得（初期値やリセット時）
    const currentTime = updatedTime !== null ? updatedTime : gameData[color].time;
    
    if (isRunning) {
      // 他のタイマーが動いている場合は停止
      if (color === 'red' && gameData.blue.isRunning) {
        updateTimer('blue', gameData.blue.time, false);
      } else if (color === 'blue' && gameData.red.isRunning) {
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
                isRunning: true,
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
      // gameData.screen.isPenaltyThrowの状態を使用
      // 開始条件：すべてのボールが0で、ペナルティボールが1以上
      // 終了条件：ボールを投げきる（すべてのボールが0になる）
      const isPenaltyThrow = gameData.screen?.isPenaltyThrow || false;

      // 投球履歴の更新ロジック
      const currentEnd = gameData.match?.end || 0;
      const currentBall = gameData[color]?.ball || 0;
      const isNormalEnd = (gameData.match?.section || '').startsWith('end');
      const isTieBreak = gameData.match?.section === 'tieBreak';
      let updatedEnds = [...(gameData.match?.ends || [])];

      // ジャック(7)を除外し、カラーボール(6以下)のみ、かつエンド中かタイブレーク中のみ記録
      if (currentBall <= 6 && (isNormalEnd || isTieBreak) && !isPenaltyThrow) {
        const shotChar = color === 'red' ? 'R' : 'B';
        const endEntryIndex = updatedEnds.findIndex(e => e.end === currentEnd);

        if (endEntryIndex !== -1) {
          const shots = [...(updatedEnds[endEntryIndex].shots || []), shotChar];
          updatedEnds[endEntryIndex] = { ...updatedEnds[endEntryIndex], shots };
        } else {
          updatedEnds.push({ 
            end: currentEnd, 
            shots: [shotChar],
            redScore: 0,
            blueScore: 0
          });
        }
        updateField('match', 'ends', updatedEnds);
      }

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
              match: {
                ...gameData.match,
                ends: updatedEnds
              },
              [color]: {
                ...gameData[color],
                isRunning: false,
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
              match: {
                ...gameData.match,
                ends: updatedEnds
              },
              [color]: {
                ...gameData[color],
                isRunning: false,
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
              match: {
                ...gameData.match,
                ends: updatedEnds
              },
              [color]: {
                ...gameData[color],
                isRunning: false,
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
              match: {
                ...gameData.match,
                ends: updatedEnds
              },
              [color]: {
                ...gameData[color],
                isRunning: false,
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
            isTieBreak: true
          },
          [otherColor]: {
            ...gameData[otherColor],
            isTieBreak: false
          },
          screen: {
            ...gameData.screen,
            active: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? `${color}-score` : (gameData.screen?.active || ''),
            isScoreAdjusting: (currentSection.startsWith('end') || currentSection === 'tieBreak') ? true : (gameData.screen?.isScoreAdjusting || false)
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
        if (gameData.red?.isTieBreak === true) {
          winner = 'red';
        } else if (gameData.blue?.isTieBreak === true) {
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
      updateField('warmup', 'isRunning', false);
      updateField('warmup', 'time', gameData.warmup.limit);
      updateField('interval', 'isRunning', false);
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
      
      // エンド開始時に両チームのスコアエントリを作成（エンドセクションに移行する際）
      let recordedEnds = null;
      
      if (nextSection && nextSection.startsWith('end')) {
        const nextEndNumber = parseInt(nextSection.replace('end', ''), 10);
        if (nextEndNumber > 0) {
          const ends = [...(gameData.match?.ends || [])];
          const endEntryIndex = ends.findIndex(e => e.end === nextEndNumber);
          
          if (endEntryIndex === -1) {
            ends.push({ 
              end: nextEndNumber, 
              shots: [],
              redScore: 0,
              blueScore: 0
            });
            recordedEnds = ends;
            updateField('match', 'ends', ends);
          }
        }
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
            end: endNumber,
            ends: recordedEnds || (gameData.match?.ends || [])
          },
          screen: {
            ...gameData.screen,
            active: '',
            isColorSet: false,
            isScoreAdjusting: false,
            isPenaltyThrow: false
          }
        };
        
        // warmupセクションから移行する場合、タイマーも停止状態で保存し、limitにリセット
        if (currentSection === 'warmup' || currentSection === 'warmup1' || currentSection === 'warmup2') {
          updatedGameData.warmup = {
            ...gameData.warmup,
            time: gameData.warmup.limit,
            isRunning: false
          };
        }
        
        // セクション変更時のリセット処理を適用（すべてのセクション変更時に適用）
        // タイマー、スクリーン表示、ボールのリセット
        updatedGameData.warmup = {
          ...gameData.warmup,
          time: gameData.warmup?.limit || TIMER_LIMITS.WARMUP,
          isRunning: false
        };
        
        // インターバルセクションに移行する場合、インターバルタイマーを開始状態で保存
        if (nextSection === 'interval') {
          updatedGameData.interval = {
            ...gameData.interval,
            time: TIMER_LIMITS.INTERVAL,
            isRunning: true
          };
        } else {
          updatedGameData.interval = {
            ...gameData.interval,
            time: gameData.interval?.limit || TIMER_LIMITS.INTERVAL,
            isRunning: false
          };
        }
        updatedGameData.screen = {
          ...gameData.screen,
          active: '',
          isColorSet: false,
          isScoreAdjusting: false,
          isPenaltyThrow: false
        };
        
        // エンドセクションの場合、ボール数をエンド番号に応じて設定
        if (nextSection.startsWith('end')) {
          const redBalls = calculateBallCount(endNumber, 'red');
          const blueBalls = calculateBallCount(endNumber, 'blue');
          updatedGameData.red = {
            ...gameData.red,
            ball: redBalls,
            isRunning: false,
            time: gameData.red?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
          updatedGameData.blue = {
            ...gameData.blue,
            ball: blueBalls,
            isRunning: false,
            time: gameData.blue?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
          
          // エンド開始時はisTieBreakをfalseにリセット
          updatedGameData.red = {
            ...updatedGameData.red,
            isTieBreak: false
          };
          updatedGameData.blue = {
            ...updatedGameData.blue,
            isTieBreak: false
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
            isRunning: false,
            time: redTime,
            penaltyBall: 0
          };
          updatedGameData.blue = {
            ...gameData.blue,
            ball: blueBalls,
            isRunning: false,
            time: blueTime,
            penaltyBall: 0
          };
        } else {
          // その他のセクションの場合、ボール数を6にリセット
          updatedGameData.red = {
            ...gameData.red,
            ball: 6,
            isRunning: false,
            time: gameData.red?.limit || TIMER_LIMITS.GAME,
            penaltyBall: 0
          };
          updatedGameData.blue = {
            ...gameData.blue,
            ball: 6,
            isRunning: false,
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
              isTieBreak: false,
              result: winner === 'red' ? 'win' : 'lose'
            };
            updatedGameData.blue = {
              ...updatedGameData.blue,
              isTieBreak: false,
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
            isRunning: true,
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
              isRunning: false,
              ball: redBalls
            },
            blue: {
              ...gameData.blue,
              time: gameData.blue.limit || TIMER_LIMITS.GAME,
              isRunning: false,
              ball: blueBalls
            },
            screen: {
              ...gameData.screen,
              active: '',
              isScoreAdjusting: false
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
            isRunning: false,
            ball: redBalls
          },
          blue: {
            ...gameData.blue,
            time: blueTime,
            isRunning: false,
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
              isRunning: true
            },
            screen: {
              ...gameData.screen,
              active: '',
              isScoreAdjusting: false
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
              isRunning: false,
              ball: redBalls
            },
            blue: {
              ...gameData.blue,
              time: blueTime,
              isRunning: false,
              ball: blueBalls
            },
            screen: {
              ...gameData.screen,
              active: '',
              isScoreAdjusting: false
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

  // リセットハンドラー（試合をやりなおすためのリセット）
  const handleReset = useCallback(async () => {
    if (!id || !court || !saveData || !gameData) return;
    
    try {
      // 現在のgameDataから設定項目のみを抽出（状態は含めない）
      const settings = {
        classification: gameData.classification,
        category: gameData.category,
        matchName: gameData.matchName,
        match: {
          totalEnds: gameData.match?.totalEnds,
          warmup: gameData.match?.warmup,
          interval: gameData.match?.interval,
          rules: gameData.match?.rules,
          resultApproval: gameData.match?.resultApproval,
          tieBreak: gameData.match?.tieBreak,
          sections: gameData.match?.sections
        },
        red: {
          name: gameData.red?.name,
          limit: gameData.red?.limit,
          country: gameData.red?.country,
          profilePic: gameData.red?.profilePic
        },
        blue: {
          name: gameData.blue?.name,
          limit: gameData.blue?.limit,
          country: gameData.blue?.country,
          profilePic: gameData.blue?.profilePic
        },
        warmup: {
          limit: gameData.warmup?.limit
        },
        interval: {
          limit: gameData.interval?.limit
        }
      };

      // 試合進行データのみを初期値にリセット
      const resetGameData = {
        ...DEFAULT_GAME_DATA, // 構造のベース
        ...settings, // 設定を上書きして維持
        match: {
          ...DEFAULT_GAME_DATA.match,
          ...settings.match,
          end: 0,
          ends: [],
          sectionID: 0,
          section: 'standby',
          approvals: {
            red: false,
            referee: false,
            blue: false
          }
        },
        screen: {
          active: '',
          isColorSet: false,
          isScoreAdjusting: false,
          isPenaltyThrow: false
        },
        warmup: {
          ...DEFAULT_GAME_DATA.warmup,
          limit: settings.warmup.limit || TIMER_LIMITS.WARMUP,
          time: settings.warmup.limit || TIMER_LIMITS.WARMUP,
          isRunning: false
        },
        interval: {
          ...DEFAULT_GAME_DATA.interval,
          limit: settings.interval.limit || TIMER_LIMITS.INTERVAL,
          time: settings.interval.limit || TIMER_LIMITS.INTERVAL,
          isRunning: false
        },
        red: {
          ...DEFAULT_GAME_DATA.red,
          ...settings.red,
          score: 0,
          scores: [],
          time: settings.red.limit || TIMER_LIMITS.GAME,
          isRunning: false,
          ball: 6,
          isTieBreak: false,
          result: '',
          yellowCard: 0,
          penaltyBall: 0,
          redCard: 0
        },
        blue: {
          ...DEFAULT_GAME_DATA.blue,
          ...settings.blue,
          score: 0,
          scores: [],
          time: settings.blue.limit || TIMER_LIMITS.GAME,
          isRunning: false,
          ball: 6,
          isTieBreak: false,
          result: '',
          yellowCard: 0,
          penaltyBall: 0,
          redCard: 0
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
      
      await saveData(resetGameData);
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
      updateField('warmup', 'isRunning', false);
      updateField('warmup', 'time', gameData.warmup.limit);
      updateField('interval', 'isRunning', false);
      updateField('interval', 'time', gameData.interval.limit);
      
      // スクリーン表示をリセット
      if (isCtrl) {
        updateScreenActive('');
        if (updateScoreAdjusting) {
          updateScoreAdjusting(false);
        }
      }
      updateField('screen', 'isColorSet', false);
      updateField('screen', 'isPenaltyThrow', false);
      
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
          isRunning: false
        },
        interval: {
          ...gameData.interval,
          time: gameData.interval?.limit || TIMER_LIMITS.INTERVAL,
          isRunning: false
        },
        screen: {
          ...gameData.screen,
          active: '',
          isColorSet: false,
          isScoreAdjusting: false,
          isPenaltyThrow: false
        }
      };
      
      // エンドセクションの場合、ボール数をエンド番号に応じて設定
      if (section.startsWith('end')) {
        const redBalls = calculateBallCount(endNumber, 'red');
        const blueBalls = calculateBallCount(endNumber, 'blue');
        updatedGameData.red = {
          ...gameData.red,
          ball: redBalls,
          isRunning: false,
          time: gameData.red?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
        updatedGameData.blue = {
          ...gameData.blue,
          ball: blueBalls,
          isRunning: false,
          time: gameData.blue?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
      } else {
        // エンドセクション以外はボール数を6にリセット
        updatedGameData.red = {
          ...gameData.red,
          ball: 6,
          isRunning: false,
          time: gameData.red?.limit || TIMER_LIMITS.GAME,
          penaltyBall: 0
        };
        updatedGameData.blue = {
          ...gameData.blue,
          ball: 6,
          isRunning: false,
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
      const isRunning = gameData[timerType]?.isRunning || false;
      updateTimer(timerType, newTime, isRunning);
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
          isScoreAdjusting: false
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

