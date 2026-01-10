import { useState, useEffect, useRef, useCallback } from 'react';
import { formatTime, calculateRemainingTime, playAudio, shouldPlayWarning } from '../../utils/scoreboard/timerUtils';
import { TIMER_WARNINGS, AUDIO_FILES } from '../../utils/scoreboard/constants';

/**
 * タイマー管理のカスタムフック
 * @param {Object} config - タイマー設定
 * @param {number} config.initialTime - 初期時間（ミリ秒）
 * @param {boolean} config.isRunning - 実行中かどうか
 * @param {boolean} config.enableAudio - 音声を有効にするかどうか
 * @param {boolean} config.isViewMode - ビューモードかどうか（受信専用）
 * @param {string} config.timerType - タイマーの種類（'red', 'blue', 'warmup', 'interval'）
 * @returns {Object} タイマー状態と制御関数
 */
export const useTimerManagement = ({ initialTime, isRunning, enableAudio = true, onTimeUpdate, isViewMode = false, timerType = 'red', onTimerStop }) => {
  const [remainingMs, setRemainingMs] = useState(initialTime);
  const [displayTime, setDisplayTime] = useState(formatTime(initialTime));
  
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const lastDisplayTimeRef = useRef(0);
  const initialRemainingMsRef = useRef(null);
  
  // 音声再生フラグ
  const hasPlayed1Min = useRef(false);
  const hasPlayed30s = useRef(false);
  const hasPlayed15s = useRef(false);
  const hasPlayed10s = useRef(false);
  const hasPlayedTime = useRef(false);

  // 音声警告の処理（タイマー種別に応じて異なるルールを適用）
  const handleAudioWarnings = useCallback(async (remainingMs) => {
    // 赤・青タイマー: 1分、30秒、10秒、Time
    if (timerType === 'red' || timerType === 'blue') {
      // 1分前の警告
      if (shouldPlayWarning(remainingMs, TIMER_WARNINGS.ONE_MINUTE, hasPlayed1Min.current)) {
        hasPlayed1Min.current = true;
        try {
          await playAudio(AUDIO_FILES.ONE_MINUTE);
        } catch (error) {
          console.warn('1分警告音の再生に失敗:', error);
        }
      }
      
      // 30秒前の警告
      if (shouldPlayWarning(remainingMs, TIMER_WARNINGS.THIRTY_SECONDS, hasPlayed30s.current)) {
        hasPlayed30s.current = true;
        try {
          await playAudio(AUDIO_FILES.THIRTY_SECONDS);
        } catch (error) {
          console.warn('30秒警告音の再生に失敗:', error);
        }
      }
      
      // 10秒前の警告
      if (shouldPlayWarning(remainingMs, TIMER_WARNINGS.TEN_SECONDS, hasPlayed10s.current)) {
        hasPlayed10s.current = true;
        try {
          await playAudio(AUDIO_FILES.TEN_SECONDS);
        } catch (error) {
          console.warn('10秒警告音の再生に失敗:', error);
        }
      }
    }
    
    // インターバルタイマー: 1分、15秒
    if (timerType === 'interval') {
      // 1分前の警告
      if (shouldPlayWarning(remainingMs, TIMER_WARNINGS.ONE_MINUTE, hasPlayed1Min.current)) {
        hasPlayed1Min.current = true;
        try {
          await playAudio(AUDIO_FILES.ONE_MINUTE);
        } catch (error) {
          console.warn('1分警告音の再生に失敗:', error);
        }
      }
      
      // 15秒前の警告
      if (shouldPlayWarning(remainingMs, TIMER_WARNINGS.FIFTEEN_SECONDS, hasPlayed15s.current)) {
        hasPlayed15s.current = true;
        try {
          await playAudio(AUDIO_FILES.FIFTEEN_SECONDS);
        } catch (error) {
          console.warn('15秒警告音の再生に失敗:', error);
        }
      }
    }
    
    // Time音はsetInterval内の終了チェックで一括管理するため、ここでは再生しない
  }, [timerType]);


  // タイマーリセット
  const resetTimer = useCallback((newTime) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startTimeRef.current = null;
    setRemainingMs(newTime);
    setDisplayTime(formatTime(newTime));
    lastDisplayTimeRef.current = Math.floor(newTime / 1000);
    
    // 音声フラグをリセット
    hasPlayed1Min.current = false;
    hasPlayed30s.current = false;
    hasPlayed15s.current = false;
    hasPlayed10s.current = false;
    hasPlayedTime.current = false;
  }, []);

  // initialTimeの変更を監視
  useEffect(() => {
    setRemainingMs(initialTime);
    setDisplayTime(formatTime(initialTime));
    
    // 音声フラグをリセット（0より大きい値に設定された時のみ）
    if (initialTime > 0) {
      hasPlayed1Min.current = false;
      hasPlayed30s.current = false;
      hasPlayed15s.current = false;
      hasPlayed10s.current = false;
      hasPlayedTime.current = false;
    }
  }, [initialTime]);

  // isRunningの変更を監視
  useEffect(() => {
    // viewモードでは自動カウントダウンを無効にする
    if (isViewMode) {
      return;
    }
    
    if (isRunning) {
      // 残り時間がある場合のみタイマー開始
      if (!timerRef.current && remainingMs > 0) {
        startTimeRef.current = Date.now();
        initialRemainingMsRef.current = remainingMs;
        
        timerRef.current = setInterval(() => {
          const newRemainingMs = calculateRemainingTime(startTimeRef.current, initialRemainingMsRef.current);
          
          // タイマー終了チェック
          if (newRemainingMs <= 0) {
            setRemainingMs(0);
            setDisplayTime(formatTime(0));
            clearInterval(timerRef.current);
            timerRef.current = null;
            
            if (onTimeUpdate) {
              onTimeUpdate(0);
            }
            
            if (enableAudio && !hasPlayedTime.current) {
              hasPlayedTime.current = true;
              playAudio(AUDIO_FILES.TIME_UP);
            }
            return;
          }
          
          if (onTimeUpdate) {
            onTimeUpdate(newRemainingMs);
          }
          
          setRemainingMs(newRemainingMs);

          const displayTimeSeconds = Math.floor(newRemainingMs / 1000);
          if (displayTimeSeconds !== lastDisplayTimeRef.current) {
            lastDisplayTimeRef.current = displayTimeSeconds;
            setDisplayTime(formatTime(newRemainingMs));
            
            if (enableAudio && newRemainingMs > 0) {
              handleAudioWarnings(newRemainingMs);
            }
          }
        }, 100);
      }
    } else {
      // タイマー停止
      if (timerRef.current) {
        if (startTimeRef.current !== null && initialRemainingMsRef.current !== null) {
          const currentRemainingMs = calculateRemainingTime(startTimeRef.current, initialRemainingMsRef.current);
          setRemainingMs(currentRemainingMs);
          setDisplayTime(formatTime(currentRemainingMs));
          
          if (onTimeUpdate) {
            onTimeUpdate(currentRemainingMs);
          }
          
          if (onTimerStop) {
            onTimerStop(currentRemainingMs);
          }
        }
        
        clearInterval(timerRef.current);
        timerRef.current = null;
        startTimeRef.current = null;
        initialRemainingMsRef.current = null;
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, enableAudio, onTimeUpdate, onTimerStop, handleAudioWarnings, isViewMode]);


  // 初期時間の変更を監視
  useEffect(() => {
    if (!isRunning) {
      setRemainingMs(initialTime);
      setDisplayTime(formatTime(initialTime));
      lastDisplayTimeRef.current = Math.floor(initialTime / 1000);
    }
  }, [initialTime, isRunning]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    remainingMs,
    displayTime,
    isRunning,
    resetTimer
  };
};
