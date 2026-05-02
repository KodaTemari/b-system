/**
 * ctrl 停止中に親の initialTime が merge で ms だけ変わっても、同一「表示秒」なら同期しない。
 * 巻き戻り／進みのチラつき防止。
 *
 * @param {number | null | undefined} prevAppliedMs 直前に子へ適用した親の ms
 * @param {unknown} incomingMs 今回の親 initialTime
 * @returns {boolean} true なら setRemainingMs 等をスキップする
 */
export function shouldSkipCtrlStoppedParentSync(prevAppliedMs, incomingMs) {
  if (prevAppliedMs == null) {
    return false;
  }
  const raw = Math.max(0, Number(incomingMs) || 0);
  const prev = Number(prevAppliedMs);
  const sameSecond = Math.floor(raw / 1000) === Math.floor(prev / 1000);
  return sameSecond && Math.abs(raw - prev) < 1000;
}
