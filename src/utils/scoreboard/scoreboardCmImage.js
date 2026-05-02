/**
 * init.json の display.scoreboardCmImage から、スコアボード CM 用の画像 URL を決定する。
 * - 未指定: /data/{eventId}/assets/scoreboard-cm.png
 * - 絶対パス（/ で始まる）: そのまま
 * - それ以外: イベント配下の相対パス（例: assets/bg.jpg → /data/{eventId}/assets/bg.jpg）
 */
export function resolveScoreboardCmImageUrl(initData, eventId) {
  const eid = String(eventId ?? '').trim();
  const defaultUrl = eid
    ? `/data/${encodeURIComponent(eid)}/assets/scoreboard-cm.png`
    : '/data/assets/scoreboard-cm.png';
  if (!initData || typeof initData !== 'object') {
    return defaultUrl;
  }
  const raw = initData.display?.scoreboardCmImage;
  if (raw == null || typeof raw !== 'string') {
    return defaultUrl;
  }
  const t = raw.trim();
  if (!t) {
    return defaultUrl;
  }
  if (t.startsWith('/')) {
    return t;
  }
  if (!eid) {
    return `/${t.replace(/^\/+/, '')}`;
  }
  return `/data/${encodeURIComponent(eid)}/${t.replace(/^\/+/, '')}`;
}
