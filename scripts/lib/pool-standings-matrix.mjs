/**
 * PoolStandings.jsx の buildPoolViewData と同一の集計（コート反映なし・エンド数なし）。
 * 印刷 HTML 用。schedule の試合に redScore 等があればマスに反映する。
 */
import { sortPoolRowsByBgpRules } from "../../src/utils/results/bgpPoolRank.js"
import { parsePoolMeta } from "../../src/utils/schedulePoolIds.js"

const toNumberOrNull = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const toMatchScore = (match) => {
  const red =
    toNumberOrNull(match.redScore) ??
    toNumberOrNull(match.redPoints) ??
    toNumberOrNull(match.redTotalScore) ??
    null
  const blue =
    toNumberOrNull(match.blueScore) ??
    toNumberOrNull(match.bluePoints) ??
    toNumberOrNull(match.blueTotalScore) ??
    null
  if (red == null || blue == null) {
    return null
  }
  return { red, blue }
}

const sortRowsByOrder = (rows) => {
  rows.sort((a, b) => {
    const aOrder = Number.isInteger(a.order) ? a.order : Number.MAX_SAFE_INTEGER
    const bOrder = Number.isInteger(b.order) ? b.order : Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }
    return a.id.localeCompare(b.id, "ja")
  })
  return rows
}

const resolveMatchPoolId = (match, playerPoolGroupMap) => {
  const explicitPool = String(match.poolId ?? "").trim().toUpperCase()
  if (explicitPool) {
    return explicitPool
  }
  const redId = String(match.redPlayerId ?? "").trim()
  const blueId = String(match.bluePlayerId ?? "").trim()
  const redPool = playerPoolGroupMap.get(redId) ?? ""
  const bluePool = playerPoolGroupMap.get(blueId) ?? ""
  if (redPool && bluePool && redPool === bluePool) {
    return redPool
  }
  return ""
}

/**
 * @param {string} poolId
 * @param {Array<{ id: string, name: string, poolId?: string, poolOrder?: number }>} players
 * @param {{ pools?: object[], matches?: object[] }} schedule
 * @param {Map<string, string>} playerNameMap
 * @param {Map<string, string>} playerPoolGroupMap
 * @param {Map<string, { redEndsWon: number, blueEndsWon: number }>} endsWonByMatchId
 * @param {Map<string, object>} courtByMatchId 印刷では空でよい
 */
export function buildPoolViewData(
  poolId,
  players,
  schedule,
  playerNameMap,
  playerPoolGroupMap,
  endsWonByMatchId,
  courtByMatchId = new Map(),
) {
  const poolList = Array.isArray(schedule.pools) ? schedule.pools : []
  const matchesList = Array.isArray(schedule.matches) ? schedule.matches : []
  const targetPool = poolList.find((pool) => String(pool.poolId ?? "").toUpperCase() === poolId) ?? null

  const poolMatches = matchesList
    .filter((match) => resolveMatchPoolId(match, playerPoolGroupMap) === poolId)
    .slice()
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())

  const fallbackPlayerIds = (() => {
    const ids = new Set()
    for (const match of poolMatches) {
      const redId = String(match.redPlayerId ?? "").trim()
      const blueId = String(match.bluePlayerId ?? "").trim()
      if (redId) ids.add(redId)
      if (blueId) ids.add(blueId)
    }
    return Array.from(ids)
  })()

  const playerPoolIds = (() => {
    const rows = players
      .map((player) => {
        const parsed = parsePoolMeta(player.poolId)
        const order =
          Number.isInteger(player.poolOrder) && player.poolOrder > 0 ? player.poolOrder : parsed.order
        return {
          id: player.id,
          groupId: parsed.groupId,
          order,
        }
      })
      .filter((row) => row.groupId === poolId)
    return sortRowsByOrder(rows).map((row) => row.id)
  })()

  const teamIds =
    playerPoolIds.length > 0
      ? playerPoolIds
      : targetPool && targetPool.playerIds && targetPool.playerIds.length > 0
        ? targetPool.playerIds
        : fallbackPlayerIds

  const hasTargetPool = Boolean(targetPool) || poolMatches.length > 0 || playerPoolIds.length > 0
  const teamRows = teamIds.map((playerId) => ({
    id: playerId,
    name: playerNameMap.get(playerId) ?? `ID: ${playerId}`,
  }))

  const statsMap = new Map(
    teamRows.map((team) => [
      team.id,
      {
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        endsWon: 0,
      },
    ]),
  )
  const matchesPlayed = new Map(teamRows.map((team) => [team.id, 0]))
  const cellMap = new Map()
  const tieMatches = []
  const endsMap = endsWonByMatchId instanceof Map ? endsWonByMatchId : new Map()

  for (const match of poolMatches) {
    const matchId = String(match.matchId ?? "").trim()
    const court = matchId && courtByMatchId.size ? courtByMatchId.get(matchId) : null

    let redId = String(match.redPlayerId ?? "").trim()
    let blueId = String(match.bluePlayerId ?? "").trim()
    let score = toMatchScore(match)

    if (court && statsMap.has(court.courtRedId) && statsMap.has(court.courtBlueId)) {
      redId = court.courtRedId
      blueId = court.courtBlueId
      score = { red: court.redScore, blue: court.blueScore }
    }

    if (!statsMap.has(redId) || !statsMap.has(blueId)) {
      continue
    }
    if (!score) {
      continue
    }
    matchesPlayed.set(redId, (matchesPlayed.get(redId) ?? 0) + 1)
    matchesPlayed.set(blueId, (matchesPlayed.get(blueId) ?? 0) + 1)
    const endsRec =
      matchId && endsMap.has(matchId) ? endsMap.get(matchId) : { redEndsWon: 0, blueEndsWon: 0 }
    const redStats = statsMap.get(redId)
    const blueStats = statsMap.get(blueId)
    redStats.pointsFor += score.red
    redStats.pointsAgainst += score.blue
    blueStats.pointsFor += score.blue
    blueStats.pointsAgainst += score.red
    redStats.endsWon += endsRec.redEndsWon
    blueStats.endsWon += endsRec.blueEndsWon
    const winnerPlayerId = String(match.winnerPlayerId ?? "").trim()
    const redIsWinner =
      score.red > score.blue ? true : score.red < score.blue ? false : winnerPlayerId ? winnerPlayerId === redId : null
    const blueIsWinner =
      score.blue > score.red ? true : score.blue < score.red ? false : winnerPlayerId ? winnerPlayerId === blueId : null
    if (redIsWinner === true) {
      redStats.wins += 1
    } else if (blueIsWinner === true) {
      blueStats.wins += 1
    }
    cellMap.set(`${redId}:${blueId}`, {
      myScore: score.red,
      oppScore: score.blue,
      isWinner: redIsWinner,
    })
    cellMap.set(`${blueId}:${redId}`, {
      myScore: score.blue,
      oppScore: score.red,
      isWinner: blueIsWinner,
    })
    const winnerId =
      redIsWinner === true ? redId : blueIsWinner === true ? blueId : winnerPlayerId || null
    tieMatches.push({
      redId,
      blueId,
      redScore: score.red,
      blueScore: score.blue,
      winnerId,
      redEndsWon: endsRec.redEndsWon,
      blueEndsWon: endsRec.blueEndsWon,
    })
  }

  const rankRows = teamRows.map((team) => {
    const stats = statsMap.get(team.id)
    return {
      id: team.id,
      wins: stats.wins,
      pointsFor: stats.pointsFor,
      pointsAgainst: stats.pointsAgainst,
      endsWon: stats.endsWon,
    }
  })
  const rankRowsPlayed = rankRows.filter((row) => (matchesPlayed.get(row.id) ?? 0) > 0)
  const rankSorted = sortPoolRowsByBgpRules(rankRowsPlayed, tieMatches)
  const rankMap = new Map(rankSorted.map((row, index) => [row.id, index + 1]))

  return { poolId, hasTargetPool, teamRows, statsMap, cellMap, rankMap }
}

export function normalizePlayersForPoolPrint(players) {
  if (!Array.isArray(players)) {
    return []
  }
  return players
    .map((player) => ({
      id: String(player.id ?? "").trim(),
      name: String(player.name ?? "").trim(),
      poolId: String(player.poolId ?? "").trim(),
      poolOrder: Number(player.poolOrder),
    }))
    .filter((player) => player.id && player.name)
}
