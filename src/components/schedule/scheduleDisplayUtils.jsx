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

/** 同点TB表示用：0〜9 なら正円、2 桁以上はカプセル枠 */
export const isTieBreakScoreSingleDigit = (score) => {
  const n = Math.floor(Number(score));
  return Number.isFinite(n) && n >= 0 && n <= 9;
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

/** 進行DB上で「その行はもう完了」とみなすステータス（本部承認・反映済み） */
const TERMINAL_PROGRESS_STATUSES = new Set(['hq_approved', 'reflected']);

function rawProgressStatusFromMap(matchProgressById, id) {
  const v = matchProgressById?.get(id);
  if (v == null) {
    return 'scheduled';
  }
  if (typeof v === 'string') {
    return v;
  }
  return String(v.status ?? 'scheduled');
}

/**
 * 本部進行（HqProgress）と同じ表示用ステータス。
 * finishedAt があり announced / in_progress のときは画面上「試合終了」扱い（match_finished）。
 */
export const getScheduleDisplayProgressStatus = (progressInfo) => {
  if (!progressInfo || typeof progressInfo !== 'object') {
    return 'scheduled';
  }
  const rawStatus = String(progressInfo.status ?? 'scheduled');
  const finishedAt = progressInfo.finishedAt;
  if (finishedAt && (rawStatus === 'announced' || rawStatus === 'in_progress')) {
    return 'match_finished';
  }
  return rawStatus;
};

/**
 * スケジュール表の1行の区分（背景色用）。
 * 進行APIの試合ステータスとスロット時刻を組み合わせる。進行未登録の試合は scheduled 相当。
 *
 * @param {string} slot toTimeSlotKey 形式
 * @param {string[]} timeSlots 昇順のスロット一覧
 * @param {object[]} matchesInRow 当該行に試合があるセルの match オブジェクト（空可）
 * @param {Map<string, string|{status?: string}>} matchProgressById matchId → DB生ステータス（または { status }）
 * @returns {'upcoming' | 'current' | 'past'}
 */
export const getScheduleRowPhase = (slot, timeSlots, matchesInRow, matchProgressById) => {
  const slotStart = new Date(slot).getTime();
  if (Number.isNaN(slotStart)) {
    return 'current';
  }
  const idx = timeSlots.indexOf(slot);
  const nextSlot = idx >= 0 && idx < timeSlots.length - 1 ? timeSlots[idx + 1] : null;
  const slotEnd = nextSlot
    ? new Date(nextSlot).getTime() - 1
    : slotStart + 120 * 60 * 1000;

  const now = Date.now();

  if (!Array.isArray(matchesInRow) || matchesInRow.length === 0) {
    if (now < slotStart) {
      return 'upcoming';
    }
    if (now > slotEnd) {
      return 'past';
    }
    return 'current';
  }

  const statuses = matchesInRow.map((m) => {
    const id = String(m?.matchId ?? '').trim();
    return rawProgressStatusFromMap(matchProgressById, id);
  });

  if (statuses.every((s) => TERMINAL_PROGRESS_STATUSES.has(s))) {
    return 'past';
  }

  if (now < slotStart && statuses.every((s) => s === 'scheduled')) {
    return 'upcoming';
  }

  return 'current';
};
