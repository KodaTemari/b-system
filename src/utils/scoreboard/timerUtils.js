// タイマー関連のユーティリティ関数

/**
 * ミリ秒を分:秒形式の文字列に変換
 * @param {number} ms - ミリ秒
 * @returns {string} "M:SS" 形式の文字列
 */
export const formatTime = (ms) => {
  const total = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.ceil(total / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * タイマーの残り時間を計算
 * @param {number} startTime - 開始時刻（ミリ秒）
 * @param {number} duration - 継続時間（ミリ秒）
 * @returns {number} 残り時間（ミリ秒）
 */
export const calculateRemainingTime = (startTime, duration) => {
  if (!startTime) return duration;
  const elapsed = Date.now() - startTime;
  return Math.max(0, duration - elapsed);
};

/**
 * 音声を再生
 * @param {string} audioSrc - 音声ファイルのパス
 * @returns {Promise<void>}
 */
export const playAudio = (audioSrc) => {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioSrc);
    audio.preload = 'auto';
    audio.play()
      .then(() => resolve())
      .catch((error) => {
        console.warn('音声再生エラー:', error);
        reject(error);
      });
  });
};

/**
 * タイマー警告音を再生するかどうかを判定
 * @param {number} remainingMs - 残り時間（ミリ秒）
 * @param {number} warningTime - 警告時間（ミリ秒）
 * @param {boolean} hasPlayed - 既に再生済みかどうか
 * @returns {boolean} 再生すべきかどうか
 */
export const shouldPlayWarning = (remainingMs, warningTime, hasPlayed) => {
  return remainingMs <= warningTime && remainingMs > (warningTime - 1000) && !hasPlayed;
};
