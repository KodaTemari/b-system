/**
 * スケジュール掲示・本部進行画面で共通利用する表示用ユーティリティ
 */

export const toDateTimeLabel = (isoText) => {
  if (!isoText) {
    return '';
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const toTimeSlotKey = (isoText) => {
  if (!isoText) {
    return '';
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

export const toShortMatchId = (matchId) => {
  const raw = String(matchId ?? '').trim();
  if (!raw) {
    return '-';
  }
  const match = raw.match(/(R\d+-(?:M)?\d+)$/i);
  if (match) {
    return match[1].toUpperCase().replace('-M', '-');
  }
  return raw;
};

export const toEventDateLabel = (eventDate, eventDayLabel) => {
  if (!eventDate) {
    return '';
  }
  const date = new Date(`${eventDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayText = String(eventDayLabel ?? '').trim();
  if (dayText) {
    return `${y}年${m}月${d}日（${dayText}）`;
  }
  return `${y}年${m}月${d}日`;
};

export const renderNameWithLineBreaks = (name) => {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return 'TBD';
  }
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 ? <br /> : null}
    </span>
  ));
};

export const isWinnerPlaceholder = (name) => {
  return /^R\d+-\d+\s*勝者$/.test(String(name ?? '').trim());
};

export const normalizePlayers = (players) => {
  if (!Array.isArray(players)) {
    return [];
  }
  return players
    .map((player) => ({
      id: String(player.id ?? ''),
      name: String(player.name ?? '').trim(),
    }))
    .filter((player) => player.id && player.name);
};
