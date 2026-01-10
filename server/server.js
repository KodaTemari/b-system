const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

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

// 静的ファイルの提供
app.use('/data', express.static(path.join(__dirname, '../public/data')));

// データを更新する汎用APIエンドポイント
app.put('/api/data/:eventId/court/:courtId/:filename', async (req, res) => {
  try {
    const { eventId, courtId, filename } = req.params;
    const data = req.body;

    // ファイルパスを構築
    const filePath = path.join(__dirname, '../public/data', eventId, 'court', courtId, `${filename}.json`);
    
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
    const filePath = path.join(__dirname, '../public/data', eventId, 'court', courtId, `${filename}.json`);
    
    if (await fs.pathExists(filePath)) {
      const data = await fs.readJson(filePath);
      res.json(data);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 後方互換性のための既存エンドポイント
app.get('/api/game/:eventId/court/:courtId', async (req, res) => {
  const { eventId, courtId } = req.params;
  const filePath = path.join(__dirname, '../public/data', eventId, 'court', courtId, 'game.json');
  if (await fs.pathExists(filePath)) {
    res.json(await fs.readJson(filePath));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.put('/api/game/:eventId/court/:courtId', async (req, res) => {
  // 既存のPUT処理（必要に応じて残す、またはリダイレクト）
  // ...
});


// サーバー起動
app.listen(PORT, () => {
  const localIP = getLocalIPAddress();
  console.log(`Server running on http://${localIP}:${PORT}`);
});
