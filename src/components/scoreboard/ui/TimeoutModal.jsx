import React, { useState, useEffect, useRef } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * タイムアウト選択モーダルコンポーネント
 */
const TimeoutModal = ({
  teamColor, // 'red' or 'blue'
  onSelectTimeout,
  onClose,
  getText,
  timeoutData, // 使用しない（互換性のため残す）
  onTimeoutTimeUpdate // 使用しない（互換性のため残す）
}) => {
  const TIMEOUT_DURATION = 600000; // 10分 = 600000ms
  
  // タイムアウトのリスト
  const timeouts = [
    { id: 'medical', name: getLocalizedText('timeouts.medical', getCurrentLanguage()) || 'メディカルタイムアウト', fullWidth: false },
    { id: 'technical', name: getLocalizedText('timeouts.technical', getCurrentLanguage()) || 'テクニカルタイムアウト', fullWidth: false }
  ];

  const teamName = teamColor === 'red' 
    ? getLocalizedText('buttons.redTimeout', getCurrentLanguage()) || '赤のタイムアウト'
    : getLocalizedText('buttons.blueTimeout', getCurrentLanguage()) || '青のタイムアウト';

  // タイマーの状態管理（ローカルのみ、JSONには保存しない）
  const [medicalTime, setMedicalTime] = useState(TIMEOUT_DURATION);
  const [technicalTime, setTechnicalTime] = useState(TIMEOUT_DURATION);
  const [medicalRunning, setMedicalRunning] = useState(false);
  const [technicalRunning, setTechnicalRunning] = useState(false);
  
  const medicalTimerRef = useRef(null);
  const technicalTimerRef = useRef(null);
  const medicalStartTimeRef = useRef(null);
  const technicalStartTimeRef = useRef(null);
  const medicalInitialTimeRef = useRef(TIMEOUT_DURATION);
  const technicalInitialTimeRef = useRef(TIMEOUT_DURATION);
  const lastMedicalDisplayTimeRef = useRef(0);
  const lastTechnicalDisplayTimeRef = useRef(0);

  // 時間をフォーマット
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // メディカルタイムアウトのタイマー
  useEffect(() => {
    if (medicalRunning) {
      if (!medicalTimerRef.current) {
        medicalStartTimeRef.current = Date.now();
        medicalInitialTimeRef.current = medicalTime;
        
        medicalTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - medicalStartTimeRef.current;
          const newTime = Math.max(0, medicalInitialTimeRef.current - elapsed);
          setMedicalTime(newTime);
          
          // タイマー時間の更新（ローカルのみ、JSONには保存しない）
          const displayTimeSeconds = Math.floor(newTime / 1000);
          if (displayTimeSeconds !== lastMedicalDisplayTimeRef.current) {
            lastMedicalDisplayTimeRef.current = displayTimeSeconds;
          }
          
          if (newTime <= 0) {
            setMedicalRunning(false);
            if (medicalTimerRef.current) {
              clearInterval(medicalTimerRef.current);
              medicalTimerRef.current = null;
            }
          }
        }, 100);
      }
    } else {
      if (medicalTimerRef.current) {
        clearInterval(medicalTimerRef.current);
        medicalTimerRef.current = null;
      }
    }
    
    return () => {
      if (medicalTimerRef.current) {
        clearInterval(medicalTimerRef.current);
        medicalTimerRef.current = null;
      }
    };
  }, [medicalRunning, teamColor, onTimeoutTimeUpdate]);

  // テクニカルタイムアウトのタイマー
  useEffect(() => {
    if (technicalRunning) {
      if (!technicalTimerRef.current) {
        technicalStartTimeRef.current = Date.now();
        technicalInitialTimeRef.current = technicalTime;
        
        technicalTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - technicalStartTimeRef.current;
          const newTime = Math.max(0, technicalInitialTimeRef.current - elapsed);
          setTechnicalTime(newTime);
          
          // タイマー時間の更新（ローカルのみ、JSONには保存しない）
          const displayTimeSeconds = Math.floor(newTime / 1000);
          if (displayTimeSeconds !== lastTechnicalDisplayTimeRef.current) {
            lastTechnicalDisplayTimeRef.current = displayTimeSeconds;
          }
          
          if (newTime <= 0) {
            setTechnicalRunning(false);
            if (technicalTimerRef.current) {
              clearInterval(technicalTimerRef.current);
              technicalTimerRef.current = null;
            }
          }
        }, 100);
      }
    } else {
      if (technicalTimerRef.current) {
        clearInterval(technicalTimerRef.current);
        technicalTimerRef.current = null;
      }
    }
    
    return () => {
      if (technicalTimerRef.current) {
        clearInterval(technicalTimerRef.current);
        technicalTimerRef.current = null;
      }
    };
  }, [technicalRunning, teamColor, onTimeoutTimeUpdate]);

  // timeoutDataは使用しない（ローカルのみで管理）

  const handleTimeoutSelect = (timeoutId) => {
    // タイマーを開始
    if (timeoutId === 'medical') {
      setMedicalTime(TIMEOUT_DURATION);
      setMedicalRunning(true);
    } else if (timeoutId === 'technical') {
      setTechnicalTime(TIMEOUT_DURATION);
      setTechnicalRunning(true);
    }
    
    if (onSelectTimeout) {
      onSelectTimeout(teamColor, timeoutId, TIMEOUT_DURATION);
    }
  };

  const handleDialogClick = (e) => {
    // クリックされた要素がdialog要素自体（背景）の場合のみ閉じる
    if (e.target === e.currentTarget) {
      const dialog = document.getElementById('timeoutModal');
      if (dialog) {
        dialog.close();
      }
      if (onClose) {
        onClose();
      }
    }
  };

  return (
    <dialog id="timeoutModal" onClose={onClose} onClick={handleDialogClick}>
      <div className="timeoutModalBox" data-team-color={teamColor}>
        <h2 className={`timeoutModalTitle ${teamColor}`}>
          {teamName}
        </h2>
        
        <div className="timeoutList">
          {timeouts.map((timeout) => {
            const isRunning = timeout.id === 'medical' 
              ? medicalRunning 
              : technicalRunning;
            const displayTime = timeout.id === 'medical' 
              ? formatTime(medicalTime) 
              : formatTime(technicalTime);
            
            return (
              <div key={timeout.id} className="timeoutItemContainer">
                <button
                  type="button"
                  name="timeoutItem"
                  value={timeout.id}
                  className={`btn timeoutItem ${isRunning ? 'timeoutItem-running' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleTimeoutSelect(timeout.id);
                  }}
                >
                  {timeout.name}
                </button>
                {isRunning && (
                  <div className="timeoutTimer">
                    {displayTime}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className="timeoutModalCloseBtn" onClick={onClose}>
          ×
        </button>
      </div>
    </dialog>
  );
};

export default TimeoutModal;

