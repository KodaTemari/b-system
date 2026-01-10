import React, { useState, useEffect, useRef } from 'react';
import { getText as getLocalizedText, getCurrentLanguage, setLanguage } from '../../../locales';
import setting2Icon from '../img/icon_setting_2.png';
import { MatchGeneralSettings, MatchRuleSettings } from './settings/MatchSettings';
import TimerSettings from './settings/TimerSettings';
import TeamSettings from './settings/TeamSettings';
import SystemSettings from './settings/SystemSettings';

/**
 * 設定モーダルコンポーネント
 */
const SettingModal = ({
  sectionID,
  section,
  sections,
  totalEnds,
  handleReset,
  handleResetDirect,
  handleEndsSelect,
  handleTimeAdjust,
  getText,
  onClose,
  scoreAdjusting,
  onRestartEnd,
  onPenaltyClick,
  onTimeoutClick,
  gameData,
  onUpdateField,
  saveData,
  id,
  setSearchParams,
  classParam,
  genderParam,
  onPendingChangesChange
}) => {
  // Class options and gender state
  const [classificationOptions, setClassificationOptions] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedEnds, setSelectedEnds] = useState(totalEnds || 4);
  const [selectedTieBreak, setSelectedTieBreak] = useState(gameData?.match?.tieBreak || 'none');
  const [selectedWarmup, setSelectedWarmup] = useState(gameData?.match?.warmup || 'simultaneous');
  const [selectedInterval, setSelectedInterval] = useState(gameData?.match?.interval || 'enabled');
  const [selectedResultApproval, setSelectedResultApproval] = useState(gameData?.match?.resultApproval || 'none');
  const [selectedRules, setSelectedRules] = useState(gameData?.match?.rules || 'worldBoccia');

  // Red/Blue timer limits (ms)
  const [selectedRedLimit, setSelectedRedLimit] = useState(gameData?.red?.limit || 300000);
  const [selectedBlueLimit, setSelectedBlueLimit] = useState(gameData?.blue?.limit || 300000);

  // Tracks automatic updates from class changes
  const lastClassChangeRef = useRef({ classId: null, timestamp: 0 });
  const currentLimitsRef = useRef({ red: selectedRedLimit, blue: selectedBlueLimit });

  // Tracks if changes were saved
  const savedRef = useRef(false);

  // Tracks pending changes (applied on OK)
  const [pendingChanges, setPendingChanges] = useState({});

  // Notify parent of changes
  useEffect(() => {
    if (onPendingChangesChange) {
      onPendingChangesChange(pendingChanges);
    }
  }, [pendingChanges, onPendingChangesChange]);

  // Language modal state
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  // Language change handler
  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    setCurrentLang(lang);
    // Trigger re-render
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));

    // Update URL params
    if (setSearchParams) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('l', lang);
        return newParams;
      });
    }

    // Save to LocalStorage and notify other tabs
    try {
      localStorage.setItem('scoreboard_language', lang);
      const channel = new BroadcastChannel('scoreboard_language');
      channel.postMessage({ language: lang });
      channel.close();
    } catch (error) {
      console.error('Failed to save language settings:', error);
    }
  };

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChangeEvent = (event) => {
      setCurrentLang(event.detail.language);
    };
    window.addEventListener('languageChanged', handleLanguageChangeEvent);
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChangeEvent);
    };
  }, []);

  // Sync state when totalEnds changes
  useEffect(() => {
    const hasPendingTotalEnds = pendingChanges['match.totalEnds'] !== undefined;
    if (!hasPendingTotalEnds) {
      setSelectedEnds(totalEnds || 4);
    }
  }, [totalEnds, pendingChanges]);

  // Reset pendingChanges (keep classification) only when section changes (e.g. from standby to end1)
  // But NOT when just opening/closing the modal in the same section
  const lastSectionRef = useRef(section);
  useEffect(() => {
    if (lastSectionRef.current !== section) {
      setPendingChanges(prev => {
        const classification = prev.classification;
        return classification ? { classification } : {};
      });
      lastSectionRef.current = section;
    }
  }, [section]);

  // Ensure gender is reset if class doesn't support it
  useEffect(() => {
    if (selectedClassId) {
      const classOption = classificationOptions.find(opt => opt.value === selectedClassId);
      if (classOption && !classOption.hasGender && selectedGender !== '') {
        setSelectedGender('');
      }
    }
  }, [selectedClassId, classificationOptions, selectedGender]);

  // Update detail settings based on gameData changes
  useEffect(() => {
    // Skip update immediately after class change (1000ms debounce)
    const now = Date.now();
    if (now - lastClassChangeRef.current.timestamp < 1000) {
      return;
    }

    // Prioritize pendingChanges over gameData updates
    const hasPendingTieBreak = pendingChanges['match.tieBreak'] !== undefined;
    const hasPendingResultApproval = pendingChanges['match.resultApproval'] !== undefined;
    const hasPendingRules = pendingChanges['match.rules'] !== undefined;
    const hasPendingWarmup = pendingChanges['match.warmup'] !== undefined;
    const hasPendingInterval = pendingChanges['match.interval'] !== undefined;

    if (!hasPendingTieBreak && gameData?.match?.tieBreak !== undefined) {
      setSelectedTieBreak(gameData.match.tieBreak);
    }
    if (!hasPendingResultApproval && gameData?.match?.resultApproval !== undefined) {
      setSelectedResultApproval(gameData.match.resultApproval);
    }
    if (!hasPendingRules && gameData?.match?.rules !== undefined) {
      setSelectedRules(gameData.match.rules);
    }
    if (!hasPendingWarmup && gameData?.match?.warmup !== undefined) {
      setSelectedWarmup(gameData.match.warmup);
    }
    if (!hasPendingInterval && gameData?.match?.interval !== undefined) {
      setSelectedInterval(gameData.match.interval);
    }

    // Similar logic for timer limits
    const hasPendingRedLimit = pendingChanges['red.limit'] !== undefined;
    const hasPendingBlueLimit = pendingChanges['blue.limit'] !== undefined;

    if (!hasPendingRedLimit && gameData?.red?.limit !== undefined) {
      const shouldUpdate = gameData.red.limit !== currentLimitsRef.current.red &&
        selectedRedLimit !== gameData.red.limit;
      if (shouldUpdate) {
        currentLimitsRef.current.red = gameData.red.limit;
        setSelectedRedLimit(gameData.red.limit);
      }
    }
    if (!hasPendingBlueLimit && gameData?.blue?.limit !== undefined) {
      const shouldUpdate = gameData.blue.limit !== currentLimitsRef.current.blue &&
        selectedBlueLimit !== gameData.blue.limit;
      if (shouldUpdate) {
        currentLimitsRef.current.blue = gameData.blue.limit;
        setSelectedBlueLimit(gameData.blue.limit);
      }
    }
  }, [gameData?.match?.tieBreak, gameData?.match?.resultApproval, gameData?.match?.rules, gameData?.match?.warmup, gameData?.match?.interval, gameData?.red?.limit, gameData?.blue?.limit, pendingChanges, selectedRedLimit, selectedBlueLimit]);

  // Set class and gender from URL params
  useEffect(() => {
    // すでに設定がある場合や、standbyセクションでない場合は自動適用しない
    if (section !== 'standby' || !classParam) return;
    
    // 現在のgameDataとURLパラメータが一致している場合は、初期化処理をスキップ
    // これにより、手動で変更した「エンド数」などがクラスのデフォルト値で上書きされるのを防ぐ
    if (gameData?.classification && selectedClassId === classParam) {
      return;
    }

    setSelectedClassId(classParam);

    const genderValue = genderParam ? (genderParam.toUpperCase() === 'M' ? 'M' : genderParam.toUpperCase() === 'F' ? 'F' : '') : '';
    setSelectedGender(genderValue);

    // Apply class settings
    const settings = getClassSettings(classParam);
    currentLimitsRef.current.red = settings.redLimit;
    currentLimitsRef.current.blue = settings.blueLimit;
    setSelectedRedLimit(settings.redLimit);
    setSelectedBlueLimit(settings.blueLimit);
    setSelectedWarmup(settings.warmup);
    setSelectedInterval(settings.interval);
    setSelectedTieBreak(settings.tieBreak);
    setSelectedRules(settings.rules);
    setSelectedResultApproval(settings.resultApproval);
    setSelectedEnds(settings.totalEnds);

    // Record changes in pendingChanges
    setPendingChanges(prev => ({
      ...prev,
      'red.limit': settings.redLimit,
      'blue.limit': settings.blueLimit,
      'match.warmup': settings.warmup,
      'match.interval': settings.interval,
      'match.totalEnds': settings.totalEnds,
      'match.tieBreak': settings.tieBreak,
      'match.rules': settings.rules,
      'match.resultApproval': settings.resultApproval
    }));

    // Update classification display value
    setTimeout(() => {
      updateClassificationValue(classParam, genderValue, true);
    }, 0);
  }, [classParam, genderParam, section, gameData?.classification]); // gameData?.classification を追加して再評価させる

  // Clear pendingChanges items if they match gameData (Optimistic UI sync)
  useEffect(() => {
    if (Object.keys(pendingChanges).length === 0) return;

    const newChanges = { ...pendingChanges };
    let hasChanged = false;

    Object.entries(newChanges).forEach(([key, pendingValue]) => {
      const [parent, child] = key.split('.');
      let gameValue;

      if (child) {
        gameValue = gameData?.[parent]?.[child];
      } else {
        gameValue = gameData?.[parent];
      }

      // Compare values
      if (gameValue !== undefined && gameValue === pendingValue) {
        delete newChanges[key];
        hasChanged = true;
      }
    });

    if (hasChanged) {
      setPendingChanges(newChanges);
    }
  }, [gameData, pendingChanges]);

  // Parse class ID and gender from current classification string
  useEffect(() => {
    // Ignore if URL params, pending changes, or manual selection exists
    if (classParam || pendingChanges.classification !== undefined || selectedClassId) {
      return;
    }

    if (gameData?.classification) {
      const classification = gameData.classification;
      const parts = classification.split(' ');

      const prefixes = ['個人', 'ペア', 'チーム', 'IND', 'PAIR', 'TEAM'];
      const genderTexts = ['男子', '女子', 'Male', 'Female'];
      let classPart = '';
      let genderPart = '';

      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        if (genderTexts.includes(lastPart)) {
          genderPart = lastPart;
          const withoutPrefix = parts.slice(0, -1);
          if (prefixes.includes(withoutPrefix[0])) {
            classPart = withoutPrefix.slice(1).join(' ');
          } else {
            classPart = withoutPrefix.join(' ');
          }
        } else {
          if (prefixes.includes(parts[0])) {
            classPart = parts.slice(1).join(' ');
          } else {
            classPart = parts.join(' ');
          }
        }
      } else {
        classPart = classification;
      }

      // Reverse lookup class ID from name
      const findClassId = async () => {
        try {
          const apiUrl = 'http://localhost:3001';
          const classDefUrl = `${apiUrl}/data/classDefinitions.json`;
          const classDefResponse = await fetch(classDefUrl);
          if (classDefResponse.ok) {
            const classDefData = await classDefResponse.json();
            const classDefinitions = classDefData.classifications || {};

            let expectedType = null;
            if (parts.length >= 2) {
              const firstPart = parts[0];
              if (firstPart === '個人' || firstPart === 'IND') {
                expectedType = 'individual';
              } else if (firstPart === 'ペア' || firstPart === 'PAIR') {
                expectedType = 'pair';
              } else if (firstPart === 'チーム' || firstPart === 'TEAM') {
                expectedType = 'team';
              }
            } else if (parts.length === 1 && (parts[0] === 'レクリエーション' || parts[0] === 'Recreation')) {
              expectedType = 'recreation';
            }

            const currentLang = getCurrentLanguage();

            for (const [id, def] of Object.entries(classDefinitions)) {
              const localizedName = getLocalizedText(`classNames.${id}`, currentLang) || def.name;

              if (def.name === classPart || localizedName === classPart) {
                if (expectedType === null || def.type === expectedType) {
                  setSelectedClassId(id);
                  if (genderPart === '男子' || genderPart === 'Male') {
                    setSelectedGender('M');
                  } else if (genderPart === '女子' || genderPart === 'Female') {
                    setSelectedGender('F');
                  } else {
                    setSelectedGender('');
                  }
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error('Class analysis error:', error);
        }
      };
      findClassId();
    }
  }, [gameData?.classification]);

  // Load class definitions and tournament settings
  useEffect(() => {
    const loadClassifications = async () => {
      if (!id) return;

      try {
        const apiUrl = 'http://localhost:3001';

        // Load classDefinitions.json
        const classDefUrl = `${apiUrl}/data/classDefinitions.json`;
        const classDefResponse = await fetch(classDefUrl);
        let classDefinitions = {};
        if (classDefResponse.ok) {
          const classDefData = await classDefResponse.json();
          classDefinitions = classDefData.classifications || {};
        }

        // Load init.json
        const initUrl = `${apiUrl}/data/${id}/init.json`;
        const initResponse = await fetch(initUrl);
        let tournamentClassifications = [];
        if (initResponse.ok) {
          const initData = await initResponse.json();
          tournamentClassifications = initData.classifications || [];
        }

        const uniqueClassIds = [...new Set(tournamentClassifications.map(tc => tc.id))];

        const classOrder = [
          'BC1', 'BC2', 'BC3', 'BC4', 'OPStanding', 'OPSeated', 'Friendly',
          'PairBC3', 'PairBC4', 'PairFriendly',
          'TeamsBC1BC2', 'TeamFriendly',
          'Recreation'
        ];

        const sortedClassIds = classOrder.filter(id => uniqueClassIds.includes(id));

        const options = sortedClassIds.map(classId => {
          const classDef = classDefinitions[classId];
          if (!classDef) return null;

          let prefix = '';
          if (classDef.type === 'individual') {
            prefix = currentLang === 'ja' ? '個人 ' : 'IND ';
          } else if (classDef.type === 'pair') {
            prefix = currentLang === 'ja' ? 'ペア ' : 'PAIR ';
          } else if (classDef.type === 'team') {
            prefix = currentLang === 'ja' ? 'チーム ' : 'TEAM ';
          } else if (classDef.type === 'recreation') {
            prefix = '';
          }

          const className = getLocalizedText(`classNames.${classId}`, currentLang) || classDef.name;

          return {
            value: classId,
            label: `${prefix}${className}`,
            hasGender: classDef.hasGender || false,
            type: classDef.type
          };
        }).filter(option => option !== null);

        setClassificationOptions(options);
      } catch (error) {
        console.error('Class info load error:', error);
      }
    };

    if (section === 'standby') {
      loadClassifications();
    }
  }, [id, section, currentLang]);

  // Get settings for specific class
  const getClassSettings = (classId) => {
    const settings = {
      // Default values
      redLimit: 270000, // 4:30
      blueLimit: 270000, // 4:30
      warmup: 'simultaneous', // 2:00
      interval: 'enabled', // 1:00
      totalEnds: 4,
      tieBreak: 'extraEnd',
      rules: 'worldBoccia',
      resultApproval: 'enabled'
    };

    switch (classId) {
      case 'BC1':
        settings.redLimit = 270000;
        settings.blueLimit = 270000;
        break;
      case 'BC2':
        settings.redLimit = 210000;
        settings.blueLimit = 210000;
        break;
      case 'BC3':
        settings.redLimit = 360000;
        settings.blueLimit = 360000;
        break;
      case 'BC4':
        settings.redLimit = 210000;
        settings.blueLimit = 210000;
        break;
      case 'OPStanding':
        settings.redLimit = 210000;
        settings.blueLimit = 210000;
        break;
      case 'OPSeated':
        settings.redLimit = 210000;
        settings.blueLimit = 210000;
        break;
      case 'Friendly':
        settings.redLimit = 240000;
        settings.blueLimit = 240000;
        settings.totalEnds = 2;
        settings.tieBreak = 'finalShot';
        settings.rules = 'friendlyMatch';
        settings.resultApproval = 'none';
        break;
      case 'PairBC3':
        settings.redLimit = 420000;
        settings.blueLimit = 420000;
        settings.warmup = 'separate';
        break;
      case 'PairBC4':
        settings.redLimit = 240000;
        settings.blueLimit = 240000;
        settings.warmup = 'separate';
        break;
      case 'PairFriendly':
        settings.redLimit = 300000;
        settings.blueLimit = 300000;
        settings.totalEnds = 2;
        settings.tieBreak = 'finalShot';
        settings.rules = 'friendlyMatch';
        settings.resultApproval = 'none';
        break;
      case 'TeamsBC1BC2':
        settings.redLimit = 300000;
        settings.blueLimit = 300000;
        settings.warmup = 'separate';
        settings.totalEnds = 6;
        break;
      case 'TeamFriendly':
        settings.redLimit = 300000;
        settings.blueLimit = 300000;
        settings.totalEnds = 2;
        settings.tieBreak = 'finalShot';
        settings.rules = 'friendlyMatch';
        settings.resultApproval = 'none';
        break;
      case 'Recreation':
        settings.redLimit = 300000;
        settings.blueLimit = 300000;
        settings.warmup = 'none';
        settings.interval = 'none';
        settings.totalEnds = 2;
        settings.tieBreak = 'none';
        settings.rules = 'recreation';
        settings.resultApproval = 'none';
        break;
      default:
        break;
    }

    return settings;
  };

  // Handle class/gender changes
  const handleClassificationChange = (classId) => {
    setSelectedClassId(classId);

    // Reset gender when class changes
    const classOption = classificationOptions.find(opt => opt.value === classId);
    const defaultGender = classOption?.hasGender ? 'M' : '';
    setSelectedGender(defaultGender);

    // Update URL params
    if (setSearchParams) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        if (classId) {
          newParams.set('c', classId);
          if (classOption?.hasGender) {
            newParams.set('g', 'm');
          } else {
            newParams.delete('g');
          }
        } else {
          newParams.delete('c');
          newParams.delete('g');
        }
        return newParams;
      });
    }

    // Apply class settings
    if (classId) {
      lastClassChangeRef.current = {
        classId: classId,
        timestamp: Date.now()
      };

      const settings = getClassSettings(classId);

      // Update UI state
      currentLimitsRef.current.red = settings.redLimit;
      currentLimitsRef.current.blue = settings.blueLimit;
      setSelectedRedLimit(settings.redLimit);
      setSelectedBlueLimit(settings.blueLimit);
      setSelectedWarmup(settings.warmup);
      setSelectedInterval(settings.interval);
      setSelectedTieBreak(settings.tieBreak);
      setSelectedRules(settings.rules);
      setSelectedResultApproval(settings.resultApproval);
      setSelectedEnds(settings.totalEnds);

      // Record changes (saved on OK)
      setPendingChanges(prev => ({
        ...prev,
        'red.limit': settings.redLimit,
        'blue.limit': settings.blueLimit,
        'match.warmup': settings.warmup,
        'match.interval': settings.interval,
        'match.totalEnds': settings.totalEnds,
        'match.tieBreak': settings.tieBreak,
        'match.rules': settings.rules,
        'match.resultApproval': settings.resultApproval
      }));
    }

    updateClassificationValue(classId, defaultGender, true);
  };

  const handleGenderChange = (gender) => {
    setSelectedGender(gender);

    if (setSearchParams && selectedClassId) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        if (gender === 'M') {
          newParams.set('g', 'm');
        } else if (gender === 'F') {
          newParams.set('g', 'f');
        } else {
          newParams.delete('g');
        }
        return newParams;
      });
    }

    updateClassificationValue(selectedClassId, gender, true);
  };

  const updateClassificationValue = (classId, gender, skipSave = false) => {
    if (!classId) {
      if (!skipSave && onUpdateField) {
        onUpdateField('classification', null, '');
      } else {
        setPendingChanges(prev => ({
          ...prev,
          'classification': ''
        }));
      }
      return;
    }

    try {
      const apiUrl = 'http://localhost:3001';
      const classDefUrl = `${apiUrl}/data/classDefinitions.json`;
      fetch(classDefUrl)
        .then(response => response.json())
        .then(data => {
          const classDef = data.classifications?.[classId];
          if (!classDef) return;

          let prefix = '';
          if (classDef.type === 'individual') {
            prefix = 'IND ';
          } else if (classDef.type === 'pair') {
            prefix = 'PAIR ';
          } else if (classDef.type === 'team') {
            prefix = 'TEAM ';
          } else if (classDef.type === 'recreation') {
            prefix = '';
          }

          // Use English class name for storage
          const className = getLocalizedText(`classNames.${classId}`, 'en') || classDef.name;

          let displayName = `${prefix}${className}`;
          if (gender === 'M') {
            displayName = `${prefix}${className} Male`;
          } else if (gender === 'F') {
            displayName = `${prefix}${className} Female`;
          }

          if (!skipSave && onUpdateField) {
            onUpdateField('classification', null, displayName);
          } else {
            setPendingChanges(prev => ({
              ...prev,
              'classification': displayName
            }));
          }
        })
        .catch(error => {
          console.error('Class def load error:', error);
        });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Recalculate sections array
  const recalculateSections = (totalEnds, warmup, interval, resultApproval) => {
    const newSections = ['standby'];

    if (warmup === 'simultaneous') {
      newSections.push('warmup');
    } else if (warmup === 'separate') {
      newSections.push('warmup1', 'warmup2');
    }

    for (let i = 1; i <= totalEnds; i++) {
      newSections.push(`end${i}`);
      if (i < totalEnds && interval !== 'none') {
        newSections.push('interval');
      }
    }

    newSections.push('matchFinished');

    if (resultApproval !== 'none') {
      newSections.push('resultApproval');
    }

    return newSections;
  };

  // Save changes on OK
  const handleSaveChanges = () => {
    if (!onUpdateField) return;

    // Get current values (pending or current gameData)
    const currentTotalEnds = pendingChanges['match.totalEnds'] !== undefined
      ? pendingChanges['match.totalEnds']
      : (gameData?.match?.totalEnds || 4);
    const currentWarmup = pendingChanges['match.warmup'] !== undefined
      ? pendingChanges['match.warmup']
      : (gameData?.match?.warmup || 'simultaneous');
    const currentInterval = pendingChanges['match.interval'] !== undefined
      ? pendingChanges['match.interval']
      : (gameData?.match?.interval || 'enabled');
    const currentResultApproval = pendingChanges['match.resultApproval'] !== undefined
      ? pendingChanges['match.resultApproval']
      : (gameData?.match?.resultApproval || 'enabled');

    const shouldRecalculateSections =
      pendingChanges['match.totalEnds'] !== undefined ||
      pendingChanges['match.warmup'] !== undefined ||
      pendingChanges['match.interval'] !== undefined ||
      pendingChanges['match.resultApproval'] !== undefined;

    const finalChanges = { ...pendingChanges };
    if (shouldRecalculateSections) {
      const newSections = recalculateSections(
        currentTotalEnds,
        currentWarmup,
        currentInterval,
        currentResultApproval
      );
      finalChanges['match.sections'] = newSections;
    }

    // Update timer limits state if changed
    if (finalChanges['red.limit'] !== undefined) {
      const redLimitValue = finalChanges['red.limit'];
      currentLimitsRef.current.red = redLimitValue;
      setSelectedRedLimit(redLimitValue);
    }
    if (finalChanges['blue.limit'] !== undefined) {
      const blueLimitValue = finalChanges['blue.limit'];
      currentLimitsRef.current.blue = blueLimitValue;
      setSelectedBlueLimit(blueLimitValue);
    }

    if (!saveData || !gameData) {
      console.error('saveData or gameData unavailable');
      return;
    }

    const updatedGameData = { ...gameData };

    // Apply changes
    Object.entries(finalChanges).forEach(([key, value]) => {
      const [parent, child] = key.split('.');
      if (child) {
        // ネストされたプロパティ（red.limit, blue.limit, match.warmupなど）
        if (parent === 'match') {
          updatedGameData.match = {
            ...updatedGameData.match,
            [child]: value
          };
        } else {
          updatedGameData[parent] = {
            ...updatedGameData[parent],
            [child]: value
          };
        }
      } else {
        // 直接プロパティ（classification, category, matchNameなど）
        updatedGameData[parent] = value;
      }
    });

    // 一度に保持
    const savedClassification = finalChanges.classification;
    saveData(updatedGameData);


    // 保存済みフラグを立てる
    savedRef.current = true;
  };

  // ダイアログが閉じるときのハンドラー
  const handleDialogClose = (e) => {
    // 子要素（カスタム設定モーダルなど）からのcloseイベント伝播を防止
    if (e) {
      e.stopPropagation();
      // イベントの発生元がこのダイアログ自身でない場合は何もしない
      if (e.target !== e.currentTarget) return;
    }

    // 保存されずに閉じられた場合（キャンセル時）、親コンポーネントのpendingChangesをクリア
    if (!savedRef.current) {
      if (onPendingChangesChange) {
        onPendingChangesChange({});
      }
    }

    // 次回のためにリセット
    savedRef.current = false;

    if (onClose) {
      onClose(e);
    }
  };

  // タイムアウトや反則のボタンが押されたときの処理
  // これらは例外として、設定画面ごと閉じて試合画面に戻る
  const handleImmediateAction = (actionFn) => {
    if (actionFn) {
      actionFn();
    }
    if (onClose) {
      onClose();
    }
  };
  // Section visibility controls
  const shouldShowRedBlueTimers = () => {
    // Show Red/Blue timers for end, finalShot, and tieBreak sections
    if (section && section.startsWith('end')) return true;
    if (section === 'finalShot') return true;
    if (section === 'tieBreak') return true;
    return false;
  };

  const shouldShowWarmupTimer = () => {
    // Only show warmup timer during warmup
    return section === 'warmup' || section === 'warmup1' || section === 'warmup2';
  };

  const shouldShowIntervalTimer = () => {
    // Only show interval timer during interval
    return section === 'interval';
  };

  const shouldShowPenaltyAndTimeout = () => {
    // Hide for standby, warmup, matchFinished, resultApproval
    if (section === 'standby') return false;
    if (section === 'warmup' || section === 'warmup1' || section === 'warmup2') return false;
    if (section === 'matchFinished') return false;
    if (section === 'resultApproval') return false;

    // Hide penalty/timeout if rules are 'recreation'
    const rules = gameData?.match?.rules || 'worldBoccia';
    if (rules === 'recreation') return false;

    return true;
  };

  return (
    <dialog id="settingModal" data-section={section} onClose={handleDialogClose}>
      <div id="indexModal" className="modalBox">
        <SystemSettings
          handleReset={handleReset}
          handleLanguageChange={handleLanguageChange}
          section={section}
          currentLang={currentLang}
          setPendingChanges={setPendingChanges}
          pendingChanges={pendingChanges}
          gameData={gameData}
          onUpdateField={onUpdateField}
        />

        {section !== 'standby' && (
          <div
            id="endsSetting"
            role="progressbar"
            aria-label="Game Progress"
            aria-valuenow={sectionID}
            aria-valuemin={0}
            aria-valuemax={sections ? sections.length - 1 : 0}
          >
            <ol className="stepList" data-current-step={sectionID}>
              {sections && sections.map((sectionName, index) => {
                // Limit buttons based on number of ends
                const shouldShowButton = () => {
                  // For end-related sections (end1, end2, etc.)
                  if (sectionName.startsWith('end')) {
                    const endNumber = parseInt(sectionName.replace('end', ''), 10);
                    return endNumber <= (totalEnds || 4); // Default to 4 if totalEnds is undefined
                  }
                  // Show interval if before last end or before tieBreak
                  if (sectionName === 'interval') {
                    // Check if previous section is an end
                    const prevSection = sections[index - 1];
                    if (prevSection && prevSection.startsWith('end')) {
                      const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
                      // Always show intervals before the last end
                      if (prevEndNumber < (totalEnds || 4)) {
                        return true;
                      }
                      // If interval after last end, show only if tieBreak follows
                      // sections配列にtieBreakが存在する場合のみ表示（タイブレークボタンを押したとき）
                      const nextSection = sections[index + 1];
                      if (nextSection === 'tieBreak') {
                        // Show only if tieBreak exists in sections array
                        return sections.includes('tieBreak');
                      }
                    }
                    return false; // Hide interval if not before end or tieBreak
                  }
                  // Show tieBreak only if it exists in sections array
                  if (sectionName === 'tieBreak') {
                    // Show only if tieBreak exists in sections array
                    return sections.includes('tieBreak');
                  }
                  // Always show non-end sections (standby, warmup, etc.)
                  if (sectionName === 'warmup' || sectionName === 'warmup1' || sectionName === 'warmup2') {
                    return true;
                  }
                  return true;
                };

                if (!shouldShowButton()) {
                  return null;
                }

                // Calculate visible step indices (after filtering)
                const visibleSteps = sections.filter((s, i) => {
                  if (s.startsWith('end')) {
                    const endNumber = parseInt(s.replace('end', ''), 10);
                    return endNumber <= (totalEnds || 4);
                  }
                  if (s === 'interval') {
                    const prevSection = sections[i - 1];
                    if (prevSection && prevSection.startsWith('end')) {
                      const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
                      // Always show intervals before the last end
                      if (prevEndNumber < (totalEnds || 4)) {
                        return true;
                      }
                      // 最後のエンドの後のインターバルで、次のセクションがタイブレークの場合
                      // sections配列にtieBreakが存在する場合のみ表示（タイブレークボタンを押したとき）
                      const nextSection = sections[i + 1];
                      if (nextSection === 'tieBreak') {
                        // Show only if tieBreak exists in sections array
                        return sections.includes('tieBreak');
                      }
                    }
                    return false;
                  }
                  // タイブレークセクションの場合、sections配列に存在する場合のみ表示（タイブレークボタンを押したとき）
                  if (s === 'tieBreak') {
                    // Show only if tieBreak exists in sections array
                    return sections.includes('tieBreak');
                  }
                  return true;
                });

                const visibleIndex = visibleSteps.findIndex(s => s === sectionName);
                const isCompleted = index < sectionID;
                const isCurrent = index === sectionID;
                const isFuture = index > sectionID;
                const isLast = visibleIndex === visibleSteps.length - 1;
                // Show line to the right for all except last step
                const shouldShowLine = !isLast;

                return (
                  <li
                    key={index}
                    className={`stepItem ${isCompleted ? 'stepCompleted' : ''} ${isCurrent ? 'stepCurrent' : ''} ${isFuture ? 'stepFuture' : ''} ${shouldShowLine ? 'stepHasLine' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    data-step-index={visibleIndex}
                  >
                    <button
                      type="button"
                      name="endsSelectBtn"
                      value={index}
                      data-word={sectionName}
                      className="stepButton"
                      onClick={handleEndsSelect}
                      aria-label={`${getText(`sections.${sectionName}`)} - ${isCurrent ? 'Current' : isCompleted ? 'Completed' : 'Pending'}`}
                    >
                      <span className="stepIndicator" aria-hidden="true">
                        {(isCompleted || isCurrent) && <span className="stepIndicatorFill"></span>}
                      </span>
                      <span className="stepLabel">{getText(`sections.${sectionName}`)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Standby Section Inputs */}
        {section === 'standby' && (
          <div id="standbySetting">
            <MatchGeneralSettings
              classificationOptions={classificationOptions}
              selectedClassId={selectedClassId}
              handleClassificationChange={handleClassificationChange}
              selectedGender={selectedGender}
              handleGenderChange={handleGenderChange}
              pendingChanges={pendingChanges}
              gameData={gameData}
              setPendingChanges={setPendingChanges}
            />
            <TeamSettings
              pendingChanges={pendingChanges}
              gameData={gameData}
              setPendingChanges={setPendingChanges}
            />
            <div id="detailSettings">
              <TimerSettings
                selectedRedLimit={selectedRedLimit}
                setSelectedRedLimit={setSelectedRedLimit}
                selectedBlueLimit={selectedBlueLimit}
                setSelectedBlueLimit={setSelectedBlueLimit}
                selectedWarmup={selectedWarmup}
                setSelectedWarmup={setSelectedWarmup}
                selectedInterval={selectedInterval}
                setSelectedInterval={setSelectedInterval}
                setPendingChanges={setPendingChanges}
              />
              <MatchRuleSettings
                selectedEnds={selectedEnds}
                setSelectedEnds={setSelectedEnds}
                selectedTieBreak={selectedTieBreak}
                setSelectedTieBreak={setSelectedTieBreak}
                selectedRules={selectedRules}
                setSelectedRules={setSelectedRules}
                selectedResultApproval={selectedResultApproval}
                setSelectedResultApproval={setSelectedResultApproval}
                setPendingChanges={setPendingChanges}
              />
            </div>
          </div>
        )}

        {/* Restart End Button (only if settingOpen, scoreAdjusting, and end section) */}
        {scoreAdjusting && section && section.startsWith('end') && (
          <div id="restartEndContainer">
            <button
              type="button"
              className="btn restartEnd"
              onClick={() => {
                onRestartEnd();
                const dialog = document.getElementById('settingModal');
                if (dialog) {
                  dialog.close();
                }
                onClose();
              }}
            >
              {getLocalizedText('buttons.restartEnd', getCurrentLanguage())}
            </button>
          </div>
        )}

        {/* Penalty and Timeout Buttons */}
        {shouldShowPenaltyAndTimeout() && (
          <div id="penaltyTimeoutSetting">
            <div className="penaltyTimeoutGroup red">
              <button
                type="button"
                name="redPenaltyBtn"
                className="btn penalty"
                onClick={() => handleImmediateAction(() => onPenaltyClick && onPenaltyClick('red'))}
              >
                {getLocalizedText('buttons.penalty', getCurrentLanguage()) || 'Penalty'}
              </button>
              <button
                type="button"
                name="redTimeoutBtn"
                className="btn timeout"
                onClick={() => handleImmediateAction(() => onTimeoutClick && onTimeoutClick('red'))}
              >
                {getLocalizedText('buttons.timeout', getCurrentLanguage()) || 'Timeout'}
              </button>
            </div>
            <div className="penaltyTimeoutGroup blue">
              <button
                type="button"
                name="bluePenaltyBtn"
                className="btn penalty"
                onClick={() => handleImmediateAction(() => onPenaltyClick && onPenaltyClick('blue'))}
              >
                {getLocalizedText('buttons.penalty', getCurrentLanguage()) || 'Penalty'}
              </button>
              <button
                type="button"
                name="blueTimeoutBtn"
                className="btn timeout"
                onClick={() => handleImmediateAction(() => onTimeoutClick && onTimeoutClick('blue'))}
              >
                {getLocalizedText('buttons.timeout', getCurrentLanguage()) || 'Timeout'}
              </button>
            </div>
          </div>
        )}

        {/* Timer Settings (Hidden in Standby) */}
        {section !== 'standby' && (
          <div id="timeSetting">
            {/* Red/Blue Timer Adjustment (End, FinalShot, TieBreak only) */}
            {shouldShowRedBlueTimers() && (
              <>
                <div className="btnList">
                  <div>
                    <button type="button" name="redTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('red', '60000')}>+</button>
                    <button type="button" name="redTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('red', '-60000')}>-</button>
                  </div>
                  <div>
                    <button type="button" name="redTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('red', '10000')}>+</button>
                    <button type="button" name="redTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('red', '-10000')}>-</button>
                  </div>
                  <div>
                    <button type="button" name="redTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('red', '1000')}>+</button>
                    <button type="button" name="redTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('red', '-1000')}>-</button>
                  </div>
                </div>
                <div className="btnList">
                  <div>
                    <button type="button" name="blueTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('blue', '60000')}>+</button>
                    <button type="button" name="blueTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('blue', '-60000')}>-</button>
                  </div>
                  <div>
                    <button type="button" name="blueTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('blue', '10000')}>+</button>
                    <button type="button" name="blueTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('blue', '-10000')}>-</button>
                  </div>
                  <div>
                    <button type="button" name="blueTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('blue', '1000')}>+</button>
                    <button type="button" name="blueTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('blue', '-1000')}>-</button>
                  </div>
                </div>
              </>
            )}
            {/* Warmup Timer Adjustment (Warmup only) */}
            {shouldShowWarmupTimer() && (
              <div className="btnList warmupTimer">
                <div>
                  <button type="button" name="warmupTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('warmup', '60000')}>+</button>
                  <button type="button" name="warmupTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('warmup', '-60000')}>-</button>
                </div>
                <div>
                  <button type="button" name="warmupTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('warmup', '10000')}>+</button>
                  <button type="button" name="warmupTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('warmup', '-10000')}>-</button>
                </div>
                <div>
                  <button type="button" name="warmupTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('warmup', '1000')}>+</button>
                  <button type="button" name="warmupTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('warmup', '-1000')}>-</button>
                </div>
              </div>
            )}

            {/* Interval Timer Adjustment (Interval only) */}
            {shouldShowIntervalTimer() && (
              <div className="btnList intervalTimer">
                <div>
                  <button type="button" name="intervalTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('interval', '60000')}>+</button>
                  <button type="button" name="intervalTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('interval', '-60000')}>-</button>
                </div>
                <div>
                  <button type="button" name="intervalTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('interval', '10000')}>+</button>
                  <button type="button" name="intervalTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('interval', '-10000')}>-</button>
                </div>
                <div>
                  <button type="button" name="intervalTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('interval', '1000')}>+</button>
                  <button type="button" name="intervalTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('interval', '-1000')}>-</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show 'Next Match' button for matchFinished and resultApproval */}
        {(section === 'matchFinished' || section === 'resultApproval') && (
          <div id="nextMatchContainer">
            <button
              type="button"
              className="btn nextMatchBtn"
              onClick={handleResetDirect}
            >
              {getLocalizedText('buttons.nextMatch', getCurrentLanguage()) || 'Next Match'}
            </button>
          </div>
        )}

        <form method="dialog">
          <button
            className="settingModalCloseBtn"
            onClick={() => {
              // Save changes on OK click
              if (section === 'standby') {
                handleSaveChanges();
              }
            }}
          >
            <img src={setting2Icon} alt={getLocalizedText('sections.ok', getCurrentLanguage())} />
          </button>
        </form>
      </div>
    </dialog>
  );
};

export default SettingModal;
