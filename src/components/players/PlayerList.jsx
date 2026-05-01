import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  buildPoolHueMap,
  collectPoolIds,
  parsePoolMeta,
  poolStandingsHeaderHsl,
  SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
} from '../../utils/schedulePoolIds';
import './PlayerList.css';

const editableKeys = ['name', 'poolId', 'poolOrder', 'thinkingTime', 'categoryLabel', 'note'];
const columnClassByKey = {
  name: 'isColName',
  poolId: 'isColPool',
  poolOrder: 'isColOrder',
  thinkingTime: 'isColThinkingTime',
  categoryLabel: 'isColCategory',
  note: 'isColNote',
};

const normalizePlayers = (rawPlayers) => {
  if (!Array.isArray(rawPlayers)) {
    return [];
  }
  return rawPlayers.map((item, index) => ({
    ...item,
    id: String(item?.id ?? `${index + 1}`),
    name: String(item?.name ?? ''),
    poolId: String(item?.poolId ?? ''),
    poolOrder: item?.poolOrder ?? '',
    thinkingTime: String(item?.thinkingTime ?? ''),
    categoryLabel: String(item?.categoryLabel ?? ''),
    note: String(item?.note ?? ''),
  }));
};

const PlayerList = ({ embedInHq = false }) => {
  const { eventId } = useParams();
  const location = useLocation();
  const [players, setPlayers] = useState([]);
  const [classCode, setClassCode] = useState('FRD');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isHqPath = useMemo(() => location.pathname.includes('/hq/'), [location.pathname]);
  const isTdMode = isHqPath;
  const poolHueMap = useMemo(() => {
    const ids = collectPoolIds(players, [], []);
    return buildPoolHueMap(ids);
  }, [players]);

  useEffect(() => {
    const loadPlayers = async () => {
      if (!eventId) {
        setError('eventId が指定されていません。');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await fetch(`/api/data/${eventId}/players`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || '選手データの読み込みに失敗しました。');
        }
        setPlayers(normalizePlayers(data.players));
        setClassCode(String(data.classCode ?? 'FRD'));
        setError('');
      } catch (loadError) {
        setError(loadError.message || '選手データの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    loadPlayers();
  }, [eventId]);

  const handleFieldChange = (index, key, value) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const handleSave = async () => {
    if (!eventId || !isTdMode) {
      return;
    }
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await fetch(`/api/hq/${eventId}/players`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '保存に失敗しました。');
      }
      setMessage('選手データを保存しました。');
    } catch (saveError) {
      setError(saveError.message || '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="playerListPage">
        <section className="playerListSection">
          <p>読み込み中...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="playerListPage">
      <section className="playerListSection">
        {!embedInHq ? (
          <header className="playerListHeader">
            <h1 className="playerListTitle">
              選手一覧
              <span className="playerListTitleMeta">{isTdMode ? '本部 [HQ] 編集モード' : '会場 [解説席] 閲覧モード'}</span>
            </h1>
            <p className="playerListMeta">
              event: {eventId} / class: {classCode} / 人数: {players.length}名
            </p>
          </header>
        ) : null}

        {error ? <p className="playerListError">{error}</p> : null}

        <div className="playerListTableWrap">
          <table className="playerListTable">
            <colgroup>
              <col className="isColId" />
              <col className="isColName" />
              <col className="isColPool" />
              <col className="isColOrder" />
              <col className="isColThinkingTime" />
              <col className="isColCategory" />
              <col className="isColNote" />
            </colgroup>
            <thead>
              <tr>
                <th className="isColId">ID</th>
                <th className="isColName">氏名</th>
                <th className="isColPool">プール</th>
                <th className="isColOrder">順番</th>
                <th className="isColThinkingTime">持ち時間</th>
                <th className="isColCategory">カテゴリ</th>
                <th className="isColNote">メモ</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => {
                const groupId = parsePoolMeta(player.poolId).groupId;
                const hue = groupId ? poolHueMap.get(groupId) : null;
                const rowStyle = Number.isFinite(hue)
                  ? {
                      '--playerListPoolRowBg': poolStandingsHeaderHsl(
                        hue,
                        SCHEDULE_POOL_IN_PROGRESS_CELL_ALPHA,
                      ),
                    }
                  : undefined;
                return (
                <tr
                  key={player.id}
                  className={groupId ? 'isPoolTintedRow' : ''}
                  style={rowStyle}
                >
                  <td className="isNarrow">{player.id}</td>
                  {editableKeys.map((key) => (
                    <td key={`${player.id}-${key}`} className={columnClassByKey[key] ?? ''}>
                      {isTdMode ? (
                        <input
                          className="playerListInput"
                          value={String(player[key] ?? '')}
                          onChange={(event) => handleFieldChange(index, key, event.target.value)}
                        />
                      ) : (
                        <span>{String(player[key] ?? '-')}</span>
                      )}
                    </td>
                  ))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isTdMode ? (
          <div className="playerListActions">
            <button
              type="button"
              className="playerListSaveButton"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '選手データの保存'}
            </button>
            {message ? <p className="playerListMessage">{message}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default PlayerList;
