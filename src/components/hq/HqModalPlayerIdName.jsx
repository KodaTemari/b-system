/** 本部モーダル: 選手ID を小さく角丸で表示し、名前は通常サイズ */
export function HqModalPlayerIdName({ playerId, playerNameMap }) {
  const id = String(playerId ?? '').trim();
  if (!id) {
    return '—';
  }
  const map = playerNameMap instanceof Map ? playerNameMap : new Map();
  const nm = map.get(id);
  const namePart = nm ? String(nm) : '（未登録のID）';
  return (
    <span className="hqProgressPlayerIdName">
      <span className="hqProgressPlayerIdPill">{id}</span>
      <span className="hqProgressPlayerIdNameText">{namePart}</span>
    </span>
  );
}
