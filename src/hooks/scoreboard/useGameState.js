import { useState, useCallback, useEffect } from 'react';
import { TIMER_LIMITS, BALL_COUNTS, GAME_SECTIONS } from '../../utils/scoreboard/constants';

/**
 * ゲーム状態管理のカスタムフック
 * @param {Object} initialData - 初期データ
 * @returns {Object} ゲーム状態と制御関数
 */
export const useGameState = (initialData = {}, isCtrl = false) => {
  // 初期状態（initialDataを統合）
  const [gameData, setGameData] = useState(() => {
    // デフォルト値（最後のフォールバック）
    const defaultData = {
      matchID: '',
      match: {
        totalEnds: 2,
        sectionID: 0,
        section: 'standby',
        end: 0,
        tieBreak: 'finalShot'
      },
      screen: {
        active: '',
        setColor: false,
        scoreAdjusting: false,
        penaltyThrow: false
      },
      warmup: {
        limit: TIMER_LIMITS.WARMUP
      },
      interval: {
        limit: TIMER_LIMITS.INTERVAL
      },
      red: {
        name: '',
        score: 0,
        scores: [],
        limit: TIMER_LIMITS.GAME,
        ball: BALL_COUNTS.DEFAULT_RED,
        isRun: false,
        time: TIMER_LIMITS.GAME,
        tieBreak: false,
        result: ''
      },
      blue: {
        name: '',
        score: 0,
        scores: [],
        limit: TIMER_LIMITS.GAME,
        ball: BALL_COUNTS.DEFAULT_BLUE,
        isRun: false,
        time: TIMER_LIMITS.GAME,
        tieBreak: false,
        result: ''
      }
    };

    // 優先順位: 1. game.json 2. ローカルストレージ 3. デフォルト値
    if (initialData && initialData !== null && Object.keys(initialData).length > 0) {
      // init.jsonのsections配列からsectionIDに対応するsection値を取得
      const sections = initialData.match?.sections || GAME_SECTIONS;
      const sectionID = initialData.match?.sectionID || defaultData.match.sectionID;
      const section = sections[sectionID] || 'standby';
      const tieBreak = initialData.match?.tieBreak || initialData.tieBreak || defaultData.match.tieBreak;
      
      // sectionからエンド番号を抽出
      const extractEndNumber = (sectionName) => {
        if (sectionName && sectionName.startsWith('end')) {
          return parseInt(sectionName.replace('end', ''), 10);
        }
        return 0;
      };
      const end = extractEndNumber(section);
      
      return {
        ...defaultData,
        ...initialData,
        match: {
          ...defaultData.match,
          ...(initialData.match || {}),
          sectionID,
          section,
          end,
          tieBreak,
          sections
        },
        red: {
          ...defaultData.red,
          ...(initialData.red || {})
        },
        blue: {
          ...defaultData.blue,
          ...(initialData.blue || {})
        },
        warmup: {
          ...defaultData.warmup,
          ...(initialData.warmup || {})
        },
        interval: {
          ...defaultData.interval,
          ...(initialData.interval || {})
        }
      };
    }

    // initialDataが存在しない場合はデフォルト値を使用
    return defaultData;
  });

  // フィールド更新関数
  const updateField = useCallback((parent, child, value) => {
    setGameData(prevData => ({
      ...prevData,
      [parent]: {
        ...prevData[parent],
        [child]: value
      }
    }));
  }, []);

  // 直接プロパティ更新関数（classification, category, matchNameなど）
  const updateDirectField = useCallback((fieldName, value) => {
    setGameData(prevData => ({
      ...prevData,
      [fieldName]: value
    }));
  }, []);

  // スコア更新
  const updateScore = useCallback((color, newScore) => {
    updateField(color, 'score', newScore);
  }, [updateField]);

  // タイマー更新
  const updateTimer = useCallback((color, time, isRun = false) => {
    updateField(color, 'time', time);
    updateField(color, 'isRun', isRun);
  }, [updateField]);

  // ボール数更新
  const updateBall = useCallback((color, ballCount) => {
    setGameData(prevData => ({
      ...prevData,
      [color]: {
        ...prevData[color],
        ball: ballCount
      }
    }));
  }, []);

  // スクリーンアクティブ状態更新
  const updateScreenActive = useCallback((activeValue) => {
    setGameData(prevData => ({
      ...prevData,
      screen: {
        ...prevData.screen,
        active: activeValue
      }
    }));
  }, []);

  // スコア調整フラグ更新
  const updateScoreAdjusting = useCallback((isAdjusting) => {
    setGameData(prevData => ({
      ...prevData,
      screen: {
        ...prevData.screen,
        scoreAdjusting: isAdjusting
      }
    }));
  }, []);

  // セクションからエンド番号を抽出する関数
  const extractEndNumber = useCallback((sectionName) => {
    if (sectionName && sectionName.startsWith('end')) {
      return parseInt(sectionName.replace('end', ''), 10);
    }
    return 0;
  }, []);

  // セクション更新
  const updateSection = useCallback((newSection, newSectionID, newSections = null) => {
    const endNumber = extractEndNumber(newSection);
    setGameData(prevData => {
      const newData = {
        ...prevData,
        match: {
          ...prevData.match,
          sectionID: newSectionID,
          section: newSection,
          end: endNumber,
          ...(newSections && { sections: newSections })
        },
        screen: {
          ...prevData.screen,
          active: ''
        }
      };

      // エンド番号が設定された場合、scores配列を初期化
      if (endNumber > 0) {
        const endIndex = endNumber - 1;
        
        // redのscores配列を初期化
        const redScores = [...(prevData.red?.scores || [])];
        while (redScores.length <= endIndex) {
          redScores.push(0);
        }
        if (redScores[endIndex] === undefined) {
          redScores[endIndex] = 0;
        }
        
        // blueのscores配列を初期化
        const blueScores = [...(prevData.blue?.scores || [])];
        while (blueScores.length <= endIndex) {
          blueScores.push(0);
        }
        if (blueScores[endIndex] === undefined) {
          blueScores[endIndex] = 0;
        }
        
        newData.red = {
          ...prevData.red,
          scores: redScores
        };
        newData.blue = {
          ...prevData.blue,
          scores: blueScores
        };
      }

      return newData;
    });
  }, [extractEndNumber]);

  // 色確定状態の更新
  const updateConfirmColor = useCallback((setColor, saveData) => {
    setGameData(prevData => {
      const newData = {
        ...prevData,
        screen: {
          ...prevData.screen,
          setColor
        }
      };
      
      // データを保存（非同期で実行）
      if (saveData) {
        setTimeout(() => {
          saveData(newData);
        }, 0);
      }
      
      return newData;
    });
  }, []);

  // プレイヤー名更新
  const updatePlayerName = useCallback((color, name) => {
    updateField(color, 'name', name);
  }, [updateField]);

  // ゲームリセット
  const resetGame = useCallback(() => {
    setGameData(prevData => ({
      ...prevData,
      section: 'standby',
      sectionID: 0,
      warmup: {
        ...prevData.warmup,
        time: TIMER_LIMITS.WARMUP,
        isRun: false
      },
      interval: {
        ...prevData.interval,
        time: TIMER_LIMITS.INTERVAL,
        isRun: false
      },
      red: {
        ...prevData.red,
        score: 0,
        scores: [],
        time: prevData.red.limit || TIMER_LIMITS.GAME,
        isRun: false,
        ball: BALL_COUNTS.DEFAULT_RED,
        tieBreak: false
      },
      blue: {
        ...prevData.blue,
        score: 0,
        scores: [],
        time: prevData.blue.limit || TIMER_LIMITS.GAME,
        isRun: false,
        ball: BALL_COUNTS.DEFAULT_BLUE,
        tieBreak: false
      },
      screen: {
        ...prevData.screen,
        setColor: false
      }
    }));
  }, []);

  // ファイナルショット用のリセット
  const resetForFinalShot = useCallback(() => {
    updateTimer('red', TIMER_LIMITS.FINAL_SHOT);
    updateTimer('blue', TIMER_LIMITS.FINAL_SHOT);
    updateBall('red', BALL_COUNTS.FINAL_SHOT);
    updateBall('blue', BALL_COUNTS.FINAL_SHOT);
  }, [updateTimer, updateBall]);

  // initialDataが変更された時にgameDataを更新（初回のみ）
  useEffect(() => {
    if (initialData && initialData !== null && Object.keys(initialData).length > 0) {
      setGameData(prevData => {
        // 既に同じデータが設定されている場合は更新しない
        if (prevData.red?.name === initialData.red?.name && 
            prevData.blue?.name === initialData.blue?.name &&
            prevData.match?.sectionID === initialData.match?.sectionID &&
            prevData.red?.time === initialData.red?.time &&
            prevData.blue?.time === initialData.blue?.time) {
          return prevData;
        }
        
        // sectionからendの値を計算
        const extractEndNumber = (sectionName) => {
          if (sectionName && sectionName.startsWith('end')) {
            return parseInt(sectionName.replace('end', ''), 10);
          }
          return 0;
        };
        const section = initialData.match?.section || prevData.match?.section;
        const end = extractEndNumber(section);
        
        return {
          ...prevData,
          ...initialData,
          match: {
            ...prevData.match,
            ...(initialData.match || {}),
            sectionID: initialData.match?.sectionID || prevData.match.sectionID,
            end: end
          },
          red: {
            ...prevData.red,
            ...(initialData.red || {})
          },
          blue: {
            ...prevData.blue,
            ...(initialData.blue || {})
          },
          warmup: {
            ...prevData.warmup,
            ...(initialData.warmup || {})
          },
          interval: {
            ...prevData.interval,
            ...(initialData.interval || {})
          }
        };
      });
    }
  }, [initialData]);

  // localDataの変更を監視してgameDataを更新
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setGameData(prevData => {
        // ボール、タイマー、スコアなどの重要なデータのみを更新
        const updatedData = {
          ...prevData,
          red: {
            ...prevData.red,
            ...(initialData.red || {}),
            ball: initialData.red?.ball ?? prevData.red?.ball,
            time: initialData.red?.time ?? prevData.red?.time,
            isRun: initialData.red?.isRun ?? prevData.red?.isRun,
            score: initialData.red?.score ?? prevData.red?.score,
            tieBreak: initialData.red?.tieBreak ?? prevData.red?.tieBreak
          },
          blue: {
            ...prevData.blue,
            ...(initialData.blue || {}),
            ball: initialData.blue?.ball ?? prevData.blue?.ball,
            time: initialData.blue?.time ?? prevData.blue?.time,
            isRun: initialData.blue?.isRun ?? prevData.blue?.isRun,
            score: initialData.blue?.score ?? prevData.blue?.score,
            tieBreak: initialData.blue?.tieBreak ?? prevData.blue?.tieBreak
          },
          warmup: {
            ...prevData.warmup,
            time: initialData.warmup?.time ?? prevData.warmup?.time,
            isRun: initialData.warmup?.isRun ?? prevData.warmup?.isRun
          },
          interval: {
            ...prevData.interval,
            time: initialData.interval?.time ?? prevData.interval?.time,
            isRun: initialData.interval?.isRun ?? prevData.interval?.isRun
          },
          match: {
            ...prevData.match,
            sectionID: initialData.match?.sectionID ?? prevData.match?.sectionID,
            section: initialData.match?.section ?? prevData.match?.section,
            sections: initialData.match?.sections ?? prevData.match?.sections,
            approvals: initialData.match?.approvals ?? prevData.match?.approvals,
            end: (() => {
              const extractEndNumber = (sectionName) => {
                if (sectionName && sectionName.startsWith('end')) {
                  return parseInt(sectionName.replace('end', ''), 10);
                }
                return 0;
              };
              const section = initialData.match?.section ?? prevData.match?.section;
              return extractEndNumber(section);
            })()
          },
          screen: {
            ...prevData.screen,
            setColor: initialData.screen?.setColor ?? prevData.screen?.setColor ?? false,
            scoreAdjusting: initialData.screen?.scoreAdjusting ?? prevData.screen?.scoreAdjusting ?? false,
            penaltyThrow: initialData.screen?.penaltyThrow ?? prevData.screen?.penaltyThrow ?? false,
            // screen.activeの更新処理（ctrlとviewで分岐）
            active: (() => {
              const currentActive = prevData.screen?.active;
              const newActive = initialData.screen?.active;
              
              if (isCtrl) {
                // ctrlモード: ローカルストレージのscreen.active変更を無視し、現在の値を維持
                return currentActive ?? '';
              } else {
                // viewモード: 常にinitialDataから更新（リアルタイム連動を確保）
                return newActive ?? currentActive ?? '';
              }
            })()
          }
        };
        
        return updatedData;
      });
    }
  }, [initialData, isCtrl]);

  return {
    gameData,
    updateField,
    updateDirectField,
    updateScore,
    updateTimer,
    updateBall,
    updateSection,
    updateConfirmColor,
    updatePlayerName,
    updateScreenActive,
    updateScoreAdjusting,
    resetGame,
    resetForFinalShot
  };
};
