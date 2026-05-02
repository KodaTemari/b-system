/**
 * public/print/bgp-2026-preliminary/scorecards.html を生成する。
 * データ: public/data/bgp-2026-preliminary/schedule.json + classes/FRD/player.json
 *
 * スタイルは同じディレクトリの scorecards.css を <link> で参照する。
 * 見た目の調整は CSS を編集してリロードすればよい（本スクリプトの再実行は不要）。
 * スケジュール・選手名を更新したときだけ再実行する。
 *
 * 実行: node scripts/generate-print-scorecards.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const SCHEDULE_PATH = path.join(root, "public/data/bgp-2026-preliminary/schedule.json")
const PLAYERS_PATH = path.join(root, "public/data/bgp-2026-preliminary/classes/FRD/player.json")
const OUT_PATH = path.join(root, "public/print/bgp-2026-preliminary/scorecards.html")

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
  if (!m) return matchId
  return `${m[1]}${parseInt(m[2], 10)}`
}

function poolLetter(matchId) {
  const m = String(matchId).match(/BGP2026PRE-L-([A-G])-\d+$/)
  return m ? m[1] : ""
}

function formatTimeTokyo(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  })
}

function scorecardHtml({
  title,
  timeStr,
  roundLabel,
  poolId,
  courtLabel,
  displayId,
  redId,
  redName,
  blueId,
  blueName,
}) {
  const redLine = `${esc(redId)}. ${esc(redName)}`
  const blueLine = `${esc(blueId)}. ${esc(blueName)}`
  const poolPart = poolId ? `　プール ${esc(poolId)}` : ""
  return `
    <article class="scorecard">
      <h1 class="scorecard__title">${esc(title)}</h1>
      <div class="scorecard__meta">
        <span class="scorecard__meta-left">${esc(timeStr)}　${esc(roundLabel)}${poolPart}</span>
        <span class="scorecard__meta-center">${esc(courtLabel)}</span>
        <span class="scorecard__meta-right">ID: ${esc(displayId)}</span>
      </div>
      <table class="scorecard__table">
        <tbody>
          <tr>
            <td class="col-side">
              <div class="side-cell">
                <span class="rb-badge" aria-hidden="true">赤・青</span>
                <span class="player-line">${redLine}</span>
              </div>
            </td>
            <th class="col-label">選手名</th>
            <td class="col-side">
              <div class="side-cell side-cell--blue">
                <span class="rb-badge" aria-hidden="true">赤・青</span>
                <span class="player-line">${blueLine}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td class="score-cell">&nbsp;</td>
            <th class="col-label">第1エンド</th>
            <td class="score-cell">&nbsp;</td>
          </tr>
          <tr>
            <td class="score-cell">&nbsp;</td>
            <th class="col-label">第2エンド</th>
            <td class="score-cell">&nbsp;</td>
          </tr>
          <tr>
            <td class="score-cell">&nbsp;</td>
            <th class="col-label">最終得点</th>
            <td class="score-cell">&nbsp;</td>
          </tr>
        </tbody>
      </table>
      <div class="scorecard__umpire">審判 __________________________________________</div>
    </article>`
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"))
const players = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"))
const playerMap = Object.fromEntries(players.map((p) => [p.id, p]))

const TITLE = "BOCCIA GRAND PRIX 2026 予選ラウンド"

let matches = [...schedule.matches]
matches.sort((a, b) => {
  const pa = poolLetter(a.matchId)
  const pb = poolLetter(b.matchId)
  if (pa !== pb) return pa.localeCompare(pb)
  return a.round - b.round
})

const cards = matches.map((m) => {
  const red = playerMap[m.redPlayerId]
  const blue = playerMap[m.bluePlayerId]
  const redName = red?.name ?? `（未登録:${m.redPlayerId}）`
  const blueName = blue?.name ?? `（未登録:${m.bluePlayerId}）`
  return scorecardHtml({
    title: TITLE,
    timeStr: formatTimeTokyo(m.scheduledStart),
    roundLabel: `${m.round}回戦`,
    poolId: poolLetter(m.matchId),
    courtLabel: `コート ${m.courtId}`,
    displayId: matchDisplayId(m.matchId),
    redId: m.redPlayerId,
    redName,
    blueId: m.bluePlayerId,
    blueName,
  })
})

const sheets = chunk(cards, 2)
const sheetsHtml = sheets
  .map(
    (group) => `
  <section class="sheet">
    ${group.join("\n")}
  </section>`
  )
  .join("\n")

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(TITLE)} — スコアカード印刷</title>
  <link rel="stylesheet" href="./scorecards.css" />
</head>
<body>
  <div class="print-root">
${sheetsHtml}
  </div>
</body>
</html>
`

fs.writeFileSync(OUT_PATH, html, "utf8")
console.log(`Wrote ${OUT_PATH} (${matches.length} matches, ${sheets.length} sheets)`)
