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

// game.jsonを更新するAPIエンドポイント
app.put('/api/game/:eventId/court/:courtId', async (req, res) => {
  try {
    const { eventId, courtId } = req.params;
    const gameData = req.body;

    // ファイルパスを構築
    const filePath = path.join(__dirname, '../public/data', eventId, 'court', courtId, 'game.json');
    
    // ディレクトリが存在しない場合は作成
    await fs.ensureDir(path.dirname(filePath));
    
    // 一度標準的なインデントでJSON文字列を作成
    let jsonString = JSON.stringify(gameData, null, 2);

    // match.ends 配列内の各エンドオブジェクト（"shots"を含むもの）だけを1行にまとめる
    jsonString = jsonString.replace(
      /(\s+)\{\s+"end":\s+(\d+),\s+"shots":[\s\S]+?\}/g,
      (match, indent) => {
        return indent + match.replace(/\n/g, '').replace(/\s\s+/g, ' ').trim();
      }
    );
    
    // ファイルに書き込み
    await fs.writeFile(filePath, jsonString, 'utf8');
    
    res.json({ success: true, message: 'Game data updated successfully' });
  } catch (error) {
    console.error('Error updating game.json:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// game.jsonを取得するAPIエンドポイント
app.get('/api/game/:eventId/court/:courtId', async (req, res) => {
  try {
    const { eventId, courtId } = req.params;
    const filePath = path.join(__dirname, '../public/data', eventId, 'court', courtId, 'game.json');
    
    // ファイルが存在するかチェック
    if (await fs.pathExists(filePath)) {
      const gameData = await fs.readJson(filePath);
      res.json(gameData);
    } else {
      res.status(404).json({ error: 'Game data not found' });
    }
  } catch (error) {
    console.error('Error reading game.json:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// サーバー起動
app.listen(PORT, () => {
  const localIP = getLocalIPAddress();
  console.log(`Server running on http://${localIP}:${PORT}`);
});
