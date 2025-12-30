import { useState, useEffect, useCallback } from 'react';

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
      
      // init.jsonからsectionsとtieBreakを読み込む
      const initUrl = `${apiUrl}/data/${id}/init.json`;
      const initResponse = await fetch(initUrl);
      let sectionsData = null;
      let tieBreakData = null;
      if (initResponse.ok) {
        const initData = await initResponse.json();
        sectionsData = initData.match?.sections || null;
        tieBreakData = initData.match?.tieBreak || initData.tieBreak || null;
      }
      
      // まずcourtのgame.jsonを読み込む
      let url = `${apiUrl}/api/game/${id}/court/${court}`;
      let response = await fetch(url);
      
      // courtのgame.jsonが存在しない場合はreset/game.jsonを使用
      if (!response.ok) {
        url = `${apiUrl}/data/${id}/reset/game.json`;
        response = await fetch(url);
      }
      
      if (response.ok) {
        const gameData = await response.json();
        
        // sectionsとtieBreakをinit.jsonから取得したデータで置き換え
        if (sectionsData || tieBreakData) {
          gameData.match = {
            ...gameData.match,
            ...(sectionsData && { sections: sectionsData }),
            ...(tieBreakData && { tieBreak: tieBreakData })
          };
        }
        
        setLocalData(gameData);
        
        // Local Storageにも保存
        localStorage.setItem(`scoreboard_${id}_${court}_data`, JSON.stringify(gameData));
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (err) {
      console.error('ゲームデータ読み込みエラー:', err);
      setError('ゲームデータの読み込みに失敗しました');
      
      // エラーの場合、Local Storageから復元を試行
      const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
      if (storedData) {
        try {
          setLocalData(JSON.parse(storedData));
        } catch (parseErr) {
          console.error('Local Storage復元エラー:', parseErr);
        }
      }
    } finally {
      setIsLoading(false);
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

  // データをgame.jsonに保存
  const saveToGameJson = useCallback(async (data) => {
    if (!id || !court || !data) return;

    try {
      const apiUrl = 'http://localhost:3001';
      const url = `${apiUrl}/api/game/${id}/court/${court}`;
      
      // sectionsとtieBreakを除外して保存（init.jsonから取得するため）
      // タイムアウト関連の項目も除外（ローカルのみで管理）
      const cleanRed = data.red ? { ...data.red } : {};
      const cleanBlue = data.blue ? { ...data.blue } : {};
      
      // タイムアウト関連の項目を削除
      delete cleanRed.medicalTimeoutUsed;
      delete cleanRed.medicalTimeoutTime;
      delete cleanRed.medicalTimeoutRunning;
      delete cleanRed.technicalTimeoutUsed;
      delete cleanRed.technicalTimeoutTime;
      delete cleanRed.technicalTimeoutRunning;
      
      delete cleanBlue.medicalTimeoutUsed;
      delete cleanBlue.medicalTimeoutTime;
      delete cleanBlue.medicalTimeoutRunning;
      delete cleanBlue.technicalTimeoutUsed;
      delete cleanBlue.technicalTimeoutTime;
      delete cleanBlue.technicalTimeoutRunning;
      
      const dataToSave = {
        ...data,
        match: data.match ? {
          ...data.match,
          sections: undefined, // sectionsを除外
          tieBreak: undefined  // tieBreakを除外
        } : {
          sectionID: 0,
          sections: undefined,
          tieBreak: undefined
        },
        red: cleanRed,
        blue: cleanBlue
      };
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to save to game.json:', errorData);
      }
    } catch (error) {
      console.error('Error saving to game.json:', error);
    }
  }, [id, court]);


  // データをLocal Storageとgame.jsonの両方に保存
  const saveData = useCallback(async (data) => {
    if (!data) return;
    
    // Local Storageに保存
    saveToLocalStorage(data);
    
    // game.jsonにも保存（ctrlモードの場合のみ）
    if (isCtrl) {
      await saveToGameJson(data);
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
