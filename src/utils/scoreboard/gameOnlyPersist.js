/** gameOnly / gameOnlyLocal のデバウンス共有（ms） */
export const GAME_ONLY_DEBOUNCE_MS = 140;

export const EMPTY_TIMER_RUNNING_SNAP = Object.freeze({
  red: false,
  blue: false,
  warmup: false,
  interval: false,
});

/**
 * @param {object | null | undefined} d
 * @returns {{ red: boolean, blue: boolean, warmup: boolean, interval: boolean }}
 */
export function snapTimerRunningFlags(d) {
  if (!d || typeof d !== 'object') {
    return { red: false, blue: false, warmup: false, interval: false };
  }
  return {
    red: Boolean(d.red?.isRunning),
    blue: Boolean(d.blue?.isRunning),
    warmup: Boolean(d.warmup?.isRunning),
    interval: Boolean(d.interval?.isRunning),
  };
}

/**
 * @param {{ red: boolean, blue: boolean, warmup: boolean, interval: boolean }} prev
 * @param {{ red: boolean, blue: boolean, warmup: boolean, interval: boolean }} next
 */
export function anyTimerStoppedTransition(prev, next) {
  return (
    (prev.red && !next.red) ||
    (prev.blue && !next.blue) ||
    (prev.warmup && !next.warmup) ||
    (prev.interval && !next.interval)
  );
}
