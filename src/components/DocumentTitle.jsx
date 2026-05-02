import { useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

const DEFAULT_TITLE = 'b-system';

/**
 * パスとクエリからブラウザタブの document.title を決定する
 */
function buildDocumentTitle(pathname, searchParams) {
  const pMode = searchParams.get('p');
  const scoreboardMode = pMode === 'ctrl' ? 'ctrl' : 'view';

  if (pathname === '/scoreboard') {
    return `スコアボード-${scoreboardMode}`;
  }

  const scoreboardEvent = pathname.match(/^\/event\/[^/]+\/court\/([^/]+)\/scoreboard$/);
  if (scoreboardEvent) {
    const court = scoreboardEvent[1];
    if (searchParams.get('embedWall') === '1') {
      return `コート${court}-スコアボード-wall`;
    }
    return `コート${court}-スコアボード-${scoreboardMode}`;
  }

  if (/^\/event\/[^/]+\/hq\/progress$/.test(pathname)) {
    return '本部-試合進行-operator';
  }
  if (/^\/event\/[^/]+\/hq\/progress-db$/.test(pathname)) {
    return '本部-試合進行DB-operator';
  }
  if (/^\/event\/[^/]+\/hq\/players$/.test(pathname)) {
    return '本部-選手一覧-operator';
  }

  if (/^\/event\/[^/]+\/players$/.test(pathname)) {
    return '選手一覧';
  }

  if (/^\/event\/[^/]+\/results\/pool$/.test(pathname)) {
    return 'プール結果';
  }

  if (/^\/event\/[^/]+\/pool\/standings$/.test(pathname)) {
    return 'プール順位表';
  }

  const poolStandings = pathname.match(/^\/event\/[^/]+\/pool\/([^/]+)\/standings$/);
  if (poolStandings) {
    return `プール順位表-${poolStandings[1]}`;
  }

  if (pathname === '/tournament' || /^\/event\/[^/]+\/tournament$/.test(pathname)) {
    return 'トーナメント';
  }

  if (/^\/event\/[^/]+\/schedule$/.test(pathname)) {
    return 'スケジュール';
  }

  if (/^\/event\/[^/]+\/scoreboards-wall$/.test(pathname)) {
    return 'スコアボードウォール';
  }

  return DEFAULT_TITLE;
}

/**
 * ルート変更時に document.title を更新する（BrowserRouter 直下で使用）
 */
export const DocumentTitle = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const spKey = searchParams.toString();

  const title = useMemo(
    () => buildDocumentTitle(pathname, searchParams),
    [pathname, spKey],
  );

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
};
