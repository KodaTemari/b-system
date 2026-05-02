/**
 * タイマー rAF の onTimeUpdate から呼ぶ saveData（秒が変わったときのみ・LS のみ PUT なし）
 */

/**
 * @param {object} opts
 * @param {'red' | 'blue' | 'warmup' | 'interval'} opts.timerKey
 * @param {React.MutableRefObject<number | null>} opts.lastSavedDisplaySecRef 直近保存した「表示秒」floor
 * @param {React.MutableRefObject<object>} opts.gameDataRef
 * @param {boolean} opts.isCtrl
 * @param {((data: object, options: object) => void) | undefined} opts.saveData
 * @returns {(newTime: number) => void}
 */
export function createTimerTickSaveCallback({
  timerKey,
  lastSavedDisplaySecRef,
  gameDataRef,
  isCtrl,
  saveData,
}) {
  return function handleTimerTickSave(newTime) {
    if (!isCtrl || !saveData) {
      return;
    }
    const latest = gameDataRef.current;
    if (!latest?.[timerKey]?.isRunning) {
      return;
    }
    const displaySec = Math.floor(newTime / 1000);
    if (lastSavedDisplaySecRef.current === displaySec) {
      return;
    }
    lastSavedDisplaySecRef.current = displaySec;
    saveData(
      {
        ...latest,
        [timerKey]: {
          ...latest[timerKey],
          time: newTime,
        },
      },
      { gameOnly: true, gameOnlyLocal: true }
    );
  };
}
