import { useState, useCallback, useEffect } from 'react';
import { TIMER_LIMITS, BALL_COUNTS, GAME_SECTIONS } from '../../utils/scoreboard/constants';

/**
 * Custom hook for game state management
 * @param {Object} initialData - Initial data
 * @returns {Object} Game state and control functions
 */
export const useGameState = (initialData = {}, isCtrl = false) => {
  // Helper to merge game data consistently
  const mergeGameData = useCallback((prevData, incomingData) => {
    if (!incomingData || Object.keys(incomingData).length === 0) {
      return prevData;
    }

    const sections = incomingData.match?.sections || prevData.match?.sections || GAME_SECTIONS;
    const prevSections = prevData.match?.sections || sections;
    const prevRawSectionID = prevData.match?.sectionID ?? 0;
    const prevSectionID = Number.isInteger(Number(prevRawSectionID)) ? Number(prevRawSectionID) : 0;
    const prevSection =
      prevSections[prevSectionID] ||
      prevData.match?.section ||
      'standby';
    const rawSectionID =
      incomingData.match?.sectionID !== undefined ? incomingData.match.sectionID : prevData.match.sectionID;
    const sectionID = Number.isInteger(Number(rawSectionID)) ? Number(rawSectionID) : 0;
    // 一時的に sectionID と sections がずれても、直前セクションを優先して standby への誤復帰を防ぐ
    const resolvedIncomingSection =
      sections[sectionID] ||
      incomingData.match?.section ||
      prevData.match?.section ||
      'standby';

    const getSectionOrder = (sectionName, fallbackSectionID, sectionList) => {
      const foundIndex = sectionList.findIndex((s) => s === sectionName);
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return Number.isInteger(Number(fallbackSectionID)) ? Number(fallbackSectionID) : -1;
    };

    const prevSectionOrder = getSectionOrder(prevSection, prevSectionID, prevSections);
    const incomingSectionOrder = getSectionOrder(resolvedIncomingSection, sectionID, sections);
    const prevMatchId = String(prevData.matchID ?? '');
    const incomingMatchId = String(incomingData.matchID ?? prevData.matchID ?? '');
    const isSameMatch = prevMatchId !== '' && prevMatchId === incomingMatchId;
    const hasRunningTimer =
      Boolean(prevData.red?.isRunning) ||
      Boolean(prevData.blue?.isRunning) ||
      Boolean(prevData.warmup?.isRunning) ||
      Boolean(prevData.interval?.isRunning);
    // ctrl のみ: ローカルで進行中のタイマーがあるとき、古いスナップショットでのセクション巻き戻しを防ぐ
    // view は常に incoming（サーバー）を正とし、表示用の time も追従させる
    const shouldBlockSectionRollback =
      isCtrl &&
      isSameMatch &&
      hasRunningTimer &&
      prevSectionOrder >= 0 &&
      incomingSectionOrder >= 0 &&
      incomingSectionOrder < prevSectionOrder;

    const section = shouldBlockSectionRollback ? prevSection : resolvedIncomingSection;
    const finalSectionID = shouldBlockSectionRollback ? prevSectionID : sectionID;
    
    const extractEndNumber = (sectionName) => {
      if (sectionName && sectionName.startsWith('end')) {
        return parseInt(sectionName.replace('end', ''), 10);
      }
      if (sectionName === 'tieBreak') return 'TB1';
      return 0;
    };
    
    const end = extractEndNumber(section);

    return {
      ...prevData,
      ...incomingData,
      scene: incomingData.scene !== undefined ? incomingData.scene : prevData.scene,
      match: {
        ...prevData.match,
        ...(incomingData.match || {}),
        end,
        sectionID: finalSectionID,
        section,
        sections,
        totalEnds: incomingData.match?.totalEnds ?? prevData.match?.totalEnds,
        ends: incomingData.match?.ends || prevData.match?.ends || []
      },
      red: {
        ...prevData.red,
        ...(incomingData.red || {}),
        ...(isSameMatch && isCtrl && prevData.red?.isRunning
          ? {
            isRunning: true,
            time: prevData.red?.time,
          }
          : {})
      },
      blue: {
        ...prevData.blue,
        ...(incomingData.blue || {}),
        ...(isSameMatch && isCtrl && prevData.blue?.isRunning
          ? {
            isRunning: true,
            time: prevData.blue?.time,
          }
          : {})
      },
      warmup: {
        ...prevData.warmup,
        ...(incomingData.warmup || {}),
        ...(isSameMatch && isCtrl && prevData.warmup?.isRunning
          ? {
            isRunning: true,
            time: prevData.warmup?.time,
          }
          : {})
      },
      interval: {
        ...prevData.interval,
        ...(incomingData.interval || {}),
        ...(isSameMatch && isCtrl && prevData.interval?.isRunning
          ? {
            isRunning: true,
            time: prevData.interval?.time,
          }
          : {})
      },
    };
  }, [isCtrl]);

  // Initial state (merged with initialData)
  const [gameData, setGameData] = useState(() => {
    // Default values (fallback)
    const defaultData = {
      matchID: '',
      match: {
        end: 0,
        ends: [],
        totalEnds: 6,
        sectionID: 0,
        section: 'standby',
        approvals: {
          red: false,
          referee: false,
          blue: false
        },
        warmup: 'simultaneous',
        interval: 'enabled',
        rules: 'worldBoccia',
        resultApproval: 'enabled',
        tieBreak: 'finalShot'
      },
      screen: {
        active: '',
        isColorSet: false,
        isScoreAdjusting: false,
        isPenaltyThrow: false,
        isMatchStarted: false
      },
      scene: 'official',
      warmup: {
        limit: TIMER_LIMITS.WARMUP
      },
      interval: {
        limit: TIMER_LIMITS.INTERVAL
      },
      red: {
        name: '',
        score: 0,
        limit: TIMER_LIMITS.GAME,
        ball: BALL_COUNTS.DEFAULT_RED,
        isRunning: false,
        time: TIMER_LIMITS.GAME,
        isTieBreak: false,
        result: '',
        playerID: '',
        affiliation: '',
        country: '',
        profilePic: ''
      },
      blue: {
        name: '',
        score: 0,
        limit: TIMER_LIMITS.GAME,
        ball: BALL_COUNTS.DEFAULT_BLUE,
        isRunning: false,
        time: TIMER_LIMITS.GAME,
        isTieBreak: false,
        result: '',
        playerID: '',
        affiliation: '',
        country: '',
        profilePic: ''
      }
    };

    // Helper to consolidate old scores and shotHistory into match.ends
    const consolidateEnds = (data) => {
      if (data.match?.ends && Array.isArray(data.match.ends)) {
        return data.match.ends;
      }

      const redScores = data.red?.scores || [];
      const blueScores = data.blue?.scores || [];
      const shotHistory = data.match?.shotHistory || [];
      
      const endsMap = {};

      const ensureEnd = (endNum) => {
        if (!endsMap[endNum]) {
          endsMap[endNum] = {
            end: endNum,
            shots: [],
            redScore: 0,
            blueScore: 0
          };
        }
      };

      redScores.forEach((s, idx) => {
        const endNum = typeof s === 'object' ? s.end : idx + 1;
        ensureEnd(endNum);
        endsMap[endNum].redScore = typeof s === 'object' ? s.score : s;
        if (typeof s === 'object' && s.penalties && s.penalties.length > 0) {
          endsMap[endNum].redPenalties = s.penalties;
        }
      });

      blueScores.forEach((s, idx) => {
        const endNum = typeof s === 'object' ? s.end : idx + 1;
        ensureEnd(endNum);
        endsMap[endNum].blueScore = typeof s === 'object' ? s.score : s;
        if (typeof s === 'object' && s.penalties && s.penalties.length > 0) {
          endsMap[endNum].bluePenalties = s.penalties;
        }
      });

      shotHistory.forEach(h => {
        ensureEnd(h.end);
        endsMap[h.end].shots = h.shots || [];
      });

      return Object.values(endsMap).sort((a, b) => a.end - b.end);
    };

    // Priority: 1. incoming data (game.json), 2. Default
    if (initialData && Object.keys(initialData).length > 0) {
      const dataWithConsolidatedEnds = {
        ...initialData,
        match: {
          ...initialData.match,
          ends: consolidateEnds(initialData)
        }
      };
      
      // We use a simplified version of merge logic here for initial state
      const sections = dataWithConsolidatedEnds.match?.sections || GAME_SECTIONS;
      const rawSectionID =
        dataWithConsolidatedEnds.match?.sectionID ?? defaultData.match.sectionID;
      const sectionID = Number.isInteger(Number(rawSectionID)) ? Number(rawSectionID) : 0;
      // 初期反映時も section 名を優先し、index不整合で standby へ戻る挙動を抑制する
      const section =
        sections[sectionID] ||
        dataWithConsolidatedEnds.match?.section ||
        defaultData.match.section;
      
      const extractEndNumber = (sectionName) => {
        if (sectionName && sectionName.startsWith('end')) {
          return parseInt(sectionName.replace('end', ''), 10);
        }
        return 0;
      };
      
      return {
        ...defaultData,
        ...dataWithConsolidatedEnds,
        scene: dataWithConsolidatedEnds.scene || defaultData.scene,
        match: {
          ...defaultData.match,
          ...dataWithConsolidatedEnds.match,
          end: extractEndNumber(section),
          sectionID,
          section,
          sections
        },
        red: { ...defaultData.red, ...(dataWithConsolidatedEnds.red || {}) },
        blue: { ...defaultData.blue, ...(dataWithConsolidatedEnds.blue || {}) }
      };
    }

    return defaultData;
  });

  // Field update function
  const updateField = useCallback((parent, child, value) => {
    setGameData(prevData => ({
      ...prevData,
      [parent]: {
        ...prevData[parent],
        [child]: value
      }
    }));
  }, []);

  // Direct property update
  const updateDirectField = useCallback((fieldName, value) => {
    setGameData(prevData => ({
      ...prevData,
      [fieldName]: value
    }));
  }, []);

  // Score update
  const updateScore = useCallback((color, newScore) => {
    updateField(color, 'score', newScore);
  }, [updateField]);

  // Timer update
  const updateTimer = useCallback((color, time, isRunning = false) => {
    updateField(color, 'time', time);
    updateField(color, 'isRunning', isRunning);
  }, [updateField]);

  // Ball count update
  const updateBall = useCallback((color, ballCount) => {
    setGameData(prevData => ({
      ...prevData,
      [color]: {
        ...prevData[color],
        ball: ballCount
      }
    }));
  }, []);

  // Screen active state update
  const updateScreenActive = useCallback((activeValue) => {
    setGameData(prevData => ({
      ...prevData,
      screen: {
        ...prevData.screen,
        active: activeValue
      }
    }));
  }, []);

  // Score adjusting flag update
  const updateScoreAdjusting = useCallback((isAdjusting) => {
    setGameData(prevData => ({
      ...prevData,
      screen: {
        ...prevData.screen,
        isScoreAdjusting: isAdjusting
      }
    }));
  }, []);

  const extractEndNumber = useCallback((sectionName) => {
    if (sectionName && sectionName.startsWith('end')) {
      return parseInt(sectionName.replace('end', ''), 10);
    }
    if (sectionName === 'tieBreak') {
      return 'TB1';
    }
    return 0;
  }, []);

  // Section update
  const updateSection = useCallback((newSection, newSectionID, newSections = null) => {
    const endNumber = extractEndNumber(newSection);
    
    // セクション切り替え時のフェード効果: 画面全体を一瞬で暗転
    const scoreboard = document.getElementById('scoreboard');
    if (scoreboard) {
      scoreboard.classList.add('sectionTransition');
      
      // ブラウザに暗転をレンダリングさせる
      requestAnimationFrame(() => {
        // 暗転後に状態更新
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
              active: '',
              isScoreAdjusting: false
            }
          };

          if (endNumber > 0) {
            const ends = [...(prevData.match?.ends || [])];
            if (!ends.find(e => e.end === endNumber)) {
              ends.push({ 
                end: endNumber, 
                shots: [], 
                redScore: 0, 
                blueScore: 0
              });
              newData.match.ends = ends.sort((a, b) => a.end - b.end);
            }
          }

          return newData;
        });
        
        // 次のフレームでフェードイン開始
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (scoreboard) {
              scoreboard.classList.remove('sectionTransition');
            }
          }, 100);
        });
      });
    } else {
      // root要素が見つからない場合は通常の更新
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
            active: '',
            isScoreAdjusting: false
          }
        };

        if (endNumber > 0) {
          const ends = [...(prevData.match?.ends || [])];
          if (!ends.find(e => e.end === endNumber)) {
            ends.push({ 
              end: endNumber, 
              shots: [], 
              redScore: 0, 
              blueScore: 0
            });
            newData.match.ends = ends.sort((a, b) => a.end - b.end);
          }
        }

        return newData;
      });
    }
  }, [extractEndNumber]);

  // Color set state update
  const updateConfirmColor = useCallback((isColorSet, saveData) => {
    setGameData(prevData => {
      const newData = {
        ...prevData,
        screen: {
          ...prevData.screen,
          isColorSet
        }
      };
      if (saveData) {
        setTimeout(() => saveData(newData), 0);
      }
      return newData;
    });
  }, []);

  const updatePlayerName = useCallback((color, name) => {
    updateField(color, 'name', name);
  }, [updateField]);

  // Game reset (Preserve settings, reset progress)
  const resetGame = useCallback(() => {
    setGameData(prevData => {
      // DEFAULT_GAME_DATA から初期構造を取得
      // ユーザー設定（維持したい項目）を抽出
      const settings = {
        classification: prevData.classification,
        category: prevData.category,
        matchName: prevData.matchName,
        match: {
          totalEnds: prevData.match?.totalEnds,
          warmup: prevData.match?.warmup,
          interval: prevData.match?.interval,
          rules: prevData.match?.rules,
          resultApproval: prevData.match?.resultApproval,
          tieBreak: prevData.match?.tieBreak,
          sections: prevData.match?.sections
        },
        red: {
          name: prevData.red?.name,
          limit: prevData.red?.limit,
          country: prevData.red?.country,
          profilePic: prevData.red?.profilePic
        },
        blue: {
          name: prevData.blue?.name,
          limit: prevData.blue?.limit,
          country: prevData.blue?.country,
          profilePic: prevData.blue?.profilePic
        },
        warmup: {
          limit: prevData.warmup?.limit
        },
        interval: {
          limit: prevData.interval?.limit
        }
      };

      // 進行状態のみをリセットした新しいデータを作成
      return {
        ...prevData,
        ...settings,
        match: {
          ...prevData.match,
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
        warmup: {
          ...prevData.warmup,
          ...settings.warmup,
          time: settings.warmup.limit || TIMER_LIMITS.WARMUP,
          isRunning: false
        },
        interval: {
          ...prevData.interval,
          ...settings.interval,
          time: settings.interval.limit || TIMER_LIMITS.INTERVAL,
          isRunning: false
        },
        red: {
          ...prevData.red,
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
          ...prevData.blue,
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
        screen: {
          active: '',
          isColorSet: false,
          isScoreAdjusting: false,
          isPenaltyThrow: false,
          isMatchStarted: false
        },
        lastUpdated: new Date().toISOString()
      };
    });
  }, []);

  const resetForFinalShot = useCallback(() => {
    updateTimer('red', TIMER_LIMITS.FINAL_SHOT);
    updateTimer('blue', TIMER_LIMITS.FINAL_SHOT);
    updateBall('red', BALL_COUNTS.FINAL_SHOT);
    updateBall('blue', BALL_COUNTS.FINAL_SHOT);
  }, [updateTimer, updateBall]);

  // Sync with initialData changes
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setGameData(prevData => {
        // Deep compare using JSON stringify to detect any relevant change
        const currentDataString = JSON.stringify(prevData);
        const mergedData = mergeGameData(prevData, initialData);
        const mergedDataString = JSON.stringify(mergedData);

        if (currentDataString === mergedDataString) {
          return prevData;
        }

        return mergedData;
      });
    }
  }, [initialData, mergeGameData]);

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
