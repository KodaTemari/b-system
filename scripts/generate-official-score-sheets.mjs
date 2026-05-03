/**
 * public/event/bgp-2026-preliminary/print/official-score-sheets.html を生成する。
 *
 * 実行: node scripts/generate-official-score-sheets.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const SCHEDULE_PATH = path.join(root, "public/data/bgp-2026-preliminary/schedule.json")
const PLAYERS_PATH = path.join(root, "public/data/bgp-2026-preliminary/classes/FRD/player.json")
const OUT_PATH = path.join(root, "public/event/bgp-2026-preliminary/print/official-score-sheets.html")

/** 印刷ロゴ（コミットしない運用向け）。存在すれば public の印刷用 assets に複製して HTML から参照する */
const PRINT_LOGO_SRC = path.join(
  root,
  "private/data/bgp-2026-preliminary/assets/print_logo.png",
)
const PRINT_LOGO_DEST_DIR = path.join(root, "public/event/bgp-2026-preliminary/print/assets")
const PRINT_LOGO_DEST = path.join(PRINT_LOGO_DEST_DIR, "print_logo.png")
const PRINT_LOGO_WEB_PATH = "assets/print_logo.png"

/** true: 1試合のみ出力（ブラウザでCSS調整するとき軽量化）。本番・コミット前は false に戻す */
const PREVIEW_SINGLE_SHEET_ONLY = false

const TIME_OPTIONS_TEXT = "・4分　　・4分30秒　 　・6分"

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function matchDisplayId(matchId) {
  const m = String(matchId).match(/BGP2026PRE-L-([A-G])-(\d+)$/)
  if (!m) return matchId
  return `${m[1]}${parseInt(m[2], 10)}`
}

function poolLetter(matchId) {
  const m = String(matchId).match(/BGP2026PRE-L-([A-G])-\d+$/)
  return m ? m[1] : ""
}

/** 左側得点表。3・4は2エンド戦で未使用→各セルに左上→右下の斜線（サンプル通り1セルごと） */
function scoreTableLeft() {
  const row1 = `
          <tr>
            <td>1</td>
            <td></td>
            <td rowspan="4" class="score-total-col"></td>
          </tr>`
  const rows234 = [2, 3, 4]
    .map((n) => {
      if (n >= 3) {
        return `
          <tr class="score-row--unused">
            <td class="score-cell-strike score-cell-strike--end-num"><span class="score-cell-strike__text">${n}</span></td>
            <td class="score-cell-strike score-cell-strike--end-score"></td>
          </tr>`
      }
      return `
          <tr>
            <td>${n}</td>
            <td></td>
          </tr>`
    })
    .join("")
  return `
      <table class="score-grid score-grid--left">
        <thead>
          <tr>
            <th>エンド</th>
            <th>エンド得点</th>
            <th>合計得点</th>
          </tr>
        </thead>
        <tbody>
          ${row1}${rows234}
        </tbody>
      </table>`
}

/** 右側得点表。3・4は左と対称（得点セル・エンド番号セルそれぞれに斜線） */
function scoreTableRight() {
  const row1 = `
          <tr>
            <td rowspan="4" class="score-total-col"></td>
            <td></td>
            <td>1</td>
          </tr>`
  const rows234 = [2, 3, 4]
    .map((n) => {
      if (n >= 3) {
        return `
          <tr class="score-row--unused">
            <td class="score-cell-strike score-cell-strike--end-score"></td>
            <td class="score-cell-strike score-cell-strike--end-num"><span class="score-cell-strike__text">${n}</span></td>
          </tr>`
      }
      return `
          <tr>
            <td></td>
            <td>${n}</td>
          </tr>`
    })
    .join("")
  return `
      <table class="score-grid score-grid--right">
        <thead>
          <tr>
            <th>合計得点</th>
            <th>エンド得点</th>
            <th>エンド</th>
          </tr>
        </thead>
        <tbody>
          ${row1}${rows234}
        </tbody>
      </table>`
}

function playerColumnHtml(playerLine) {
  return `
          <td class="player-column">
            <table class="player-box player-box--name">
              <tbody>
                <tr>
                  <th colspan="2">チーム名／選手名</th>
                </tr>
                <tr class="player-box__name-row">
                  <td colspan="2">${esc(playerLine)}</td>
                </tr>
              </tbody>
            </table>
            <table class="player-box player-box--time">
              <tbody>
                <tr>
                  <td>時間</td>
                  <td class="player-box__time-options">${TIME_OPTIONS_TEXT}</td>
                </tr>
              </tbody>
            </table>
            <table class="player-box player-box--color">
              <tbody>
                <tr>
                  <td>色</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </td>`
}

function officialSheetHtml({
  tournamentName,
  displayId,
  poolId,
  courtId,
  redLine,
  blueLine,
  logoImgSrc,
}) {
  const leftTable = scoreTableLeft()
  const rightTable = scoreTableRight()

  return `
  <section class="official-sheet" aria-label="試合 ${esc(displayId)}">
    <div class="official-sheet__content">
    <div class="official-sheet__logo">
      <img class="official-sheet__logo-img" src="${esc(logoImgSrc)}" alt="" />
    </div>
    <table class="official-sheet__event-name">
      <tbody>
        <tr>
          <td class="event-name__label">大会名</td>
          <td class="event-name__value">${esc(tournamentName)}</td>
        </tr>
      </tbody>
    </table>
    <table class="official-sheet__match-meta">
      <tbody>
        <tr>
          <td class="meta-cell-label">試合番号</td>
          <td class="meta-cell-value">${esc(displayId)}</td>
          <td class="meta-cell-label">プール</td>
          <td class="meta-cell-value">${esc(poolId)}</td>
          <td class="meta-cell-label">コート</td>
          <td class="meta-cell-value">${esc(courtId)}</td>
        </tr>
      </tbody>
    </table>

    <table class="players-split">
      <tbody>
        <tr>
          ${playerColumnHtml(redLine)}
          ${playerColumnHtml(blueLine)}
        </tr>
      </tbody>
    </table>

    <div class="score-grid-split">
      ${leftTable}
      ${rightTable}
    </div>

    <div class="score-tiebreak-wrap">
      <table class="score-tiebreak">
        <colgroup>
          <col class="score-tiebreak__col score-tiebreak__col--side" />
          <col class="score-tiebreak__col score-tiebreak__col--side" />
          <col class="score-tiebreak__col score-tiebreak__col--center" />
          <col class="score-tiebreak__col score-tiebreak__col--side" />
          <col class="score-tiebreak__col score-tiebreak__col--side" />
        </colgroup>
        <tbody>
          <tr>
            <td></td>
            <td></td>
            <td rowspan="2" class="score-tiebreak__title">
              タイブレイク<br />（ファイナルショット）
            </td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <table class="consent-row">
      <tbody>
        <tr>
          <td><span class="consent-row__box" aria-hidden="true">□</span> この試合結果に同意します</td>
          <td><span class="consent-row__box" aria-hidden="true">□</span> この試合結果に同意します</td>
        </tr>
      </tbody>
    </table>

    <table class="signoff">
      <tbody>
        <tr>
          <td>審判サイン</td>
          <td>最終チェック</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>
    </div>
  </section>`
}

const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"))
const players = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"))
const playerMap = Object.fromEntries(players.map((p) => [p.id, p]))

const TOURNAMENT_NAME = "BOCCIA GRAND PRIX 2026 予選ラウンド"

let matches = [...schedule.matches]
matches.sort((a, b) => {
  const pa = poolLetter(a.matchId)
  const pb = poolLetter(b.matchId)
  if (pa !== pb) return pa.localeCompare(pb)
  return a.round - b.round
})

if (PREVIEW_SINGLE_SHEET_ONLY) {
  matches = matches.slice(0, 1)
}

/** private のロゴを先に public へ複製し、img の ?v= でブラウザキャッシュを回避 */
fs.mkdirSync(PRINT_LOGO_DEST_DIR, { recursive: true })
let printLogoImgSrc = PRINT_LOGO_WEB_PATH
if (fs.existsSync(PRINT_LOGO_SRC)) {
  fs.copyFileSync(PRINT_LOGO_SRC, PRINT_LOGO_DEST)
  const st = fs.statSync(PRINT_LOGO_DEST)
  printLogoImgSrc = `${PRINT_LOGO_WEB_PATH}?v=${String(Math.floor(st.mtimeMs))}`
  console.log(`Copied print logo → ${PRINT_LOGO_DEST}`)
} else if (fs.existsSync(PRINT_LOGO_DEST)) {
  const st = fs.statSync(PRINT_LOGO_DEST)
  printLogoImgSrc = `${PRINT_LOGO_WEB_PATH}?v=${String(Math.floor(st.mtimeMs))}`
  console.warn(
    `[warn] Print logo source missing: ${PRINT_LOGO_SRC} — using existing ${PRINT_LOGO_DEST}`,
  )
} else {
  console.warn(
    `[warn] Print logo not found: ${PRINT_LOGO_SRC} — place the file, run again, or copy manually to ${PRINT_LOGO_DEST}`,
  )
}

const sections = matches.map((m) => {
  const red = playerMap[m.redPlayerId]
  const blue = playerMap[m.bluePlayerId]
  const redName = red?.name ?? `（未登録:${m.redPlayerId}）`
  const blueName = blue?.name ?? `（未登録:${m.bluePlayerId}）`
  return officialSheetHtml({
    tournamentName: TOURNAMENT_NAME,
    displayId: matchDisplayId(m.matchId),
    poolId: poolLetter(m.matchId),
    courtId: String(m.courtId),
    redLine: `${m.redPlayerId}. 　${redName}`,
    blueLine: `${m.bluePlayerId}. 　${blueName}`,
    logoImgSrc: printLogoImgSrc,
  })
})

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(TOURNAMENT_NAME)} — 公式スコアシート</title>
  <link rel="stylesheet" href="./official-score-sheet.css" />
</head>
<body>
  <div class="print-root">
${sections.join("\n")}
  </div>
</body>
</html>
`

fs.writeFileSync(OUT_PATH, html, "utf8")
const previewNote = PREVIEW_SINGLE_SHEET_ONLY ? " [プレビュー: 1枚のみ]" : ""
console.log(`Wrote ${OUT_PATH} (${matches.length} sheets)${previewNote}`)
