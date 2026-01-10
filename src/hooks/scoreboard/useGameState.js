import { useState, useCallback, useEffect } from 'react';
import { TIMER_LIMITS, BALL_COUNTS, GAME_SECTIONS } from '../../utils/scoreboard/constants';

/**
 * Custom hook for game state management
 * @param {Object} initialData - Initial data
 * @returns {Object} Game state and control functions
 */
export const useGameState = (initialData = {}, isCtrl = false) => {
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
        isPenaltyThrow: false
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
        limit: TIMER_LIMITS.GAME,
        ball: BALL_COUNTS.DEFAULT_RED,
        isRunning: false,
        time: TIMER_LIMITS.GAME,
        isTieBreak: false,
        result: '',
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

    // Priority: 1. game.json, 2. LocalStorage, 3. Default
    if (initialData && initialData !== null && Object.keys(initialData).length > 0) {
      const sections = initialData.match?.sections || GAME_SECTIONS;
      const sectionID = initialData.match?.sectionID || defaultData.match.sectionID;
      const section = sections[sectionID] || 'standby';
      const tieBreak = initialData.match?.tieBreak || initialData.tieBreak || defaultData.match.tieBreak;
      const ends = consolidateEnds(initialData);

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
          end,
          ends,
          ...(initialData.match || {}),
          sectionID,
          section,
          tieBreak,
          sections,
          totalEnds: initialData.match?.totalEnds ?? defaultData.match.totalEnds
        },
        red: {
          ...defaultData.red,
          ...(initialData.red || {})
        },
        blue: {
          ...defaultData.blue,
          ...(initialData.blue || {})
        }
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
    return 0;
  }, []);

  // Section update
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
          isPenaltyThrow: false
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
    if (initialData && initialData !== null && Object.keys(initialData).length > 0) {
      setGameData(prevData => {
        // Deep compare to avoid unnecessary re-renders, but ensure all fields are covered
        // Using a simple JSON stringify for comparison as a robust way to detect ANY change
        const prevString = JSON.stringify(prevData);
        const nextString = JSON.stringify({
          ...prevData,
          ...initialData,
          match: {
            ...prevData.match,
            ...(initialData.match || {}),
          },
          red: {
            ...prevData.red,
            ...(initialData.red || {})
          },
          blue: {
            ...prevData.blue,
            ...(initialData.blue || {})
          }
        });

        if (prevString === nextString) {
          return prevData;
        }

        const section = initialData.match?.section || prevData.match?.section;
        const endNum = extractEndNumber(section);

        return {
          ...prevData,
          ...initialData,
          match: {
            ...prevData.match,
            ...(initialData.match || {}),
            sectionID: initialData.match?.sectionID !== undefined ? initialData.match.sectionID : prevData.match.sectionID,
            end: endNum,
            totalEnds: initialData.match?.totalEnds ?? prevData.match?.totalEnds,
            ends: initialData.match?.ends || prevData.match?.ends || []
          },
          red: {
            ...prevData.red,
            ...(initialData.red || {})
          },
          blue: {
            ...prevData.blue,
            ...(initialData.blue || {})
          }
        };
      });
    }
  }, [initialData, extractEndNumber]);

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
