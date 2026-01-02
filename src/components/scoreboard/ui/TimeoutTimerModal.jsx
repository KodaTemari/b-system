import React, { useState, useEffect, useRef } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * タイムアウトタイマー表示モーダルコンポーネント
 */
const TimeoutTimerModal = ({
  teamColor, // 'red' or 'blue'
  timeoutType, // 'medical' or 'technical'
  isCtrl, // ctrlモードかどうか
  onClose // モーダルを閉じるコールバック
}) => {
  const TIMEOUT_DURATION = 600000; // 10分 = 600000ms
  
  // LocalStorageのキー
  const storageKey = `timeout_${teamColor}_${timeoutType}`;
  
  // タイマーの状態管理
  const [time, setTime] = useState(TIMEOUT_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const initialTimeRef = useRef(TIMEOUT_DURATION);
  const lastDisplayTimeRef = useRef(0);
  
  // タイトルを取得
  const getTitle = () => {
    const currentLang = getCurrentLanguage();
    
    // チーム名を取得（英語: "Red" / "Blue", 日本語: "赤" / "青"）
    const teamName = teamColor === 'red' 
      ? (currentLang === 'en' ? 'Red' : '赤')
      : (currentLang === 'en' ? 'Blue' : '青');
    
    const timeoutName = timeoutType === 'medical'
      ? getLocalizedText('timeouts.medical', currentLang) || 'メディカルタイムアウト'
      : getLocalizedText('timeouts.technical', currentLang) || 'テクニカルタイムアウト';
    
    // 英語の場合は "Red Medical Timeout" 形式、日本語の場合は "赤のメディカルタイムアウト" 形式
    if (currentLang === 'en') {
      return `${teamName} ${timeoutName}`;
    } else {
      return `${teamName}の${timeoutName}`;
    }
  };
  
  // 時間をフォーマット
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // LocalStorageからタイマー状態を読み込む
  useEffect(() => {
    const loadTimerState = () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const data = JSON.parse(stored);
          setTime(data.time || TIMEOUT_DURATION);
          setIsRunning(data.isRunning || false);
          if (data.isRunning) {
            initialTimeRef.current = data.time || TIMEOUT_DURATION;
            startTimeRef.current = Date.now() - (initialTimeRef.current - (data.time || TIMEOUT_DURATION));
          }
        }
      } catch (error) {
        console.error('Error loading timer state:', error);
      }
    };
    
    loadTimerState();
    
    // LocalStorageの変更を監視（他のタブ/ウィンドウからの更新を検知）
    const handleStorageChange = (e) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          setTime(data.time || TIMEOUT_DURATION);
          setIsRunning(data.isRunning || false);
          if (data.isRunning) {
            initialTimeRef.current = data.time || TIMEOUT_DURATION;
            startTimeRef.current = Date.now() - (initialTimeRef.current - (data.time || TIMEOUT_DURATION));
          }
        } catch (error) {
          console.error('Error parsing storage change:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // CustomEventも監視（同じウィンドウ内の更新）
    const handleCustomEvent = (e) => {
      if (e.detail?.key === storageKey) {
        const data = e.detail.data;
        setTime(data.time || TIMEOUT_DURATION);
        setIsRunning(data.isRunning || false);
        if (data.isRunning) {
          initialTimeRef.current = data.time || TIMEOUT_DURATION;
          startTimeRef.current = Date.now() - (initialTimeRef.current - (data.time || TIMEOUT_DURATION));
        }
      }
    };
    
    window.addEventListener('timeoutTimerUpdate', handleCustomEvent);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('timeoutTimerUpdate', handleCustomEvent);
    };
  }, [storageKey]);
  
  // LocalStorageにタイマー状態を保存
  const saveTimerState = (newTime, running) => {
    try {
      const data = {
        time: newTime,
        isRunning: running
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
      
      // 同じウィンドウ内の他のインスタンスに通知
      window.dispatchEvent(new CustomEvent('timeoutTimerUpdate', {
        detail: { key: storageKey, data }
      }));
    } catch (error) {
      console.error('Error saving timer state:', error);
    }
  };
  
  // タイマーの実行
  useEffect(() => {
    if (isRunning) {
      if (!timerRef.current) {
        if (!startTimeRef.current) {
          startTimeRef.current = Date.now();
          initialTimeRef.current = time;
        }
        
        timerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current;
          const newTime = Math.max(0, initialTimeRef.current - elapsed);
          setTime(newTime);
          
          // タイマー状態を保存（1秒ごと）
          const displayTimeSeconds = Math.floor(newTime / 1000);
          if (displayTimeSeconds !== lastDisplayTimeRef.current) {
            lastDisplayTimeRef.current = displayTimeSeconds;
            saveTimerState(newTime, true);
          }
          
          if (newTime <= 0) {
            setIsRunning(false);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            saveTimerState(0, false);
          }
        }, 100);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      startTimeRef.current = null;
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, time, storageKey]);
  
  // 終了ボタンのハンドラー
  const handleEnd = () => {
    setIsRunning(false);
    setTime(TIMEOUT_DURATION);
    // LocalStorageの状態を更新して、viewモードでもモーダルが閉じるようにする
    saveTimerState(TIMEOUT_DURATION, false);
    // モーダルを閉じる（ctrlとviewの両方で動作）
    if (onClose) {
      onClose();
    }
  };
  
  // モーダル背景クリックでは閉じない
  const handleDialogClick = (e) => {
    // 何もしない（終了ボタン以外では閉じない）
    e.stopPropagation();
  };
  
  // タイマーが0になったら自動的に閉じる
  useEffect(() => {
    if (time <= 0 && isRunning === false) {
      const timer = setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [time, isRunning, onClose]);
  
  return (
    <dialog id="timeoutTimerModal" onClick={handleDialogClick}>
      <div className="timeoutTimerModalBox" data-team-color={teamColor}>
        <h2 className={`timeoutTimerModalTitle ${teamColor}`}>
          {getTitle()}
        </h2>
        
        <div className="timeoutTimerDisplay timer">
          {formatTime(time)}
        </div>
        
        {isCtrl && (
          <button
            type="button"
            className="btn timeoutTimerEndBtn"
            onClick={handleEnd}
          >
            {getLocalizedText('buttons.end', getCurrentLanguage()) || '終了'}
          </button>
        )}
      </div>
    </dialog>
  );
};

export default TimeoutTimerModal;

