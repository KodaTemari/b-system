import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_GAME_DATA, TIMER_LIMITS } from '../../utils/scoreboard/constants';

/**
 * データ同期のカスタムフック
 * Local Storage同期を管理
 */
export const useDataSync = (id, cls, court, isCtrl) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [localData, setLocalData] = useState(null);
  

  const loadGameData = useCallback(async () => {
    if (!id || !court) return;

    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = 'http://localhost:3001';
      
      // settings.json と game.json を並列で取得
      const [settingsRes, gameRes] = await Promise.all([
        fetch(`${apiUrl}/api/data/${id}/court/${court}/settings`),
        fetch(`${apiUrl}/api/data/${id}/court/${court}/game`)
      ]);
      
      let settingsData = {};
      let gameDataState = {};

      if (settingsRes.ok) {
        settingsData = await settingsRes.json();
      } else {
        // settings.json がない場合は大会設定(init.json)から初期生成を試みる
        const initUrl = `${apiUrl}/data/${id}/init.json`;
        const initRes = await fetch(initUrl);
        if (initRes.ok) {
          const initData = await initRes.json();
          settingsData = {
            classification: '',
            category: '',
            matchName: '',
            match: {
              totalEnds: initData.match?.totalEnds || 6,
              warmup: initData.match?.warmup || 'simultaneous',
              interval: initData.match?.interval || 'enabled',
              rules: initData.match?.rules || 'worldBoccia',
              resultApproval: initData.match?.resultApproval || 'enabled',
              tieBreak: initData.match?.tieBreak || 'finalShot',
              sections: initData.match?.sections
            },
            red: { name: 'Red', limit: TIMER_LIMITS.GAME },
            blue: { name: 'Blue', limit: TIMER_LIMITS.GAME },
            warmup: { limit: TIMER_LIMITS.WARMUP },
            interval: { limit: TIMER_LIMITS.INTERVAL }
          };
        } else {
          // init.json もない場合の最小限のデフォルト
          settingsData = {
            match: { totalEnds: 6, warmup: 'simultaneous', interval: 'enabled', rules: 'worldBoccia', resultApproval: 'enabled', tieBreak: 'finalShot' },
            red: { name: 'Red', limit: TIMER_LIMITS.GAME },
            blue: { name: 'Blue', limit: TIMER_LIMITS.GAME }
          };
        }
      }

      if (gameRes.ok) {
        gameDataState = await gameRes.json();
      } else {
        // game.json がない場合はデフォルト値を生成
        gameDataState = JSON.parse(JSON.stringify(DEFAULT_GAME_DATA));
      }
      
      // 設定と進行状態をマージ（設定を優先して適用）
      const mergedData = {
        ...gameDataState,
        ...settingsData,
        match: {
          ...gameDataState.match,
          ...(settingsData.match || {})
        },
        red: {
          ...gameDataState.red,
          ...(settingsData.red || {})
        },
        blue: {
          ...gameDataState.blue,
          ...(settingsData.blue || {})
        }
      };

      // totalEndsとsectionsの不整合を解消
      if (mergedData.match?.totalEnds && mergedData.match?.sections) {
        const currentTotalEnds = mergedData.match.totalEnds;
        const sections = mergedData.match.sections;
        const lastEndSection = sections.filter(s => s.startsWith('end')).pop();
        const lastEndNumber = lastEndSection ? parseInt(lastEndSection.replace('end', ''), 10) : 0;
        
        if (lastEndNumber !== currentTotalEnds) {
          console.log(`不整合を検知: totalEnds=${currentTotalEnds}, sections内の最後のエンド=${lastEndNumber}`);
          // sectionsを再計算（settings.jsonの内容を信頼するが、sectionsが古い場合のみ）
          const recalculateSections = (total, warmup, interval, resultApproval) => {
            const newSections = ['standby'];
            if (warmup === 'simultaneous') newSections.push('warmup');
            else if (warmup === 'separate') newSections.push('warmup1', 'warmup2');
            for (let i = 1; i <= total; i++) {
              newSections.push(`end${i}`);
              if (i < total && interval !== 'none') newSections.push('interval');
            }
            newSections.push('matchFinished');
            if (resultApproval !== 'none') newSections.push('resultApproval');
            return newSections;
          };
          
          mergedData.match.sections = recalculateSections(
            currentTotalEnds,
            mergedData.match.warmup || 'simultaneous',
            mergedData.match.interval || 'enabled',
            mergedData.match.resultApproval || 'enabled'
          );
        }
      }
      
      setLocalData(mergedData);
      localStorage.setItem(`scoreboard_${id}_${court}_data`, JSON.stringify(mergedData));

      // 初回のみ：ファイルが存在しなかった場合、作成したデフォルトをサーバーに保存
      if (!settingsRes.ok || !gameRes.ok) {
        if (isCtrl) {
          saveToGameJson(mergedData);
        }
      }
    } catch (err) {
      console.error('データ読み込みエラー:', err);
      setError('データの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id, court]);

  // データを保存（設定と進行を分離して保存）
  const saveToGameJson = useCallback(async (data) => {
    if (!id || !court || !data) return;

    try {
      const apiUrl = 'http://localhost:3001';
      
      // 1. 設定データ (settings.json)
      const settingsToSave = {
        classification: data.classification,
        category: data.category,
        matchName: data.matchName,
        match: {
          totalEnds: data.match?.totalEnds,
          warmup: data.match?.warmup,
          interval: data.match?.interval,
          rules: data.match?.rules,
          resultApproval: data.match?.resultApproval,
          tieBreak: data.match?.tieBreak,
          sections: data.match?.sections
        },
        red: {
          name: data.red?.name,
          limit: data.red?.limit,
          country: data.red?.country,
          profilePic: data.red?.profilePic
        },
        blue: {
          name: data.blue?.name,
          limit: data.blue?.limit,
          country: data.blue?.country,
          profilePic: data.blue?.profilePic
        },
        warmup: { limit: data.warmup?.limit },
        interval: { limit: data.interval?.limit }
      };

      // 2. 進行データ (game.json)
      // 設定データに含まれるものは除外して保存（肥大化と競合防止）
      const gameStateToSave = {
        ...data,
        // 設定項目を空にするのではなく、進行状態のみを確実に含むようにする
        match: {
          ...data.match,
          // 設定項目も念のため含めるが、読み込み時はsettings.jsonを優先する
        }
      };
      
      // 非同期で両方のファイルを更新
      // （※タイマーなどの頻繁な更新時は game.json のみでも良いが、まずは確実性を優先）
      await Promise.all([
        fetch(`${apiUrl}/api/data/${id}/court/${court}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsToSave)
        }),
        fetch(`${apiUrl}/api/data/${id}/court/${court}/game`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gameStateToSave)
        })
      ]);
    } catch (error) {
      console.error('保存エラー:', error);
    }
  }, [id, court]);


  // Local Storageからデータを取得
  const loadFromLocalStorage = useCallback(() => {
    const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
    if (storedData) {
      try {
        setLocalData(JSON.parse(storedData));
      } catch (err) {
        console.error('Local Storage読み込みエラー:', err);
        setError('データの読み込みに失敗しました');
      }
    }
  }, [id, court]);

  // データをLocal Storageに保存
  const saveToLocalStorage = useCallback((data) => {
    const key = `scoreboard_${id}_${court}_data`;
    localStorage.setItem(key, JSON.stringify(data));
    setLocalData(data);
    
    // 他のクライアントに変更を通知（CustomEventを使用）
    window.dispatchEvent(new CustomEvent('scoreboardDataUpdate', {
      detail: { key, data }
    }));
  }, [id, court]);

  // データをLocal Storageとgame.jsonの両方に保存
  const saveData = useCallback(async (data) => {
    if (!data) return;
    
    // totalEndsが失われないように保護
    // data.matchが存在し、totalEndsが含まれていない場合のみ推測
    const protectedData = {
      ...data,
      match: data.match ? {
        ...data.match,
        // totalEndsが存在しない場合、sectionsから推測
        totalEnds: data.match.totalEnds ?? (data.match.sections 
          ? (() => {
              const endSections = data.match.sections.filter(s => s.startsWith('end'));
              if (endSections.length > 0) {
                const endNumbers = endSections.map(s => parseInt(s.replace('end', ''), 10));
                return Math.max(...endNumbers);
              }
              return 4; // デフォルト値
            })()
          : 4)
      } : data.match
    };
    
    // Local Storageに保存
    saveToLocalStorage(protectedData);
    
    // game.jsonにも保存（ctrlモードの場合のみ）
    if (isCtrl) {
      await saveToGameJson(protectedData);
    }
  }, [saveToLocalStorage, saveToGameJson, isCtrl]);

  // Local Storageの変更を監視
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === `scoreboard_${id}_${court}_data` && e.newValue) {
        try {
          const newData = JSON.parse(e.newValue);
          setLocalData(newData);
        } catch (err) {
          console.error('Local Storage更新エラー:', err);
        }
      }
    };

    const handleCustomEvent = (e) => {
      if (e.detail.key === `scoreboard_${id}_${court}_data`) {
        setLocalData(e.detail.data);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('scoreboardDataUpdate', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('scoreboardDataUpdate', handleCustomEvent);
    };
  }, [id, court]);

  // 初期データ読み込み
  useEffect(() => {
    if (isCtrl) {
      loadGameData();
    } else {
      // まずLocal Storageを確認し、データがない場合はJSONファイルから読み込み
      const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
      if (storedData) {
        loadFromLocalStorage();
      } else {
        loadGameData();
      }
    }
  }, [loadGameData, loadFromLocalStorage, isCtrl, id, court]);

  return {
    localData,
    isLoading,
    error,
    saveToLocalStorage,
    saveData
  };
};
