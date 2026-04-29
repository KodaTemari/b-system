import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import './Tournament.css';

const CARD_WIDTH = 220;
const CARD_HEIGHT = 70;
const SINGLE_CARD_HEIGHT = 46;
const ROUND_GAP = 90;
const ROUND_TITLE_HEIGHT = 34;
const BASE_MATCH_GAP = 18;
const BOARD_PADDING = 16;
const PLAYER_TEXT_TOP_OFFSET = 19;
const PLAYER_TEXT_BOTTOM_OFFSET = 19;

const getBracketSize = (playerCount) => {
  if (playerCount <= 1) {
    return 2;
  }
  return 2 ** Math.ceil(Math.log2(playerCount));
};

const getRoundLabel = (roundIndex, totalRounds) => {
  if (roundIndex === totalRounds - 1) {
    return '決勝';
  }
  if (roundIndex === totalRounds - 2) {
    return '準決勝';
  }
  if (roundIndex === totalRounds - 3) {
    return '準々決勝';
  }
  return `${roundIndex + 1}回戦`;
};

const getSeedOrder = (size) => {
  let order = [1, 2];
  while (order.length < size) {
    const nextTotal = order.length * 2 + 1;
    const nextOrder = [];
    for (const seed of order) {
      nextOrder.push(seed);
      nextOrder.push(nextTotal - seed);
    }
    order = nextOrder;
  }
  return order.slice(0, size);
};

const normalizePlayers = (rawPlayers) => {
  if (!Array.isArray(rawPlayers)) {
    return [];
  }
  return rawPlayers
    .map((player, index) => {
      const parsedSeed = Number(player.seed);
      return {
        id: String(player.id ?? `player-${index + 1}`),
        name: String(player.name ?? '').trim(),
        seed: Number.isInteger(parsedSeed) && parsedSeed > 0 ? parsedSeed : null,
      };
    })
    .filter((player) => player.name.length > 0);
};

const buildBracketPlayers = (players) => {
  const playerCount = players.length;
  if (playerCount === 0) {
    return [];
  }
  const bracketSize = getBracketSize(playerCount);
  const seedOrder = getSeedOrder(bracketSize);
  const playersBySeed = new Map();
  const unseededPlayers = [];

  for (const player of players) {
    if (player.seed && player.seed <= bracketSize && !playersBySeed.has(player.seed)) {
      playersBySeed.set(player.seed, player);
    } else {
      unseededPlayers.push(player);
    }
  }

  let unseededIndex = 0;
  return seedOrder.map((idealSeed) => {
    if (playersBySeed.has(idealSeed)) {
      return playersBySeed.get(idealSeed);
    }
    if (idealSeed <= playerCount && unseededIndex < unseededPlayers.length) {
      const player = unseededPlayers[unseededIndex];
      unseededIndex += 1;
      return player;
    }
    return { id: `bye-${idealSeed}`, name: 'BYE', seed: null };
  });
};

const generateRounds = (players) => {
  let currentPlayers = players;
  const rounds = [];
  let roundNumber = 1;

  while (currentPlayers.length > 1) {
    const matches = [];
    const nextPlayers = [];

    for (let i = 0; i < currentPlayers.length; i += 2) {
      const playerA = currentPlayers[i];
      const playerB = currentPlayers[i + 1];
      const hasBye = playerA.name === 'BYE' || playerB.name === 'BYE';
      const autoWinner = playerA.name === 'BYE' ? playerB : playerB.name === 'BYE' ? playerA : null;

      matches.push({
        id: `r${roundNumber}-m${i / 2 + 1}`,
        playerA,
        playerB,
        hasBye,
      });

      nextPlayers.push(autoWinner ?? { id: `winner-r${roundNumber}-m${i / 2 + 1}`, name: `勝者 R${roundNumber}-M${i / 2 + 1}`, seed: null });
    }

    rounds.push(matches);
    currentPlayers = nextPlayers;
    roundNumber += 1;
  }

  return rounds;
};

const buildRoundLayout = (rounds) => {
  if (rounds.length === 0) {
    return { boardWidth: 0, boardHeight: 0, roundLayouts: [] };
  }

  const firstRoundMatchCount = rounds[0].length;
  const baseBlockHeight = CARD_HEIGHT + BASE_MATCH_GAP;
  const roundLayouts = rounds.map((matches, roundIndex) => {
    const step = 2 ** roundIndex;
    const x = BOARD_PADDING + roundIndex * (CARD_WIDTH + ROUND_GAP);
    const startY = BOARD_PADDING + ROUND_TITLE_HEIGHT + ((step - 1) * baseBlockHeight) / 2;
    const matchLayouts = matches.map((match, matchIndex) => {
      const y = startY + matchIndex * step * baseBlockHeight;
      return { ...match, x, y };
    });
    return {
      roundIndex,
      x,
      titleY: BOARD_PADDING + 20,
      matches: matchLayouts,
    };
  });

  const boardWidth = BOARD_PADDING * 2 + rounds.length * CARD_WIDTH + (rounds.length - 1) * ROUND_GAP;
  const boardHeight = BOARD_PADDING * 2 + ROUND_TITLE_HEIGHT + firstRoundMatchCount * baseBlockHeight - BASE_MATCH_GAP;

  return { boardWidth, boardHeight, roundLayouts };
};

const buildConnectionPaths = (roundLayouts) => {
  const paths = [];
  for (let roundIndex = 0; roundIndex < roundLayouts.length - 1; roundIndex += 1) {
    const currentRound = roundLayouts[roundIndex];
    const nextRound = roundLayouts[roundIndex + 1];
    for (let matchIndex = 0; matchIndex < currentRound.matches.length; matchIndex += 1) {
      const currentMatch = currentRound.matches[matchIndex];
      const nextMatch = nextRound.matches[Math.floor(matchIndex / 2)];
      const startX = currentMatch.x + CARD_WIDTH;
      const startY = currentMatch.y + CARD_HEIGHT / 2;
      const turnX = startX + ROUND_GAP / 2;
      const endX = nextMatch.x;
      const endY = nextMatch.y + CARD_HEIGHT / 2;
      paths.push(`M ${startX} ${startY} H ${turnX} V ${endY} H ${endX}`);
    }
  }
  return paths;
};

const formatPlayerLabel = (player) => {
  if (player.name.startsWith('勝者 R')) {
    return '';
  }
  return player.name;
};

const isResolvedPlayer = (player) => {
  if (!player || !player.name) {
    return false;
  }
  if (player.name === 'BYE') {
    return false;
  }
  return !player.name.startsWith('勝者 R');
};

const hasPlayableMatch = (match) => {
  return isResolvedPlayer(match.playerA) && isResolvedPlayer(match.playerB);
};

const getMatchCardMetrics = (match) => {
  const isPlayerABye = match.playerA.name === 'BYE';
  const isPlayerBBye = match.playerB.name === 'BYE';
  const isSinglePlayerMatch = isPlayerABye !== isPlayerBBye;
  const visiblePlayer = isPlayerABye ? match.playerB : match.playerA;
  const rectHeight = isSinglePlayerMatch ? SINGLE_CARD_HEIGHT : CARD_HEIGHT;
  const rectY = match.y + (CARD_HEIGHT - rectHeight) / 2;
  return {
    isSinglePlayerMatch,
    visiblePlayer,
    rectHeight,
    rectY,
  };
};

const Tournament = () => {
  const { id: eventId } = useParams();
  const [searchParams] = useSearchParams();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPlayers = async () => {
      if (!eventId) {
        setPlayers([]);
        setError('eventId が指定されていません。');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/data/${eventId}/classes/FRD/player.json`);
        if (!response.ok) {
          throw new Error('player.json の読み込みに失敗しました。');
        }
        const rawPlayers = await response.json();
        setPlayers(normalizePlayers(rawPlayers));
        setError('');
      } catch (err) {
        setPlayers([]);
        setError(err.message || 'player.json の読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [eventId]);

  const displayPlayers = useMemo(() => buildBracketPlayers(players), [players]);
  const rounds = useMemo(() => generateRounds(displayPlayers), [displayPlayers]);
  const totalRounds = rounds.length;
  const requestedRound = Number(searchParams.get('round') || '1');
  const activeRound =
    Number.isInteger(requestedRound) && requestedRound >= 1 && requestedRound <= totalRounds
      ? requestedRound
      : 1;
  const { boardWidth, boardHeight, roundLayouts } = useMemo(() => buildRoundLayout(rounds), [rounds]);
  const connectionPaths = useMemo(() => buildConnectionPaths(roundLayouts), [roundLayouts]);
  const tournamentPageStyle = eventId
    ? { '--tournamentBgImage': `url(/data/${encodeURIComponent(eventId)}/assets/bg.jpg)` }
    : undefined;

  if (loading) {
    return (
      <main id="tournament" style={tournamentPageStyle} data-round="0">
        <section className="tournamentBracketSection">
          <p>トーナメントデータを読み込み中...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main id="tournament" style={tournamentPageStyle} data-round="0">
        <section className="tournamentBracketSection">
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (players.length === 0) {
    return (
      <main id="tournament" style={tournamentPageStyle} data-round="0">
        <section className="tournamentBracketSection">
          <h1 className="tournamentTitle">トーナメント表</h1>
          <p>プレイヤーが登録されていないため、トーナメントを生成できません。</p>
        </section>
      </main>
    );
  }

  return (
    <main id="tournament" style={tournamentPageStyle} data-round={String(activeRound)}>
      <section className="tournamentBracketSection">
        <h1 className="tournamentTitle">トーナメント表</h1>
        <div className="bracketSummary">
          <p>イベントID: {eventId}</p>
          <p>登録人数: {players.length}名</p>
          <p>トーナメント枠: {displayPlayers.length}名</p>
          <p>ラウンド数: {totalRounds}回</p>
          <p>進行ラウンド: {activeRound}回戦</p>
        </div>

        <div className="bracketCanvasWrap" aria-label="トーナメント表">
          <svg
            className="bracketCanvas"
            role="img"
            viewBox={`0 0 ${boardWidth} ${boardHeight}`}
            aria-label="トーナメント表"
          >
            {connectionPaths.map((d, index) => (
              <path key={`path-${index}`} className="bracketPath" d={d} />
            ))}

            {roundLayouts.map((roundLayout) => (
              <g
                key={`round-${roundLayout.roundIndex}`}
                className={`roundGroup ${activeRound === roundLayout.roundIndex + 1 ? 'isActiveRound' : ''}`}
                data-round={String(roundLayout.roundIndex + 1)}
              >
                <text className="roundTitleText" x={roundLayout.x} y={roundLayout.titleY}>
                  {getRoundLabel(roundLayout.roundIndex, totalRounds)}
                </text>

                {roundLayout.matches.map((match) => (
                  <g
                    key={match.id}
                    className={activeRound === roundLayout.roundIndex + 1 && hasPlayableMatch(match) ? 'isActiveMatch' : ''}
                  >
                    {(() => {
                      const {
                        isSinglePlayerMatch,
                        visiblePlayer,
                        rectHeight,
                        rectY,
                      } = getMatchCardMetrics(match);
                      return (
                        <>
                          <rect
                            className={`matchRect ${match.hasBye ? 'isByeMatch' : ''}`}
                            x={match.x}
                            y={rectY}
                            width={CARD_WIDTH}
                            height={rectHeight}
                            rx="8"
                            ry="8"
                          />
                          {!isSinglePlayerMatch && (
                            <line
                              className="matchDivider"
                              x1={match.x}
                              y1={rectY + rectHeight / 2}
                              x2={match.x + CARD_WIDTH}
                              y2={rectY + rectHeight / 2}
                            />
                          )}
                          {!isSinglePlayerMatch && (
                            <text className="playerText" x={match.x + 10} y={rectY + PLAYER_TEXT_TOP_OFFSET}>
                              {formatPlayerLabel(match.playerA)}
                            </text>
                          )}
                          {!isSinglePlayerMatch && (
                            <text className="playerText" x={match.x + 10} y={rectY + rectHeight - PLAYER_TEXT_BOTTOM_OFFSET}>
                              {formatPlayerLabel(match.playerB)}
                            </text>
                          )}
                          {isSinglePlayerMatch && (
                            <text className="playerText" x={match.x + 10} y={rectY + rectHeight / 2}>
                              {formatPlayerLabel(visiblePlayer)}
                            </text>
                          )}
                        </>
                      );
                    })()}
                  </g>
                ))}
              </g>
            ))}
          </svg>
        </div>
      </section>
    </main>
  );
};

export default Tournament;
