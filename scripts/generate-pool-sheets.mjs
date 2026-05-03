/**
 * public/event/bgp-2026-preliminary/print/pool-sheets.html を生成する。
 * レイアウトは会場の PoolStandings（/event/.../pool/:id/standings）と同一のマトリクス表。
 * A4 横・1 プール 1 枚。
 *
 * 実行: node scripts/generate-pool-sheets.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { buildPoolHueMap, collectPoolIds, parsePoolMeta } from "../src/utils/schedulePoolIds.js"
import { buildPoolViewData, normalizePlayersForPoolPrint } from "./lib/pool-standings-matrix.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const SCHEDULE_PATH = path.join(root, "public/data/bgp-2026-preliminary/schedule.json")
const PLAYERS_PATH = path.join(root, "public/data/bgp-2026-preliminary/classes/FRD/player.json")
const OUT_PATH = path.join(root, "public/event/bgp-2026-preliminary/print/pool-sheets.html")

const TOURNAMENT_NAME = "BOCCIA GRAND PRIX 2026 予選ラウンド"

/** true: 1 プールのみ（CSS 調整用）。本番前は false */
const PREVIEW_SINGLE_POOL_ONLY = false

/** PoolStandings と同様（現状アプリ既定は false） */
const SHOW_ENDS_WON_COLUMN = false

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** BGP2026PRE-L-A-01 → A1 */
function matchDisplayId(matchId) {
  const m = String(matchId).match(/BGP2026PRE-L-([A-G])-(\d+)$/)
  if (!m) return String(matchId)
  return `${m[1]}${parseInt(m[2], 10)}`
}

function resolveMatchPoolId(match, playerPoolGroupMap) {
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

function buildPairToDisplayId(poolId, matches, playerPoolGroupMap) {
  const map = new Map()
  for (const m of matches) {
    if (resolveMatchPoolId(m, playerPoolGroupMap) !== poolId) {
      continue
    }
    const redId = String(m.redPlayerId ?? "").trim()
    const blueId = String(m.bluePlayerId ?? "").trim()
    if (!redId || !blueId) {
      continue
    }
    const label = matchDisplayId(m.matchId)
    map.set(`${redId}:${blueId}`, label)
    map.set(`${blueId}:${redId}`, label)
  }
  return map
}

/** 対角マス：CSS グラデは印刷で落ちやすいので SVG 直線（隅から隅） */
/* 左上→右下（会場 PoolStandings の to top right グラデと同じ向きの対角） */
const DIAGONAL_CELL_HTML = `<td class="poolMatrixDiagonalCell"><svg class="poolMatrixDiagonalSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line class="poolMatrixDiagonalSvg__line" x1="0" y1="0" x2="100" y2="100" fill="none" stroke="#111111" stroke-width="1" vector-effect="non-scaling-stroke" /></svg></td>`

/** 記入用シート：マスに試合ID（A1 等）を左上表示。集計・順位は空 */
function poolMatrixHtml(view) {
  const { poolId, teamRows, hue, pairToDisplayId } = view

  const headerStyle = `--poolHue:${hue}`

  const thead = `
                      <thead>
                        <tr>
                          <th class="poolMatrixPoolHeader">${esc(`プール ${poolId}`)}</th>
                          ${teamRows
                            .map(
                              (team) =>
                                `<th class="poolMatrixTeamHeader" scope="col">${esc(team.name)}</th>`,
                            )
                            .join("")}
                          <th class="poolMatrixSummaryHeader">勝数</th>
                          <th class="poolMatrixSummaryHeader">得点</th>
                          <th class="poolMatrixSummaryHeader">失点</th>
                          <th class="poolMatrixSummaryHeader">得失</th>
                          ${
                            SHOW_ENDS_WON_COLUMN
                              ? '<th class="poolMatrixSummaryHeader poolMatrixSummaryHeaderEndsWon">勝エンド</th>'
                              : ""
                          }
                          <th class="poolMatrixSummaryHeader poolMatrixRankHeader">順位</th>
                        </tr>
                      </thead>`

  const tbody = teamRows
    .map((rowTeam) => {
      const cells = teamRows
        .map((colTeam) => {
          if (rowTeam.id === colTeam.id) {
            return DIAGONAL_CELL_HTML
          }
          const mid = pairToDisplayId.get(`${rowTeam.id}:${colTeam.id}`) ?? ""
          const idSpan = mid
            ? `<span class="poolMatrixScoreCell__match-id">${esc(mid)}</span>`
            : ""
          return `<td class="poolMatrixScoreCell">${idSpan}</td>`
        })
        .join("")
      const endsCell = SHOW_ENDS_WON_COLUMN ? `<td class="poolMatrixSummaryCell"></td>` : ""
      return `
                            <tr>
                              <th class="poolMatrixRowHeader" scope="row">${esc(rowTeam.name)}</th>
                              ${cells}
                              <td class="poolMatrixSummaryCell"></td>
                              <td class="poolMatrixSummaryCell"></td>
                              <td class="poolMatrixSummaryCell"></td>
                              <td class="poolMatrixSummaryCell"></td>
                              ${endsCell}
                              <td class="poolMatrixSummaryCell poolMatrixRankCell"></td>
                            </tr>`
    })
    .join("")

  return `
  <section class="pool-sheet-print" aria-label="プール ${esc(poolId)}">
    <div class="pool-sheet-print__meta">
      <span class="pool-sheet-print__event">${esc(TOURNAMENT_NAME)}</span>
    </div>
    <section class="poolListItem pool-sheet-print__matrix" style="${headerStyle}">
      <div class="poolMatrixWrap">
        <table class="poolMatrixTable">
          ${thead}
          <tbody>${tbody}
          </tbody>
        </table>
      </div>
    </section>
  </section>`
}

const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"))
const playersRaw = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"))
const players = normalizePlayersForPoolPrint(playersRaw)

const scheduleForBuild = {
  pools: Array.isArray(schedule.pools) ? schedule.pools : [],
  matches: Array.isArray(schedule.matches) ? schedule.matches : [],
}

const playerNameMap = new Map(players.map((p) => [p.id, p.name]))
const playerPoolGroupMap = new Map()
for (const player of players) {
  const parsed = parsePoolMeta(player.poolId)
  if (parsed.groupId) {
    playerPoolGroupMap.set(player.id, parsed.groupId)
  }
}

const poolIds = collectPoolIds(players, scheduleForBuild.pools, scheduleForBuild.matches)
const hueMap = buildPoolHueMap(poolIds)

const endsWonByMatchId = new Map()
const courtByMatchId = new Map()

let views = poolIds.map((poolId) => {
  const data = buildPoolViewData(
    poolId,
    players,
    scheduleForBuild,
    playerNameMap,
    playerPoolGroupMap,
    endsWonByMatchId,
    courtByMatchId,
  )
  const pairToDisplayId = buildPairToDisplayId(
    poolId,
    scheduleForBuild.matches,
    playerPoolGroupMap,
  )
  return {
    ...data,
    hue: hueMap.get(poolId) ?? 110,
    pairToDisplayId,
  }
})
views = views.filter((v) => v.hasTargetPool)

if (PREVIEW_SINGLE_POOL_ONLY && views.length > 0) {
  views = views.slice(0, 1)
}

const sections = views.map((view) => poolMatrixHtml(view))

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(TOURNAMENT_NAME)} — プール表</title>
  <link rel="stylesheet" href="./pool-sheets.css" />
</head>
<body>
  <div class="print-root">
${sections.join("\n")}
  </div>
</body>
</html>
`

fs.writeFileSync(OUT_PATH, html, "utf8")
const previewNote = PREVIEW_SINGLE_POOL_ONLY ? " [プレビュー: 1プールのみ]" : ""
console.log(`Wrote ${OUT_PATH} (${views.length} pools)${previewNote}`)
