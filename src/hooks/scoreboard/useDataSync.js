import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_GAME_DATA } from '../../utils/scoreboard/constants';

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
      
      // まずcourtのgame.jsonを読み込む
      let url = `${apiUrl}/api/game/${id}/court/${court}`;
      let response = await fetch(url);
      
      let gameData;
      if (response.ok) {
        gameData = await response.json();
      } else {
        // courtのgame.jsonが存在しない場合はconstants.jsからデフォルト値を生成
        gameData = JSON.parse(JSON.stringify(DEFAULT_GAME_DATA));
      }
      
      if (gameData) {
        
        // game.jsonにsectionsとtieBreakがない場合、init.jsonからフォールバック
        if (!gameData.match?.sections || !gameData.match?.tieBreak) {
          const initUrl = `${apiUrl}/data/${id}/init.json`;
          const initResponse = await fetch(initUrl);
          if (initResponse.ok) {
            const initData = await initResponse.json();
            const sectionsData = initData.match?.sections || null;
            const tieBreakData = initData.match?.tieBreak || initData.tieBreak || null;
            
            if (sectionsData || tieBreakData) {
              let processedSections = sectionsData || gameData.match?.sections;
              
              // ウォームアップの設定に応じてセクション配列を更新
              if (processedSections) {
                if (gameData.match?.warmup === 'none') {
                  // ウォームアップが「なし」の場合は、warmupとwarmup1、warmup2を削除
                  processedSections = processedSections.filter(s => s !== 'warmup' && s !== 'warmup1' && s !== 'warmup2');
                } else if (gameData.match?.warmup === 'simultaneous') {
                  // ウォームアップが「同時」の場合は、warmup1とwarmup2を削除し、warmupを追加（存在しない場合）
                  processedSections = processedSections.filter(s => s !== 'warmup1' && s !== 'warmup2');
                  if (!processedSections.includes('warmup')) {
                    const standbyIndex = processedSections.indexOf('standby');
                    if (standbyIndex !== -1) {
                      processedSections.splice(standbyIndex + 1, 0, 'warmup');
                    }
                  }
                } else if (gameData.match?.warmup === 'separate') {
                  // ウォームアップが「別々」の場合は、warmupを削除し、warmup1とwarmup2を追加（存在しない場合）
                  processedSections = processedSections.filter(s => s !== 'warmup');
                  if (!processedSections.includes('warmup1') || !processedSections.includes('warmup2')) {
                    const standbyIndex = processedSections.indexOf('standby');
                    if (standbyIndex !== -1) {
                      // warmup1とwarmup2が存在しない場合のみ追加
                      if (!processedSections.includes('warmup1')) {
                        processedSections.splice(standbyIndex + 1, 0, 'warmup1');
                      }
                      if (!processedSections.includes('warmup2')) {
                        const warmup1Index = processedSections.indexOf('warmup1');
                        if (warmup1Index !== -1) {
                          processedSections.splice(warmup1Index + 1, 0, 'warmup2');
                        }
                      }
                    }
                  }
                }
              }
              
              // インターバルが「なし」の場合は、セクション配列からintervalを削除
              if (gameData.match?.interval === 'none' && processedSections) {
                processedSections = processedSections.filter(s => s !== 'interval');
              }
              
              // 結果承認が「なし」の場合は、セクション配列からresultApprovalを削除
              if (gameData.match?.resultApproval === 'none' && processedSections) {
                processedSections = processedSections.filter(s => s !== 'resultApproval');
              }
              
              gameData.match = {
                ...gameData.match,
                ...(processedSections && { sections: processedSections }),
                ...(tieBreakData && { tieBreak: tieBreakData })
              };
            }
          }
        } else {
          // game.jsonにsectionsがある場合でも、ウォームアップ・インターバル・結果承認の設定に応じて調整
          let processedSections = gameData.match.sections;
          
          // ウォームアップの設定に応じてセクション配列を更新
          if (processedSections) {
            if (gameData.match?.warmup === 'none') {
              processedSections = processedSections.filter(s => s !== 'warmup' && s !== 'warmup1' && s !== 'warmup2');
            } else if (gameData.match?.warmup === 'simultaneous') {
              processedSections = processedSections.filter(s => s !== 'warmup1' && s !== 'warmup2');
              if (!processedSections.includes('warmup')) {
                const standbyIndex = processedSections.indexOf('standby');
                if (standbyIndex !== -1) {
                  processedSections.splice(standbyIndex + 1, 0, 'warmup');
                }
              }
            } else if (gameData.match?.warmup === 'separate') {
              processedSections = processedSections.filter(s => s !== 'warmup');
              if (!processedSections.includes('warmup1') || !processedSections.includes('warmup2')) {
                const standbyIndex = processedSections.indexOf('standby');
                if (standbyIndex !== -1) {
                  if (!processedSections.includes('warmup1')) {
                    processedSections.splice(standbyIndex + 1, 0, 'warmup1');
                  }
                  if (!processedSections.includes('warmup2')) {
                    const warmup1Index = processedSections.indexOf('warmup1');
                    if (warmup1Index !== -1) {
                      processedSections.splice(warmup1Index + 1, 0, 'warmup2');
                    }
                  }
                }
              }
            }
          }
          
          // インターバルが「なし」の場合は、セクション配列からintervalを削除
          if (gameData.match?.interval === 'none' && processedSections) {
            processedSections = processedSections.filter(s => s !== 'interval');
          }
          
          // 結果承認が「なし」の場合は、セクション配列からresultApprovalを削除
          if (gameData.match?.resultApproval === 'none' && processedSections) {
            processedSections = processedSections.filter(s => s !== 'resultApproval');
          }
          
          gameData.match = {
            ...gameData.match,
            sections: processedSections
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
      
      // タイムアウト関連の項目を除外（ローカルのみで管理）
      // sectionsとtieBreakはgame.jsonで管理するため保存対象に含める
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
        match: data.match || {
          sectionID: 0
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
