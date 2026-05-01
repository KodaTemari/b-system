/** 全プール standings の会場での順位掲載を共有（本部 TD の「会場に順位を掲載」と同期） */
export const POOL_STANDINGS_SHOW_RANKS_KEY = 'b-system_pool_standings_show_ranks';

export const POOL_STANDINGS_SHOW_RANKS_EVENT = 'poolStandingsShowRanks';

export function getPoolStandingsShowRanksFromStorage() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(POOL_STANDINGS_SHOW_RANKS_KEY) === '1';
}

export function setPoolStandingsShowRanksInStorage(visible) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(POOL_STANDINGS_SHOW_RANKS_KEY, visible ? '1' : '0');
  window.dispatchEvent(new Event(POOL_STANDINGS_SHOW_RANKS_EVENT));
}
