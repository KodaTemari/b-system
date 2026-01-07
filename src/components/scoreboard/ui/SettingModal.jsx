import React, { useState, useEffect } from 'react';
import { getText as getLocalizedText, getCurrentLanguage, setLanguage } from '../../../locales';
import resetIcon from '../img/icon_reset.png';
import setting2Icon from '../img/icon_setting_2.png';
import languageIcon from '../img/icon_language.png';

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
  setSearchParams
}) => {
  // クラス選択肢と性別選択肢の状態
  const [classificationOptions, setClassificationOptions] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedGender, setSelectedGender] = useState('M');
  const [selectedEnds, setSelectedEnds] = useState(totalEnds || 4);
  const [selectedTieBreak, setSelectedTieBreak] = useState(gameData?.match?.tieBreak || 'none');
  const [selectedWarmup, setSelectedWarmup] = useState(gameData?.match?.warmup || 'simultaneous');
  const [selectedInterval, setSelectedInterval] = useState(gameData?.match?.interval || 'enabled');
  const [selectedResultApproval, setSelectedResultApproval] = useState(gameData?.match?.resultApproval || 'none');
  const [selectedRules, setSelectedRules] = useState(gameData?.match?.rules || 'worldBoccia');
  
  // 赤・青タイマーのリミット時間（ミリ秒）
  const [selectedRedLimit, setSelectedRedLimit] = useState(gameData?.red?.limit || 300000);
  const [selectedBlueLimit, setSelectedBlueLimit] = useState(gameData?.blue?.limit || 300000);
  
  // クラス変更による自動更新を追跡するためのref
  const lastClassChangeRef = React.useRef({ classId: null, timestamp: 0 });
  const currentLimitsRef = React.useRef({ red: selectedRedLimit, blue: selectedBlueLimit });
  
  // 変更を追跡するためのstate（OKボタン押下時にまとめて保存）
  const [pendingChanges, setPendingChanges] = useState({});
  
  // 言語切り替えモーダルの表示状態
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  // 言語変更ハンドラー
  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    setCurrentLang(lang);
    setShowLanguageModal(false);
    // 言語変更イベントを発火して再レンダリングをトリガー
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    
    // URLパラメータを更新（ctrl画面とview画面の両方で動作）
    if (setSearchParams) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('l', lang);
        return newParams;
      });
    }
    
    // LocalStorageに保存して他のタブに通知（ctrl画面とview画面の連動のため）
    try {
      localStorage.setItem('scoreboard_language', lang);
      // BroadcastChannel APIで他のタブに通知
      const channel = new BroadcastChannel('scoreboard_language');
      channel.postMessage({ language: lang });
      channel.close();
    } catch (error) {
      console.error('言語設定の保存に失敗しました:', error);
    }
  };

  // 言語変更イベントをリッスン
  useEffect(() => {
    const handleLanguageChangeEvent = (event) => {
      setCurrentLang(event.detail.language);
    };
    window.addEventListener('languageChanged', handleLanguageChangeEvent);
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChangeEvent);
    };
  }, []);

  // totalEndsが変更されたときに状態を更新
  // pendingChangesにmatch.totalEndsがある場合は、gameDataの更新を無視（ユーザーが手動で変更した値を優先）
  useEffect(() => {
    const hasPendingTotalEnds = pendingChanges['match.totalEnds'] !== undefined;
    if (!hasPendingTotalEnds) {
      setSelectedEnds(totalEnds || 4);
    }
  }, [totalEnds, pendingChanges]);
  
  // モーダルが開かれたときにpendingChangesをリセット
  useEffect(() => {
    setPendingChanges({});
  }, [section]);

  // gameDataの変更に合わせて詳細設定の状態を更新
  useEffect(() => {
    // クラス変更直後（1000ms以内）は更新しない
    const now = Date.now();
    if (now - lastClassChangeRef.current.timestamp < 1000) {
      return;
    }
    
    // pendingChangesに値がある場合は、gameDataの更新を無視（ユーザーが手動で変更した値を優先）
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
    
    // pendingChangesにred.limitまたはblue.limitがある場合は、gameDataの更新を無視
    // （ユーザーが手動で変更した値を優先）
    const hasPendingRedLimit = pendingChanges['red.limit'] !== undefined;
    const hasPendingBlueLimit = pendingChanges['blue.limit'] !== undefined;
    
    // 現在の値と異なる場合のみ更新（pendingChangesがない場合のみ）
    // selectedRedLimit/selectedBlueLimitが既に正しい値の場合は更新しない（保存直後の上書きを防ぐ）
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

  // 現在のclassificationからクラスIDと性別を解析
  useEffect(() => {
    if (gameData?.classification) {
      const classification = gameData.classification;
      // "個人 BC1 男子" または "IND BC1 Male" のような形式から解析
      const parts = classification.split(' ');
      
      // プレフィックスを除去（個人、ペア、チーム、IND、PAIR、TEAM）
      const prefixes = ['個人', 'ペア', 'チーム', 'IND', 'PAIR', 'TEAM'];
      // 性別のテキスト（日本語と英語）
      const genderTexts = ['男子', '女子', 'Male', 'Female'];
      let classPart = '';
      let genderPart = '';
      
      if (parts.length >= 2) {
        // 最後の部分が性別かどうかを確認
        const lastPart = parts[parts.length - 1];
        if (genderTexts.includes(lastPart)) {
          genderPart = lastPart;
          // プレフィックスを除去
          const withoutPrefix = parts.slice(0, -1);
          if (prefixes.includes(withoutPrefix[0])) {
            classPart = withoutPrefix.slice(1).join(' ');
          } else {
            classPart = withoutPrefix.join(' ');
          }
        } else {
          // 性別がない場合
          if (prefixes.includes(parts[0])) {
            classPart = parts.slice(1).join(' ');
          } else {
            classPart = parts.join(' ');
          }
        }
      } else {
        classPart = classification;
      }
      
      // クラス名からクラスIDを逆引き
      const findClassId = async () => {
        try {
          const apiUrl = 'http://localhost:3001';
          const classDefUrl = `${apiUrl}/data/classDefinitions.json`;
          const classDefResponse = await fetch(classDefUrl);
          if (classDefResponse.ok) {
            const classDefData = await classDefResponse.json();
            const classDefinitions = classDefData.classifications || {};
            
            // プレフィックスからタイプを判定
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
            
            // 現在の言語を取得
            const currentLang = getCurrentLanguage();
            
            for (const [id, def] of Object.entries(classDefinitions)) {
              // ローカライズされたクラス名を取得
              const localizedName = getLocalizedText(`classNames.${id}`, currentLang) || def.name;
              
              // 名前が一致し、タイプも一致する場合（タイプが判定できた場合）
              if (def.name === classPart || localizedName === classPart) {
                if (expectedType === null || def.type === expectedType) {
                  setSelectedClassId(id);
                  if (genderPart === '男子' || genderPart === 'Male') {
                    setSelectedGender('M');
                  } else if (genderPart === '女子' || genderPart === 'Female') {
                    setSelectedGender('F');
                  } else {
                    setSelectedGender('M'); // 性別がない場合は「男子」をデフォルト
                  }
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error('クラス解析エラー:', error);
        }
      };
      findClassId();
    }
  }, [gameData?.classification]);

  // クラス定義と大会設定を読み込む
  useEffect(() => {
    const loadClassifications = async () => {
      if (!id) return;

      try {
        const apiUrl = 'http://localhost:3001';
        
        // classDefinitions.jsonを読み込む
        const classDefUrl = `${apiUrl}/data/classDefinitions.json`;
        const classDefResponse = await fetch(classDefUrl);
        let classDefinitions = {};
        if (classDefResponse.ok) {
          const classDefData = await classDefResponse.json();
          classDefinitions = classDefData.classifications || {};
        }

        // init.jsonを読み込む
        const initUrl = `${apiUrl}/data/${id}/init.json`;
        const initResponse = await fetch(initUrl);
        let tournamentClassifications = [];
        if (initResponse.ok) {
          const initData = await initResponse.json();
          tournamentClassifications = initData.classifications || [];
        }

        // ユニークなクラスIDのリストを生成
        const uniqueClassIds = [...new Set(tournamentClassifications.map(tc => tc.id))];
        
        // 指定された順序でクラスを並び替え
        const classOrder = [
          'BC1', 'BC2', 'BC3', 'BC4', 'OPStanding', 'OPSeated', 'IndividualFriendly',
          'PairBC3', 'PairBC4', 'PairFriendly',
          'TeamsBC1BC2', 'TeamFriendly',
          'Recreation'
        ];
        
        // 順序に従ってソート
        const sortedClassIds = classOrder.filter(id => uniqueClassIds.includes(id));
        
        const options = sortedClassIds.map(classId => {
          const classDef = classDefinitions[classId];
          if (!classDef) return null;

          // タイプに基づいてプレフィックスを追加
          let prefix = '';
          if (classDef.type === 'individual') {
            prefix = currentLang === 'ja' ? '個人 ' : 'IND ';
          } else if (classDef.type === 'pair') {
            prefix = currentLang === 'ja' ? 'ペア ' : 'PAIR ';
          } else if (classDef.type === 'team') {
            prefix = currentLang === 'ja' ? 'チーム ' : 'TEAM ';
          } else if (classDef.type === 'recreation') {
            prefix = ''; // レクリエーションはプレフィックスなし
          }

          // クラス名をローカライズ
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
        console.error('クラス定義の読み込みエラー:', error);
      }
    };

    if (section === 'standby') {
      loadClassifications();
    }
  }, [id, section, currentLang]);

  // クラスに応じた設定値を取得
  const getClassSettings = (classId) => {
    const settings = {
      // デフォルト値
      redLimit: 270000, // 4:30
      blueLimit: 270000, // 4:30
      warmup: 'simultaneous', // 2:00 同時
      interval: 'enabled', // 1:00
      totalEnds: 4,
      tieBreak: 'extraEnd', // 追加エンド
      rules: 'worldBoccia', // 公式ルール
      resultApproval: 'enabled' // あり
    };

    switch (classId) {
      case 'BC1':
        settings.redLimit = 270000; // 4:30
        settings.blueLimit = 270000; // 4:30
        break;
      case 'BC2':
        settings.redLimit = 210000; // 3:30
        settings.blueLimit = 210000; // 3:30
        break;
      case 'BC3':
        settings.redLimit = 360000; // 6:00
        settings.blueLimit = 360000; // 6:00
        break;
      case 'BC4':
        settings.redLimit = 210000; // 3:30
        settings.blueLimit = 210000; // 3:30
        break;
      case 'OPStanding':
        settings.redLimit = 210000; // 3:30
        settings.blueLimit = 210000; // 3:30
        break;
      case 'OPSeated':
        settings.redLimit = 210000; // 3:30
        settings.blueLimit = 210000; // 3:30
        break;
      case 'IndividualFriendly':
        settings.redLimit = 240000; // 4:00
        settings.blueLimit = 240000; // 4:00
        settings.totalEnds = 2;
        settings.tieBreak = 'finalShot'; // ファイナルショット
        settings.rules = 'friendlyMatch'; // フレンドリーマッチ
        settings.resultApproval = 'none'; // なし
        break;
      case 'PairBC3':
        settings.redLimit = 420000; // 7:00
        settings.blueLimit = 420000; // 7:00
        settings.warmup = 'separate'; // 2:00 別々
        break;
      case 'PairBC4':
        settings.redLimit = 240000; // 4:00
        settings.blueLimit = 240000; // 4:00
        settings.warmup = 'separate'; // 2:00 別々
        break;
      case 'PairFriendly':
        settings.redLimit = 300000; // 5:00
        settings.blueLimit = 300000; // 5:00
        settings.totalEnds = 2;
        settings.tieBreak = 'finalShot'; // ファイナルショット
        settings.rules = 'friendlyMatch'; // フレンドリーマッチ
        settings.resultApproval = 'none'; // なし
        break;
      case 'TeamsBC1BC2':
        settings.redLimit = 300000; // 5:00
        settings.blueLimit = 300000; // 5:00
        settings.warmup = 'separate'; // 2:00 別々
        settings.totalEnds = 6;
        break;
      case 'TeamFriendly':
        settings.redLimit = 300000; // 5:00
        settings.blueLimit = 300000; // 5:00
        settings.totalEnds = 2;
        settings.tieBreak = 'finalShot'; // ファイナルショット
        settings.rules = 'friendlyMatch'; // フレンドリーマッチ
        settings.resultApproval = 'none'; // なし
        break;
      case 'Recreation':
        settings.redLimit = 300000; // 5:00
        settings.blueLimit = 300000; // 5:00
        settings.warmup = 'none'; // なし
        settings.interval = 'none'; // なし
        settings.totalEnds = 2;
        settings.tieBreak = 'none'; // なし
        settings.rules = 'recreation'; // レク
        settings.resultApproval = 'none'; // なし
        break;
      default:
        break;
    }

    return settings;
  };

  // クラスと性別の変更を処理
  const handleClassificationChange = (classId) => {
    setSelectedClassId(classId);
    // クラスが変更されたら性別を「男子」にリセット
    setSelectedGender('M');
    
    // クラスに応じた設定値を適用
    if (classId) {
      // クラス変更のタイムスタンプを記録
      lastClassChangeRef.current = {
        classId: classId,
        timestamp: Date.now()
      };
      
      const settings = getClassSettings(classId);
      
      // 設定値を更新（UI表示用）
      currentLimitsRef.current.red = settings.redLimit;
      currentLimitsRef.current.blue = settings.blueLimit;
      setSelectedRedLimit(settings.redLimit);
      setSelectedBlueLimit(settings.blueLimit);
      setSelectedWarmup(settings.warmup);
      setSelectedInterval(settings.interval);
      setSelectedTieBreak(settings.tieBreak);
      setSelectedRules(settings.rules);
      setSelectedResultApproval(settings.resultApproval);
      setSelectedEnds(settings.totalEnds); // エンド数も更新
      
      // 変更をpendingChangesに記録（保存はOKボタン押下時）
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
    
    // classificationの表示値を更新（保存はOKボタン押下時）
    updateClassificationValue(classId, '', true);
  };

  const handleGenderChange = (gender) => {
    setSelectedGender(gender);
    updateClassificationValue(selectedClassId, gender, true);
  };

  const updateClassificationValue = (classId, gender, skipSave = false) => {
    if (!classId) {
      if (!skipSave && onUpdateField) {
        onUpdateField('classification', null, '');
      } else {
        // 変更をpendingChangesに記録
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

          // タイプに基づいてプレフィックスを追加
          const currentLang = getCurrentLanguage();
          let prefix = '';
          if (classDef.type === 'individual') {
            prefix = currentLang === 'ja' ? '個人 ' : 'IND ';
          } else if (classDef.type === 'pair') {
            prefix = currentLang === 'ja' ? 'ペア ' : 'PAIR ';
          } else if (classDef.type === 'team') {
            prefix = currentLang === 'ja' ? 'チーム ' : 'TEAM ';
          } else if (classDef.type === 'recreation') {
            prefix = ''; // レクリエーションはプレフィックスなし
          }

          // クラス名をローカライズ
          const className = getLocalizedText(`classNames.${classId}`, currentLang) || classDef.name;

          let displayName = `${prefix}${className}`;
          if (gender === 'M') {
            const maleText = currentLang === 'ja' ? '男子' : 'Male';
            displayName = `${prefix}${className} ${maleText}`;
          } else if (gender === 'F') {
            const femaleText = currentLang === 'ja' ? '女子' : 'Female';
            displayName = `${prefix}${className} ${femaleText}`;
          }

          if (!skipSave && onUpdateField) {
            onUpdateField('classification', null, displayName);
          } else {
            // 変更をpendingChangesに記録
            setPendingChanges(prev => ({
              ...prev,
              'classification': displayName
            }));
          }
        })
        .catch(error => {
          console.error('クラス定義の読み込みエラー:', error);
        });
    } catch (error) {
      console.error('エラー:', error);
    }
  };
  
  // sections配列を再計算する関数
  const recalculateSections = (totalEnds, warmup, interval, resultApproval) => {
    const newSections = ['standby'];
    
    // ウォームアップの追加
    if (warmup === 'simultaneous') {
      newSections.push('warmup');
    } else if (warmup === 'separate') {
      newSections.push('warmup1', 'warmup2');
    }
    // warmup === 'none' の場合は何も追加しない
    
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
  
  // OKボタン押下時に変更をまとめて保存
  const handleSaveChanges = () => {
    if (!onUpdateField) return;
    
    // 現在の設定値を取得（pendingChangesがあれば優先）
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
    
    // totalEnds、warmup、interval、resultApprovalのいずれかが変更された場合、sectionsを再計算
    const shouldRecalculateSections = 
      pendingChanges['match.totalEnds'] !== undefined ||
      pendingChanges['match.warmup'] !== undefined ||
      pendingChanges['match.interval'] !== undefined ||
      pendingChanges['match.resultApproval'] !== undefined;
    
    // 再計算したsectionsを含む最終的な変更オブジェクトを作成
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
    
    // red.limitとblue.limitが変更された場合、currentLimitsRefとstateを更新
    // ただし、onUpdateFieldを呼び出す前に更新する（保存処理の前にUIを更新）
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
    
    // すべての変更を一度に適用するため、gameDataを直接更新してsaveDataを呼び出す
    // これにより、複数のonUpdateField呼び出しによる競合を防ぐ
    if (!saveData || !gameData) {
      console.error('saveDataまたはgameDataが利用できません');
      return;
    }
    
    const updatedGameData = { ...gameData };
    
    // 各変更を適用
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
    
    // 一度に保存
    saveData(updatedGameData);
    
    // pendingChangesをクリア（少し遅延させて、gameDataの更新を待つ）
    setTimeout(() => {
      setPendingChanges({});
    }, 100);
  };
  // セクションごとの表示制御
  const shouldShowRedBlueTimers = () => {
    // エンド、ファイナルショット、タイブレークの時は赤・青タイマーを表示
    if (section && section.startsWith('end')) return true;
    if (section === 'finalShot') return true;
    if (section === 'tieBreak') return true;
    return false;
  };

  const shouldShowWarmupTimer = () => {
    // ウォームアップの時のみウォームアップタイマーを表示
    return section === 'warmup' || section === 'warmup1' || section === 'warmup2';
  };

  const shouldShowIntervalTimer = () => {
    // インターバルの時のみインターバルタイマーを表示
    return section === 'interval';
  };

  const shouldShowPenaltyAndTimeout = () => {
    // スタンバイ、ウォームアップ、試合終了、結果承認のセクションでは表示しない
    if (section === 'standby') return false;
    if (section === 'warmup' || section === 'warmup1' || section === 'warmup2') return false;
    if (section === 'matchFinished') return false;
    if (section === 'resultApproval') return false;
    
    // 競技規則が「レク」の場合、反則・タイムアウトボタンを表示しない
    const rules = gameData?.match?.rules || 'worldBoccia';
    if (rules === 'recreation') return false;
    
    return true;
  };

  return (
    <dialog id="settingModal" data-section={section} onClose={onClose}>
      <div id="indexModal" className="modalBox">
        <button type="button" name="resetBtn" onClick={handleReset}>
          <img src={resetIcon} alt={getLocalizedText('buttons.reset', getCurrentLanguage())} />
        </button>
        <button 
          type="button" 
          name="languageBtn" 
          onClick={() => setShowLanguageModal(!showLanguageModal)}
        >
          <img src={languageIcon} alt="Language" />
        </button>
        
        {/* 言語一覧モーダル */}
        {showLanguageModal && (
          <div id="languageModal" className="languageModal">
            <div className="languageModalContent">
              <button
                type="button"
                className={`languageOption ${currentLang === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
              >
                English
              </button>
              <button
                type="button"
                className={`languageOption ${currentLang === 'ja' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('ja')}
              >
                日本語
              </button>
            </div>
          </div>
        )}

        {section !== 'standby' && (
        <div 
          id="endsSetting" 
          role="progressbar" 
          aria-label="ゲーム進行状況"
          aria-valuenow={sectionID}
          aria-valuemin={0}
          aria-valuemax={sections ? sections.length - 1 : 0}
        >
          <ol className="step-list" data-current-step={sectionID}>
            {sections && sections.map((sectionName, index) => {
              // endsの数に基づいてボタンを制限
              const shouldShowButton = () => {
                // エンド関連のセクション（end1, end2, end3, end4など）の場合
                if (sectionName.startsWith('end')) {
                  const endNumber = parseInt(sectionName.replace('end', ''), 10);
                  return endNumber <= (totalEnds || 4); // totalEndsが未定義の場合はデフォルト4
                }
                // インターバルの場合、最後のエンドより前のインターバル、またはタイブレークの前のインターバルを表示
                if (sectionName === 'interval') {
                  // 前のセクションがエンドかどうかチェック
                  const prevSection = sections[index - 1];
                  if (prevSection && prevSection.startsWith('end')) {
                    const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
                    // 最後のエンドより前のインターバルは常に表示
                    if (prevEndNumber < (totalEnds || 4)) {
                      return true;
                    }
                    // 最後のエンドの後のインターバルで、次のセクションがタイブレークの場合
                    // sections配列にtieBreakが存在する場合のみ表示（タイブレークボタンを押したとき）
                    const nextSection = sections[index + 1];
                    if (nextSection === 'tieBreak') {
                      // sections配列にtieBreakが存在する場合のみ表示
                      return sections.includes('tieBreak');
                    }
                  }
                  return false; // エンドの前でない、かつタイブレークの前でもないインターバルは表示しない
                }
                // タイブレークセクションの場合、sections配列に存在する場合のみ表示（タイブレークボタンを押したとき）
                if (sectionName === 'tieBreak') {
                  // sections配列にtieBreakが存在する場合のみ表示
                  return sections.includes('tieBreak');
                }
                // エンド以外のセクション（standby, warmup, warmup1, warmup2, finalShot, matchFinished）は常に表示
                if (sectionName === 'warmup' || sectionName === 'warmup1' || sectionName === 'warmup2') {
                  return true;
                }
                return true;
              };

              if (!shouldShowButton()) {
                return null;
              }

              // 表示されるステップのインデックスを計算（shouldShowButtonでフィルタリングされた後のインデックス）
              const visibleSteps = sections.filter((s, i) => {
                if (s.startsWith('end')) {
                  const endNumber = parseInt(s.replace('end', ''), 10);
                  return endNumber <= (totalEnds || 4);
                }
                if (s === 'interval') {
                  const prevSection = sections[i - 1];
                  if (prevSection && prevSection.startsWith('end')) {
                    const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
                    // 最後のエンドより前のインターバルは常に表示
                    if (prevEndNumber < (totalEnds || 4)) {
                      return true;
                    }
                    // 最後のエンドの後のインターバルで、次のセクションがタイブレークの場合
                    // sections配列にtieBreakが存在する場合のみ表示（タイブレークボタンを押したとき）
                    const nextSection = sections[i + 1];
                    if (nextSection === 'tieBreak') {
                      // sections配列にtieBreakが存在する場合のみ表示
                      return sections.includes('tieBreak');
                    }
                  }
                  return false;
                }
                // タイブレークセクションの場合、sections配列に存在する場合のみ表示（タイブレークボタンを押したとき）
                if (s === 'tieBreak') {
                  // sections配列にtieBreakが存在する場合のみ表示
                  return sections.includes('tieBreak');
                }
                return true;
              });
              
              const visibleIndex = visibleSteps.findIndex(s => s === sectionName);
              const isCompleted = index < sectionID;
              const isCurrent = index === sectionID;
              const isFuture = index > sectionID;
              const isLast = visibleIndex === visibleSteps.length - 1;
              // 最後のステップ以外は、すべて右側に線を表示
              const shouldShowLine = !isLast;

              return (
                <li 
                  key={index}
                  className={`step-item ${isCompleted ? 'step-completed' : ''} ${isCurrent ? 'step-current' : ''} ${isFuture ? 'step-future' : ''} ${shouldShowLine ? 'step-has-line' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  data-step-index={visibleIndex}
                >
                  <button 
                    type="button" 
                    name="endsSelectBtn" 
                    value={index} 
                    data-word={sectionName}
                    className="step-button"
                    onClick={handleEndsSelect}
                    aria-label={`${getText(`sections.${sectionName}`)} - ${isCurrent ? '現在のステップ' : isCompleted ? '完了済み' : '未完了'}`}
                  >
                    <span className="step-indicator" aria-hidden="true">
                      {(isCompleted || isCurrent) && <span className="step-indicator-fill"></span>}
                    </span>
                    <span className="step-label">{getText(`sections.${sectionName}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        )}

        {/* スタンバイセクションの入力欄 */}
        {section === 'standby' && (
          <div id="standbySetting">
            <select
              id="classificationInput"
              value={selectedClassId}
              onChange={(e) => handleClassificationChange(e.target.value)}
            >
              <option value="">{getLocalizedText('labels.classification', getCurrentLanguage()) || 'クラスを選択'}</option>
              {classificationOptions.map((option, index) => (
                <option key={index} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              id="genderInput"
              value={selectedGender}
              onChange={(e) => handleGenderChange(e.target.value)}
              disabled={!selectedClassId || !classificationOptions.find(opt => opt.value === selectedClassId)?.hasGender}
            >
              <option value="M">{getLocalizedText('options.gender.male', currentLang)}</option>
              <option value="F">{getLocalizedText('options.gender.female', currentLang)}</option>
              <option value="">{getLocalizedText('options.gender.mixed', currentLang)}</option>
            </select>
            <input
              id="matchNameInput"
              type="text"
              placeholder={getLocalizedText('labels.matchName', getCurrentLanguage()) || '試合名'}
              value={pendingChanges['matchName'] !== undefined ? pendingChanges['matchName'] : (gameData?.matchName || '')}
              onChange={(e) => {
                // 変更をpendingChangesに記録
                setPendingChanges(prev => ({
                  ...prev,
                  'matchName': e.target.value
                }));
              }}
            />
            <input
              id="redNameInput"
              type="text"
              placeholder={getLocalizedText('labels.redName', getCurrentLanguage()) || '赤の名前'}
              value={pendingChanges['red.name'] !== undefined ? pendingChanges['red.name'] : (gameData?.red?.name || '')}
              onChange={(e) => {
                // 変更をpendingChangesに記録
                setPendingChanges(prev => ({
                  ...prev,
                  'red.name': e.target.value
                }));
              }}
            />
            <input
              id="blueNameInput"
              type="text"
              placeholder={getLocalizedText('labels.blueName', getCurrentLanguage()) || '青の名前'}
              value={pendingChanges['blue.name'] !== undefined ? pendingChanges['blue.name'] : (gameData?.blue?.name || '')}
              onChange={(e) => {
                // 変更をpendingChangesに記録
                setPendingChanges(prev => ({
                  ...prev,
                  'blue.name': e.target.value
                }));
              }}
            />
            <div id="detailSettings">
              <div className="detailSettingItem">
                <label htmlFor="redLimitInput" className="detailSettingLabel">{getLocalizedText('labels.redTimer', currentLang)}</label>
                <select
                  id="redLimitInput"
                  className="detailSettingSelect"
                  value={selectedRedLimit}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value)) {
                      setSelectedRedLimit(value);
                      // 変更をpendingChangesに記録
                      setPendingChanges(prev => ({
                        ...prev,
                        'red.limit': value
                      }));
                    }
                  }}
                >
                  {(() => {
                    const options = [];
                    // 2:00～7:00の30秒ごと
                    for (let minutes = 2; minutes <= 7; minutes++) {
                      for (let seconds = 0; seconds < 60; seconds += 30) {
                        // 7分の時は0秒のみ
                        if (minutes === 7 && seconds === 30) {
                          continue;
                        }
                        const totalMs = minutes * 60000 + seconds * 1000;
                        const displayTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        options.push(
                          <option key={totalMs} value={totalMs}>
                            {displayTime}
                          </option>
                        );
                      }
                    }
                    return options;
                  })()}
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="blueLimitInput" className="detailSettingLabel">{getLocalizedText('labels.blueTimer', currentLang)}</label>
                <select
                  id="blueLimitInput"
                  className="detailSettingSelect"
                  value={selectedBlueLimit}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value)) {
                      setSelectedBlueLimit(value);
                      // 変更をpendingChangesに記録
                      setPendingChanges(prev => ({
                        ...prev,
                        'blue.limit': value
                      }));
                    }
                  }}
                >
                  {(() => {
                    const options = [];
                    // 2:00～7:00の30秒ごと（7:30は除外）
                    for (let minutes = 2; minutes <= 7; minutes++) {
                      for (let seconds = 0; seconds < 60; seconds += 30) {
                        // 7分の時は0秒のみ（7:30を除外）
                        if (minutes === 7 && seconds === 30) {
                          continue;
                        }
                        const totalMs = minutes * 60000 + seconds * 1000;
                        const displayTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        options.push(
                          <option key={totalMs} value={totalMs}>
                            {displayTime}
                          </option>
                        );
                      }
                    }
                    return options;
                  })()}
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="warmupInput" className="detailSettingLabel">{getLocalizedText('labels.warmup', currentLang)}</label>
                <select
                  id="warmupInput"
                  className="detailSettingSelect"
                  value={selectedWarmup}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedWarmup(value);
                    // 変更をpendingChangesに記録
                    setPendingChanges(prev => ({
                      ...prev,
                      'match.warmup': value
                    }));
                  }}
                >
                  <option value="simultaneous">{getLocalizedText('options.warmup.simultaneous', currentLang)}</option>
                  <option value="separate">{getLocalizedText('options.warmup.separate', currentLang)}</option>
                  <option value="none">{getLocalizedText('options.warmup.none', currentLang)}</option>
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="intervalInput" className="detailSettingLabel">{getLocalizedText('labels.interval', currentLang)}</label>
                <select
                  id="intervalInput"
                  className="detailSettingSelect"
                  value={selectedInterval}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedInterval(value);
                    // 変更をpendingChangesに記録
                    setPendingChanges(prev => ({
                      ...prev,
                      'match.interval': value
                    }));
                  }}
                >
                  <option value="enabled">{getLocalizedText('options.interval.enabled', currentLang)}</option>
                  <option value="none">{getLocalizedText('options.interval.none', currentLang)}</option>
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="endsInput" className="detailSettingLabel">{getLocalizedText('labels.numberOfEnds', currentLang)}</label>
                <select
                  id="endsInput"
                  className="detailSettingSelect"
                  value={selectedEnds || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setSelectedEnds('');
                      return;
                    }
                    const newEnds = parseInt(value, 10);
                    if (!isNaN(newEnds)) {
                      setSelectedEnds(newEnds);
                      // 変更をpendingChangesに記録
                      setPendingChanges(prev => ({
                        ...prev,
                        'match.totalEnds': newEnds
                      }));
                    }
                  }}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="tieBreakInput" className="detailSettingLabel">{getLocalizedText('labels.tieBreak', currentLang)}</label>
                <select
                  id="tieBreakInput"
                  className="detailSettingSelect"
                  value={selectedTieBreak}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedTieBreak(value);
                    // 変更をpendingChangesに記録
                    setPendingChanges(prev => ({
                      ...prev,
                      'match.tieBreak': value
                    }));
                  }}
                >
                  <option value="extraEnd">{getLocalizedText('options.tieBreak.extraEnd', currentLang)}</option>
                  <option value="finalShot">{getLocalizedText('options.tieBreak.finalShot', currentLang)}</option>
                  <option value="none">{getLocalizedText('options.tieBreak.none', currentLang)}</option>
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="rulesInput" className="detailSettingLabel">{getLocalizedText('labels.rules', currentLang)}</label>
                <select
                  id="rulesInput"
                  className="detailSettingSelect"
                  value={selectedRules}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedRules(value);
                    // 変更をpendingChangesに記録
                    setPendingChanges(prev => ({
                      ...prev,
                      'match.rules': value
                    }));
                  }}
                >
                  <option value="worldBoccia">{getLocalizedText('options.rules.worldBoccia', currentLang)}</option>
                  <option value="friendlyMatch">{getLocalizedText('options.rules.friendlyMatch', currentLang)}</option>
                  <option value="recreation">{getLocalizedText('options.rules.recreation', currentLang)}</option>
                </select>
              </div>
              <div className="detailSettingItem">
                <label htmlFor="resultApprovalInput" className="detailSettingLabel">{getLocalizedText('labels.resultApproval', currentLang)}</label>
                <select
                  id="resultApprovalInput"
                  className="detailSettingSelect"
                  value={selectedResultApproval}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedResultApproval(value);
                    // 変更をpendingChangesに記録
                    setPendingChanges(prev => ({
                      ...prev,
                      'match.resultApproval': value
                    }));
                  }}
                >
                  <option value="enabled">{getLocalizedText('options.resultApproval.enabled', currentLang)}</option>
                  <option value="none">{getLocalizedText('options.resultApproval.none', currentLang)}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* エンド再開ボタン（settingOpenかつscoreAdjustingかつエンドセクションの時のみ表示） */}
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

        {/* 反則・タイムアウトボタン */}
        {shouldShowPenaltyAndTimeout() && (
          <div id="penaltyTimeoutSetting">
          <div className="penaltyTimeoutGroup red">
            <button 
              type="button" 
              name="redPenaltyBtn" 
              className="btn penalty"
              onClick={() => onPenaltyClick && onPenaltyClick('red')}
            >
              {getLocalizedText('buttons.penalty', getCurrentLanguage()) || '反則'}
            </button>
            <button 
              type="button" 
              name="redTimeoutBtn" 
              className="btn timeout"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onTimeoutClick) {
                  onTimeoutClick('red');
                }
              }}
            >
              {getLocalizedText('buttons.timeout', getCurrentLanguage()) || 'タイムアウト'}
            </button>
          </div>
          <div className="penaltyTimeoutGroup blue">
            <button 
              type="button" 
              name="bluePenaltyBtn" 
              className="btn penalty"
              onClick={() => onPenaltyClick && onPenaltyClick('blue')}
            >
              {getLocalizedText('buttons.penalty', getCurrentLanguage()) || '反則'}
            </button>
            <button 
              type="button" 
              name="blueTimeoutBtn" 
              className="btn timeout"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onTimeoutClick) {
                  onTimeoutClick('blue');
                }
              }}
            >
              {getLocalizedText('buttons.timeout', getCurrentLanguage()) || 'タイムアウト'}
            </button>
          </div>
        </div>
        )}

        {/* タイマー設定（スタンバイセクションの時は非表示） */}
        {section !== 'standby' && (
          <div id="timeSetting">
            {/* 赤・青タイマー調整（エンド、ファイナルショット、タイブレークの時のみ表示） */}
            {shouldShowRedBlueTimers() && (
            <>
              <div className="btnList">
                <div>
                  <button type="button" name="redTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('red', '60000')}>＋</button>
                  <button type="button" name="redTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('red', '-60000')}>－</button>
                </div>
                <div>
                  <button type="button" name="redTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('red', '10000')}>＋</button>
                  <button type="button" name="redTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('red', '-10000')}>－</button>
                </div>
                <div>
                  <button type="button" name="redTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('red', '1000')}>＋</button>
                  <button type="button" name="redTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('red', '-1000')}>－</button>
                </div>
              </div>
              <div className="btnList">
                <div>
                  <button type="button" name="blueTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('blue', '60000')}>＋</button>
                  <button type="button" name="blueTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('blue', '-60000')}>－</button>
                </div>
                <div>
                  <button type="button" name="blueTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('blue', '10000')}>＋</button>
                  <button type="button" name="blueTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('blue', '-10000')}>－</button>
                </div>
                <div>
                  <button type="button" name="blueTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('blue', '1000')}>＋</button>
                  <button type="button" name="blueTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('blue', '-1000')}>－</button>
                </div>
              </div>
            </>
          )}
          {/* ウォームアップタイマー調整（ウォームアップの時のみ表示） */}
          {shouldShowWarmupTimer() && (
            <div className="btnList warmupTimer">
              <div>
                <button type="button" name="warmupTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('warmup', '60000')}>＋</button>
                <button type="button" name="warmupTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('warmup', '-60000')}>－</button>
              </div>
              <div>
                <button type="button" name="warmupTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('warmup', '10000')}>＋</button>
                <button type="button" name="warmupTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('warmup', '-10000')}>－</button>
              </div>
              <div>
                <button type="button" name="warmupTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('warmup', '1000')}>＋</button>
                <button type="button" name="warmupTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('warmup', '-1000')}>－</button>
              </div>
            </div>
          )}

          {/* インターバルタイマー調整（インターバルの時のみ表示） */}
          {shouldShowIntervalTimer() && (
            <div className="btnList intervalTimer">
              <div>
                <button type="button" name="intervalTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('interval', '60000')}>＋</button>
                <button type="button" name="intervalTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('interval', '-60000')}>－</button>
              </div>
              <div>
                <button type="button" name="intervalTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('interval', '10000')}>＋</button>
                <button type="button" name="intervalTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('interval', '-10000')}>－</button>
              </div>
              <div>
                <button type="button" name="intervalTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('interval', '1000')}>＋</button>
                <button type="button" name="intervalTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('interval', '-1000')}>－</button>
              </div>
            </div>
          )}
          </div>
        )}

        {/* 試合終了セクションと結果承認セクションで「次の試合へ」ボタンを表示 */}
        {(section === 'matchFinished' || section === 'resultApproval') && (
          <div id="nextMatchContainer">
            <button 
              type="button" 
              className="btn nextMatchBtn" 
              onClick={handleResetDirect}
            >
              {getLocalizedText('buttons.nextMatch', getCurrentLanguage()) || '次の試合へ'}
            </button>
          </div>
        )}
        
        <form method="dialog">
          <button 
            className="settingModalCloseBtn"
            onClick={() => {
              // OKボタン押下時に変更をまとめて保存
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