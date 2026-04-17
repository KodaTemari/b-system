const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

// 大会データのルート（既定: ../public/data）
// 開発時に本番相当データを使う場合は、環境変数 B_SYSTEM_DATA_ROOT にディレクトリを指定する
// 例: B_SYSTEM_DATA_ROOT=C:\path\to\private\data
const PUBLIC_DATA_ROOT = path.join(__dirname, '../public/data');
const DATA_ROOT = process.env.B_SYSTEM_DATA_ROOT
  ? path.resolve(process.env.B_SYSTEM_DATA_ROOT)
  : PUBLIC_DATA_ROOT;

// ローカルIPアドレスを取得する関数
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部ループバックでない、かつ有効なアドレス
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ミドルウェア
app.use(cors());
app.use(express.json());

/** 読み取り: DATA_ROOT を優先し、無ければ public/data（共有 JSON・別 eventId のデモ用） */
async function readJsonUnderEvent(eventId, ...pathSegments) {
  const rel = path.join(eventId, ...pathSegments);
  const primary = path.join(DATA_ROOT, rel);
  if (await fs.pathExists(primary)) {
    return fs.readJson(primary);
  }
  const fallback = path.join(PUBLIC_DATA_ROOT, rel);
  if (await fs.pathExists(fallback)) {
    return fs.readJson(fallback);
  }
  return null;
}

async function resolveCourtDir(eventId) {
  const d1 = path.join(DATA_ROOT, eventId, 'court');
  if (await fs.pathExists(d1)) return d1;
  const d2 = path.join(PUBLIC_DATA_ROOT, eventId, 'court');
  if (await fs.pathExists(d2)) return d2;
  return null;
}

// 静的ファイルの提供（B_SYSTEM_DATA_ROOT 利用時は DATA_ROOT を優先し、無いパスは public/data にフォールバック）
app.use('/data', express.static(DATA_ROOT));
app.use('/data', express.static(PUBLIC_DATA_ROOT));

// データを更新する汎用APIエンドポイント
app.put('/api/data/:eventId/court/:courtId/:filename', async (req, res) => {
  try {
    const { eventId, courtId, filename } = req.params;
    const data = req.body;

    // ファイルパスを構築
    const filePath = path.join(DATA_ROOT, eventId, 'court', courtId, `${filename}.json`);
    
    // ディレクトリが存在しない場合は作成
    await fs.ensureDir(path.dirname(filePath));
    
    // インデント設定
    let jsonString = JSON.stringify(data, null, 2);

    // match.ends 配列内の整形（game.jsonの場合のみ）
    if (filename === 'game') {
      // インデントを保持しつつ、"shots" を含むオブジェクト（各エンドの記録）のみを1行化
      jsonString = jsonString.replace(
        /(\s+)\{\s+"end":\s+("[^"]+"|\d+),\s+"shots":[\s\S]+?\}/g,
        (match, indent) => {
          return indent + match.replace(/\n/g, '').replace(/\s\s+/g, ' ').trim();
        }
      );
    }
    
    await fs.writeFile(filePath, jsonString, 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// データを取得する汎用APIエンドポイント
app.get('/api/data/:eventId/court/:courtId/:filename', async (req, res) => {
  try {
    const { eventId, courtId, filename } = req.params;
    const data = await readJsonUnderEvent(eventId, 'court', courtId, `${filename}.json`);
    if (data != null) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 大会の全コート一覧を取得
app.get('/api/data/:eventId/courts', async (req, res) => {
  try {
    const { eventId } = req.params;
    const courtDir = await resolveCourtDir(eventId);
    if (!courtDir) {
      return res.json([]);
    }
    const entries = await fs.readdir(courtDir, { withFileTypes: true });
    const courts = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    res.json(courts);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 大会の全コートの game.json を一括取得（グループリーグ結果表示用）
app.get('/api/data/:eventId/results/all-games', async (req, res) => {
  try {
    const { eventId } = req.params;
    const courtDir = await resolveCourtDir(eventId);
    if (!courtDir) {
      return res.json({ games: [] });
    }
    const entries = await fs.readdir(courtDir, { withFileTypes: true });
    const courtIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const games = [];
    for (const courtId of courtIds) {
      const gamePath = path.join(courtDir, courtId, 'game.json');
      if (await fs.pathExists(gamePath)) {
        const game = await fs.readJson(gamePath);
        games.push({ courtId, game });
      }
    }
    res.json({ games });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 後方互換性のための既存エンドポイント
app.get('/api/game/:eventId/court/:courtId', async (req, res) => {
  const { eventId, courtId } = req.params;
  const data = await readJsonUnderEvent(eventId, 'court', courtId, 'game.json');
  if (data != null) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.put('/api/game/:eventId/court/:courtId', async (req, res) => {
  // 既存のPUT処理（必要に応じて残す、またはリダイレクト）
  // ...
});


// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIPAddress();
  console.log(`Data root (primary): ${DATA_ROOT}`);
  if (path.resolve(DATA_ROOT) !== path.resolve(PUBLIC_DATA_ROOT)) {
    console.log(`Data root (fallback): ${PUBLIC_DATA_ROOT}`);
  }
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server running on http://${localIP}:${PORT}`);
  console.log(`IP: ${localIP}:${PORT}`);
});
