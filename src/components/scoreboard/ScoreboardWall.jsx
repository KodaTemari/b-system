import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import './ScoreboardWall.css';

const DEFAULT_COURTS = ['1', '2', '3', '4', '5', '6', '7'];

/**
 * テスト確認用: 同一大会の複数コートのスコアボードを iframe で並べて表示する。
 */
const ScoreboardWall = () => {
  const { eventId } = useParams();
  const [courts, setCourts] = useState(DEFAULT_COURTS);

  useEffect(() => {
    if (!eventId) {
      setCourts(DEFAULT_COURTS);
      return undefined;
    }

    let cancelled = false;
    const loadSchedule = async () => {
      try {
        const response = await fetch(`/data/${encodeURIComponent(eventId)}/schedule.json`);
        if (!response.ok) {
          throw new Error('schedule.json が読み込めませんでした。');
        }
        const json = await response.json();
        const raw = Array.isArray(json?.courts) ? json.courts : [];
        const normalized = raw.map((court) => String(court ?? '').trim()).filter(Boolean);
        if (cancelled) {
          return;
        }
        if (normalized.length >= 7) {
          setCourts(normalized.slice(0, 7));
        } else if (normalized.length > 0) {
          const padded = [...normalized];
          for (let i = padded.length; i < 7; i += 1) {
            padded.push(DEFAULT_COURTS[i]);
          }
          setCourts(padded.slice(0, 7));
        } else {
          setCourts(DEFAULT_COURTS);
        }
      } catch {
        if (!cancelled) {
          setCourts(DEFAULT_COURTS);
        }
      }
    };

    loadSchedule();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const iframeSrcList = useMemo(() => {
    if (!eventId) {
      return [];
    }
    return courts.map(
      (court) =>
        `/event/${encodeURIComponent(eventId)}/court/${encodeURIComponent(court)}/scoreboard?embedWall=1`,
    );
  }, [courts, eventId]);

  if (!eventId) {
    return (
      <main className="scoreboardWallPage">
        <p className="scoreboardWallError">eventId が指定されていません。</p>
      </main>
    );
  }

  const cells = Array.from({ length: 8 }, (_, index) => {
    if (index >= iframeSrcList.length) {
      return { kind: 'empty', key: `empty-${index}` };
    }
    return {
      kind: 'iframe',
      key: `court-${courts[index]}-${index}`,
      src: iframeSrcList[index],
      court: courts[index],
    };
  });

  return (
    <main className="scoreboardWallPage">
      <div className="scoreboardWallGrid" role="region" aria-label="スコアボード同時表示">
        {cells.map((cell) =>
          cell.kind === 'empty' ? (
            <div key={cell.key} className="scoreboardWallCell scoreboardWallCell--empty" aria-hidden />
          ) : (
            <div key={cell.key} className="scoreboardWallCell">
              <p className="scoreboardWallLabel">{`コート ${cell.court}`}</p>
              <div className="scoreboardWallFrameWrap">
                <div className="scoreboardWallFrame">
                  <iframe
                    className="scoreboardWallIframe"
                    title={`コート ${cell.court} のスコアボード`}
                    src={cell.src}
                    scrolling="no"
                  />
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </main>
  );
};

export default ScoreboardWall;
