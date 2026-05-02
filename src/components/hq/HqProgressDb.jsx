import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../schedule/Schedule.css';
import './HqProgress.css';
import './HqProgressDb.css';

const MATCH_STATUSES = [
  'scheduled',
  'announced',
  'in_progress',
  'court_approved',
  'hq_approved',
  'reflected',
];

const emptyMatchDraft = () => ({
  courtId: '',
  redPlayerId: '',
  bluePlayerId: '',
  scheduledAt: '',
  status: 'scheduled',
  warmupStartedAt: '',
  warmupFinishedAt: '',
  startedAt: '',
  finishedAt: '',
  courtApprovedAt: '',
  courtRefereeName: '',
  hqApprovedAt: '',
  hqApproverName: '',
  reflectedAt: '',
});

const matchRowToDraft = (row) => ({
  courtId: row.courtId ?? '',
  redPlayerId: row.redPlayerId ?? '',
  bluePlayerId: row.bluePlayerId ?? '',
  scheduledAt: row.scheduledAt ?? '',
  status: row.status ?? 'scheduled',
  warmupStartedAt: row.warmupStartedAt ?? '',
  warmupFinishedAt: row.warmupFinishedAt ?? '',
  startedAt: row.startedAt ?? '',
  finishedAt: row.finishedAt ?? '',
  courtApprovedAt: row.courtApprovedAt ?? '',
  courtRefereeName: row.courtRefereeName ?? '',
  hqApprovedAt: row.hqApprovedAt ?? '',
  hqApproverName: row.hqApproverName ?? '',
  reflectedAt: row.reflectedAt ?? '',
});

/**
 * 進行 SQLite（hq-progress.sqlite3）の参照・列単位の救済更新
 */
const HqProgressDb = () => {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const querySuffix = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dbPath, setDbPath] = useState('');
  const [matches, setMatches] = useState([]);
  const [results, setResults] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [activeLocks, setActiveLocks] = useState([]);
  const [tab, setTab] = useState('matches');

  const [editingMatchId, setEditingMatchId] = useState('');
  const [matchDraft, setMatchDraft] = useState(emptyMatchDraft);
  const [matchSaving, setMatchSaving] = useState(false);

  const [editingResultKey, setEditingResultKey] = useState('');
  const [resultDraft, setResultDraft] = useState({
    redScore: '',
    blueScore: '',
    winnerPlayerId: '',
    isCorrection: false,
    correctionReason: '',
  });
  const [resultSaving, setResultSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!eventId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/progress/${encodeURIComponent(eventId)}/db-overview`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `読み込み失敗 (${res.status})`);
      }
      setDbPath(data.dbPath || '');
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      setResults(Array.isArray(data.results) ? data.results : []);
      setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
      setActiveLocks(Array.isArray(data.activeLocks) ? data.activeLocks : []);
    } catch (e) {
      setError(e.message || '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const progressBackHref = `/event/${eventId}/hq/progress${querySuffix}`;

  const beginEditMatch = (row) => {
    setEditingResultKey('');
    setEditingMatchId(row.matchId);
    setMatchDraft(matchRowToDraft(row));
  };

  const cancelEditMatch = useCallback(() => {
    setEditingMatchId('');
    setMatchDraft(emptyMatchDraft());
  }, []);

  const cancelEditResult = useCallback(() => {
    setEditingResultKey('');
    setResultDraft({
      redScore: '',
      blueScore: '',
      winnerPlayerId: '',
      isCorrection: false,
      correctionReason: '',
    });
  }, []);

  useEffect(() => {
    if (!editingMatchId && !editingResultKey) {
      return undefined;
    }
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (editingMatchId && matchSaving) {
        return;
      }
      if (editingResultKey && resultSaving) {
        return;
      }
      e.preventDefault();
      if (editingMatchId) {
        cancelEditMatch();
      } else {
        cancelEditResult();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    editingMatchId,
    editingResultKey,
    matchSaving,
    resultSaving,
    cancelEditMatch,
    cancelEditResult,
  ]);

  useEffect(() => {
    if (!editingMatchId && !editingResultKey) {
      return undefined;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [editingMatchId, editingResultKey]);

  const saveMatch = async () => {
    if (!eventId || !editingMatchId) {
      return;
    }
    setMatchSaving(true);
    setError('');
    try {
      const body = {
        courtId: matchDraft.courtId,
        redPlayerId: matchDraft.redPlayerId,
        bluePlayerId: matchDraft.bluePlayerId,
        scheduledAt: matchDraft.scheduledAt || null,
        status: matchDraft.status,
        warmupStartedAt: matchDraft.warmupStartedAt || null,
        warmupFinishedAt: matchDraft.warmupFinishedAt || null,
        startedAt: matchDraft.startedAt || null,
        finishedAt: matchDraft.finishedAt || null,
        courtApprovedAt: matchDraft.courtApprovedAt || null,
        courtRefereeName: matchDraft.courtRefereeName || null,
        hqApprovedAt: matchDraft.hqApprovedAt || null,
        hqApproverName: matchDraft.hqApproverName || null,
        reflectedAt: matchDraft.reflectedAt || null,
      };
      const res = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(editingMatchId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `保存失敗 (${res.status})`);
      }
      cancelEditMatch();
      await loadOverview();
    } catch (e) {
      setError(e.message || '保存に失敗しました');
    } finally {
      setMatchSaving(false);
    }
  };

  const beginEditResult = (row) => {
    setEditingMatchId('');
    setEditingResultKey(row.matchId);
    setResultDraft({
      redScore: row.redScore != null ? String(row.redScore) : '',
      blueScore: row.blueScore != null ? String(row.blueScore) : '',
      winnerPlayerId: row.winnerPlayerId ?? '',
      isCorrection: Boolean(row.isCorrection),
      correctionReason: row.correctionReason ?? '',
    });
  };

  const saveResult = async () => {
    if (!eventId || !editingResultKey) {
      return;
    }
    setResultSaving(true);
    setError('');
    try {
      const body = {
        redScore: resultDraft.redScore === '' ? null : Number(resultDraft.redScore),
        blueScore: resultDraft.blueScore === '' ? null : Number(resultDraft.blueScore),
        winnerPlayerId: resultDraft.winnerPlayerId || null,
        isCorrection: resultDraft.isCorrection,
        correctionReason: resultDraft.correctionReason || null,
      };
      const res = await fetch(
        `/api/progress/${encodeURIComponent(eventId)}/results/${encodeURIComponent(editingResultKey)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `保存失敗 (${res.status})`);
      }
      cancelEditResult();
      await loadOverview();
    } catch (e) {
      setError(e.message || '保存に失敗しました');
    } finally {
      setResultSaving(false);
    }
  };

  const tabs = useMemo(
    () => [
      { id: 'matches', label: `試合 (${matches.length})` },
      { id: 'results', label: `結果 (${results.length})` },
      { id: 'approvals', label: `承認ログ (${approvals.length})` },
      { id: 'locks', label: `ロック (${activeLocks.length})` },
    ],
    [matches.length, results.length, approvals.length, activeLocks.length],
  );

  return (
    <main className="hqProgressPage hqProgressDbPage">
      <section className="hqProgressSection">
        <header className="scheduleTitleBar hqProgressTitleBar hqProgressDbHeaderBar">
          <div className="hqProgressDbHeaderLead">
            <Link className="hqProgressActionButton hqProgressDbBackLink" to={progressBackHref}>
              ← 本部進行へ
            </Link>
          </div>
          <div className="hqProgressTitleBarTrail scheduleTitleText">
            <h1 className="scheduleTitle">進行 SQLite</h1>
            <p className="scheduleMeta hqProgressDbSubtitle">
              hq-progress.sqlite3 の内容を確認・救済更新できます（本番は専用 API の利用を推奨）。
            </p>
          </div>
        </header>

        <div className="hqProgressDbToolbar">
          <button type="button" className="hqProgressActionButton" onClick={loadOverview} disabled={loading}>
            {loading ? '読込中…' : '再読込'}
          </button>
          {dbPath ? (
            <code className="hqProgressDbPath" title={dbPath}>
              {dbPath}
            </code>
          ) : null}
        </div>

        {error ? <p className="hqProgressOperationError">{error}</p> : null}

        <div className="hqProgressDbTabs" role="tablist" aria-label="テーブル切替">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`hqProgressViewTab${tab === t.id ? ' isActive' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && matches.length === 0 && results.length === 0 ? (
          <p className="hqProgressDbMuted">読み込み中…</p>
        ) : null}

        {tab === 'matches' ? (
          <div className="hqProgressDbTableWrap">
            <table className="hqProgressDbTable">
              <thead>
                <tr>
                  <th>matchId</th>
                  <th>court</th>
                  <th>RedID</th>
                  <th>BlueID</th>
                  <th>status</th>
                  <th>scheduledAt</th>
                  <th>ver</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.matchId}>
                    <td className="hqProgressDbMono">{m.matchId}</td>
                    <td>{m.courtId}</td>
                    <td className="hqProgressDbMono">{m.redPlayerId}</td>
                    <td className="hqProgressDbMono">{m.bluePlayerId}</td>
                    <td>{m.status}</td>
                    <td className="hqProgressDbMono hqProgressDbCellSoft">{m.scheduledAt || '—'}</td>
                    <td>{m.version}</td>
                    <td>
                      <button
                        type="button"
                        className="hqProgressActionButton hqProgressDbCellButton"
                        onClick={() => beginEditMatch(m)}
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {matches.length === 0 ? <p className="hqProgressDbMuted">試合行がありません。</p> : null}
          </div>
        ) : null}

        {tab === 'results' ? (
          <div className="hqProgressDbTableWrap">
            <table className="hqProgressDbTable">
              <thead>
                <tr>
                  <th>matchId</th>
                  <th>赤</th>
                  <th>青</th>
                  <th>勝者</th>
                  <th>修正</th>
                  <th>更新</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.matchId}>
                    <td className="hqProgressDbMono">{r.matchId}</td>
                    <td>{r.redScore ?? '—'}</td>
                    <td>{r.blueScore ?? '—'}</td>
                    <td className="hqProgressDbMono">{r.winnerPlayerId || '—'}</td>
                    <td>{r.isCorrection ? 'yes' : 'no'}</td>
                    <td className="hqProgressDbMono hqProgressDbCellSoft">{r.updatedAt || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="hqProgressActionButton hqProgressDbCellButton"
                        onClick={() => beginEditResult(r)}
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 ? <p className="hqProgressDbMuted">結果行がありません。</p> : null}
          </div>
        ) : null}

        {tab === 'approvals' ? (
          <div className="hqProgressDbTableWrap">
            <table className="hqProgressDbTable">
              <thead>
                <tr>
                  <th>id</th>
                  <th>matchId</th>
                  <th>stage</th>
                  <th>approver</th>
                  <th>approvedAt</th>
                  <th>meta</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td className="hqProgressDbMono">{a.matchId}</td>
                    <td>{a.stage}</td>
                    <td>{a.approverName}</td>
                    <td className="hqProgressDbMono hqProgressDbCellSoft">{a.approvedAt}</td>
                    <td className="hqProgressDbMeta">{a.metaJson || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {approvals.length === 0 ? <p className="hqProgressDbMuted">承認ログがありません。</p> : null}
            <p className="hqProgressDbHint">承認ログは参照のみです。</p>
          </div>
        ) : null}

        {tab === 'locks' ? (
          <div className="hqProgressDbTableWrap">
            <table className="hqProgressDbTable">
              <thead>
                <tr>
                  <th>lockType</th>
                  <th>lockKey</th>
                  <th>matchId</th>
                  <th>createdAt</th>
                </tr>
              </thead>
              <tbody>
                {activeLocks.map((row) => (
                  <tr key={`${row.lockType}:${row.lockKey}`}>
                    <td>{row.lockType}</td>
                    <td className="hqProgressDbMono">{row.lockKey}</td>
                    <td className="hqProgressDbMono">{row.matchId}</td>
                    <td className="hqProgressDbMono hqProgressDbCellSoft">{row.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeLocks.length === 0 ? <p className="hqProgressDbMuted">アクティブロックはありません。</p> : null}
            <p className="hqProgressDbHint">ロックは参照のみです。</p>
          </div>
        ) : null}
      </section>

      {editingMatchId ? (
        <div
          className="hqProgressDbModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hq-db-match-edit-title"
          onClick={() => {
            if (!matchSaving) cancelEditMatch();
          }}
        >
          <div
            className="hqProgressDbModal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hqProgressDbEditPanel hqProgressDbEditPanelModal">
              <h2 id="hq-db-match-edit-title" className="hqProgressDbEditTitle">
                試合を更新: {editingMatchId}
              </h2>
              <div className="hqProgressDbFormGrid">
                <label className="hqProgressDbField">
                  <span>courtId</span>
                  <input
                    value={matchDraft.courtId}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, courtId: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>redPlayerId</span>
                  <input
                    value={matchDraft.redPlayerId}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, redPlayerId: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>bluePlayerId</span>
                  <input
                    value={matchDraft.bluePlayerId}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, bluePlayerId: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>scheduledAt</span>
                  <input
                    value={matchDraft.scheduledAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, scheduledAt: e.target.value }))}
                    placeholder="ISO8601 または空"
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>status</span>
                  <select
                    value={matchDraft.status}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, status: e.target.value }))}
                  >
                    {MATCH_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hqProgressDbField">
                  <span>warmupStartedAt</span>
                  <input
                    value={matchDraft.warmupStartedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, warmupStartedAt: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>warmupFinishedAt</span>
                  <input
                    value={matchDraft.warmupFinishedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, warmupFinishedAt: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>startedAt</span>
                  <input
                    value={matchDraft.startedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, startedAt: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>finishedAt</span>
                  <input
                    value={matchDraft.finishedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, finishedAt: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>courtApprovedAt</span>
                  <input
                    value={matchDraft.courtApprovedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, courtApprovedAt: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>courtRefereeName</span>
                  <input
                    value={matchDraft.courtRefereeName}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, courtRefereeName: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>hqApprovedAt</span>
                  <input
                    value={matchDraft.hqApprovedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, hqApprovedAt: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>hqApproverName</span>
                  <input
                    value={matchDraft.hqApproverName}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, hqApproverName: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>reflectedAt</span>
                  <input
                    value={matchDraft.reflectedAt}
                    onChange={(e) => setMatchDraft((d) => ({ ...d, reflectedAt: e.target.value }))}
                  />
                </label>
              </div>
              <div className="hqProgressDbEditActions">
                <button
                  type="button"
                  className="hqProgressActionButton"
                  onClick={saveMatch}
                  disabled={matchSaving}
                >
                  {matchSaving ? '保存中…' : '保存'}
                </button>
                <button
                  type="button"
                  className="hqProgressActionButton"
                  onClick={cancelEditMatch}
                  disabled={matchSaving}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingResultKey ? (
        <div
          className="hqProgressDbModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hq-db-result-edit-title"
          onClick={() => {
            if (!resultSaving) cancelEditResult();
          }}
        >
          <div
            className="hqProgressDbModal hqProgressDbModalNarrow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hqProgressDbEditPanel hqProgressDbEditPanelModal">
              <h2 id="hq-db-result-edit-title" className="hqProgressDbEditTitle">
                結果を更新: {editingResultKey}
              </h2>
              <div className="hqProgressDbFormGrid hqProgressDbFormGridNarrow">
                <label className="hqProgressDbField">
                  <span>redScore</span>
                  <input
                    inputMode="numeric"
                    value={resultDraft.redScore}
                    onChange={(e) => setResultDraft((d) => ({ ...d, redScore: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>blueScore</span>
                  <input
                    inputMode="numeric"
                    value={resultDraft.blueScore}
                    onChange={(e) => setResultDraft((d) => ({ ...d, blueScore: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField">
                  <span>winnerPlayerId</span>
                  <input
                    value={resultDraft.winnerPlayerId}
                    onChange={(e) => setResultDraft((d) => ({ ...d, winnerPlayerId: e.target.value }))}
                  />
                </label>
                <label className="hqProgressDbField hqProgressDbFieldCheckbox">
                  <input
                    type="checkbox"
                    checked={resultDraft.isCorrection}
                    onChange={(e) => setResultDraft((d) => ({ ...d, isCorrection: e.target.checked }))}
                  />
                  <span>isCorrection</span>
                </label>
                <label className="hqProgressDbField hqProgressDbFieldSpan2">
                  <span>correctionReason</span>
                  <input
                    value={resultDraft.correctionReason}
                    onChange={(e) => setResultDraft((d) => ({ ...d, correctionReason: e.target.value }))}
                  />
                </label>
              </div>
              <div className="hqProgressDbEditActions">
                <button
                  type="button"
                  className="hqProgressActionButton"
                  onClick={saveResult}
                  disabled={resultSaving}
                >
                  {resultSaving ? '保存中…' : '保存'}
                </button>
                <button
                  type="button"
                  className="hqProgressActionButton"
                  onClick={cancelEditResult}
                  disabled={resultSaving}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default HqProgressDb;
