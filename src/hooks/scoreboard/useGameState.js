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
        totalEnds: 2,
        sectionID: 0,
        section: 'standby',
        end: 0,
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
        scores: [],
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
        scores: [],
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

    // Helper to convert legacy numeric scores array to new object structure
    const convertScoresArray = (scores) => {
      if (!Array.isArray(scores) || scores.length === 0) {
        return [];
      }

      // If already in new structure (object array), return as is
      if (typeof scores[0] === 'object' && scores[0].end !== undefined) {
        return scores;
      }

      // Convert numeric array to object structure
      return scores.map((score, index) => ({
        end: index + 1,
        score: typeof score === 'number' ? score : 0
      }));
    };

    // Priority: 1. game.json, 2. LocalStorage, 3. Default
    if (initialData && initialData !== null && Object.keys(initialData).length > 0) {
      // Get section value from init.json's sections array based on sectionID
      const sections = initialData.match?.sections || GAME_SECTIONS;
      const sectionID = initialData.match?.sectionID || defaultData.match.sectionID;
      const section = sections[sectionID] || 'standby';
      const tieBreak = initialData.match?.tieBreak || initialData.tieBreak || defaultData.match.tieBreak;

      // Extract end number from section name
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
          sections,
          totalEnds: initialData.match?.totalEnds || defaultData.match.totalEnds
        },
        red: {
          ...defaultData.red,
          ...(initialData.red || {}),
          scores: convertScoresArray(initialData.red?.scores)
        },
        blue: {
          ...defaultData.blue,
          ...(initialData.blue || {}),
          scores: convertScoresArray(initialData.blue?.scores)
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

    // Use default if no initialData
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

  // Direct property update (classification, category, matchName, etc.)
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

  // Helper to extract end number from section name
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

      // If end number is set, ensure scores array entry exists (for backward compatibility)
      if (endNumber > 0) {
        const ensureEndEntry = (scores, endNum) => {
          const index = scores.findIndex(s => typeof s === 'object' && s.end === endNum);
          if (index === -1) {
            scores.push({ end: endNum, score: 0 });
          } else if (scores[index].score === undefined) {
            // Backward compatibility: set undefined score to 0
            scores[index] = { ...scores[index], score: 0 };
          }
        };

        const redScores = [...(prevData.red?.scores || [])];
        const blueScores = [...(prevData.blue?.scores || [])];

        ensureEndEntry(redScores, endNumber);
        ensureEndEntry(blueScores, endNumber);

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

      // Save data asynchronously
      if (saveData) {
        setTimeout(() => {
          saveData(newData);
        }, 0);
      }

      return newData;
    });
  }, []);

  // Player name update
  const updatePlayerName = useCallback((color, name) => {
    updateField(color, 'name', name);
  }, [updateField]);

  // Game reset
  const resetGame = useCallback(() => {
    setGameData(prevData => ({
      ...prevData,
      section: 'standby',
      sectionID: 0,
      warmup: {
        ...prevData.warmup,
        time: TIMER_LIMITS.WARMUP,
        isRunning: false
      },
      interval: {
        ...prevData.interval,
        time: TIMER_LIMITS.INTERVAL,
        isRunning: false
      },
      red: {
        ...prevData.red,
        score: 0,
        scores: [],
        time: prevData.red.limit || TIMER_LIMITS.GAME,
        isRunning: false,
        ball: BALL_COUNTS.DEFAULT_RED,
        isTieBreak: false
      },
      blue: {
        ...prevData.blue,
        score: 0,
        scores: [],
        time: prevData.blue.limit || TIMER_LIMITS.GAME,
        isRunning: false,
        ball: BALL_COUNTS.DEFAULT_BLUE,
        isTieBreak: false
      },
      screen: {
        ...prevData.screen,
        isColorSet: false
      }
    }));
  }, []);

  // Reset for final shot
  const resetForFinalShot = useCallback(() => {
    updateTimer('red', TIMER_LIMITS.FINAL_SHOT);
    updateTimer('blue', TIMER_LIMITS.FINAL_SHOT);
    updateBall('red', BALL_COUNTS.FINAL_SHOT);
    updateBall('blue', BALL_COUNTS.FINAL_SHOT);
  }, [updateTimer, updateBall]);

  // Update gameData when initialData changes (first time only usually, or external sync)
  useEffect(() => {
    if (initialData && initialData !== null && Object.keys(initialData).length > 0) {
      setGameData(prevData => {
        // Skip update if critical data matches (optimization)
        if (prevData.red?.name === initialData.red?.name &&
          prevData.blue?.name === initialData.blue?.name &&
          prevData.match?.sectionID === initialData.match?.sectionID &&
          prevData.red?.time === initialData.red?.time &&
          prevData.blue?.time === initialData.blue?.time) {
          return prevData;
        }

        // Calculate end from section
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
            end: end,
            totalEnds: initialData.match?.totalEnds ?? prevData.match?.totalEnds
          },
          red: {
            ...prevData.red,
            ...(initialData.red || {}),
            scores: initialData.red?.scores ? (Array.isArray(initialData.red.scores) && initialData.red.scores.length > 0 && typeof initialData.red.scores[0] === 'object' && initialData.red.scores[0].end !== undefined
              ? initialData.red.scores
              : initialData.red.scores.map((score, index) => ({ end: index + 1, score: typeof score === 'number' ? score : 0 }))
            ) : prevData.red?.scores
          },
          blue: {
            ...prevData.blue,
            ...(initialData.blue || {}),
            scores: initialData.blue?.scores ? (Array.isArray(initialData.blue.scores) && initialData.blue.scores.length > 0 && typeof initialData.blue.scores[0] === 'object' && initialData.blue.scores[0].end !== undefined
              ? initialData.blue.scores
              : initialData.blue.scores.map((score, index) => ({ end: index + 1, score: typeof score === 'number' ? score : 0 }))
            ) : prevData.blue?.scores
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

  // Monitor initialData changes to update simplified gameData (e.g. from local storage)
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setGameData(prevData => {
        // Update only Critical Data: ball, timer, score, etc.
        const redConvertedScores = initialData.red?.scores ? (Array.isArray(initialData.red.scores) && initialData.red.scores.length > 0 && typeof initialData.red.scores[0] === 'object' && initialData.red.scores[0].end !== undefined
          ? initialData.red.scores
          : initialData.red.scores.map((score, index) => ({ end: index + 1, score: typeof score === 'number' ? score : 0 }))
        ) : (prevData.red?.scores || []);

        const blueConvertedScores = initialData.blue?.scores ? (Array.isArray(initialData.blue.scores) && initialData.blue.scores.length > 0 && typeof initialData.blue.scores[0] === 'object' && initialData.blue.scores[0].end !== undefined
          ? initialData.blue.scores
          : initialData.blue.scores.map((score, index) => ({ end: index + 1, score: typeof score === 'number' ? score : 0 }))
        ) : (prevData.blue?.scores || []);

        const updatedData = {
          ...prevData,
          ...initialData,
          red: {
            ...prevData.red,
            ...(initialData.red || {}),
            ball: initialData.red?.ball ?? prevData.red?.ball,
            time: initialData.red?.time ?? prevData.red?.time,
            isRunning: initialData.red?.isRunning ?? prevData.red?.isRunning,
            score: initialData.red?.score ?? prevData.red?.score,
            isTieBreak: initialData.red?.isTieBreak ?? prevData.red?.isTieBreak,
            country: initialData.red?.country ?? prevData.red?.country,
            profilePic: initialData.red?.profilePic ?? prevData.red?.profilePic,
            scores: redConvertedScores
          },
          blue: {
            ...prevData.blue,
            ...(initialData.blue || {}),
            ball: initialData.blue?.ball ?? prevData.blue?.ball,
            time: initialData.blue?.time ?? prevData.blue?.time,
            isRunning: initialData.blue?.isRunning ?? prevData.blue?.isRunning,
            score: initialData.blue?.score ?? prevData.blue?.score,
            isTieBreak: initialData.blue?.isTieBreak ?? prevData.blue?.isTieBreak,
            country: initialData.blue?.country ?? prevData.blue?.country,
            profilePic: initialData.blue?.profilePic ?? prevData.blue?.profilePic,
            scores: blueConvertedScores
          },
          warmup: {
            ...prevData.warmup,
            time: initialData.warmup?.time ?? prevData.warmup?.time,
            isRunning: initialData.warmup?.isRunning ?? prevData.warmup?.isRunning
          },
          interval: {
            ...prevData.interval,
            time: initialData.interval?.time ?? prevData.interval?.time,
            isRunning: initialData.interval?.isRunning ?? prevData.interval?.isRunning
          },
          match: {
            ...prevData.match,
            ...(initialData.match || {}),
            // Calculate end from section separately
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
            isColorSet: initialData.screen?.isColorSet ?? prevData.screen?.isColorSet ?? false,
            isScoreAdjusting: initialData.screen?.isScoreAdjusting ?? prevData.screen?.isScoreAdjusting ?? false,
            isPenaltyThrow: initialData.screen?.isPenaltyThrow ?? prevData.screen?.isPenaltyThrow ?? false,
            // Update active screen (branch logic for ctrl/view)
            active: (() => {
              const currentActive = prevData.screen?.active;
              const newActive = initialData.screen?.active;

              if (isCtrl) {
                // Ctrl mode: ignore screen.active changes from local storage
                return currentActive ?? '';
              } else {
                // View mode: always sync from initialData for real-time updates
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
