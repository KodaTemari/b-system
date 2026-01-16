# デプロイチェックリスト

## 📋 デプロイ前の確認事項

### ローカル環境での確認

- [ ] **本番ビルドが正常に動作する**
  ```bash
  npm run build
  npm run preview  # ビルド結果のプレビュー
  ```

- [ ] **Expressサーバーが起動する**
  ```bash
  cd server
  node server.js
  ```

- [ ] **両方のモードが動作する**
  - [ ] スタンドアロンモード: http://localhost:5173/scoreboard?p=ctrl
  - [ ] 大会モード: http://localhost:5173/event/0-TEST/court/A/scoreboard?p=ctrl

- [ ] **データ保存が正常に動作する**
  - [ ] スコア入力
  - [ ] タイマー動作
  - [ ] 設定変更
  - [ ] リセット機能

---

## 🔧 サーバー環境の確認

### 必要な情報

1. **SSH接続情報**
   - ホスト: boccia.app（またはIPアドレス）
   - ユーザー名: _____________
   - パスワード/秘密鍵: _____________

2. **現在のサーバー構成**
   - [ ] Nginx設定ファイルの場所: _____________
   - [ ] ドキュメントルート: _____________
   - [ ] Node.jsバージョン: _____________
   - [ ] PM2の有無: _____________

3. **SSL証明書**
   - [ ] Let's Encrypt使用中
   - [ ] 証明書の場所: _____________
   - [ ] 自動更新設定済み

---

## 📦 デプロイに必要なファイル

### 1. フロントエンド（React）

```bash
# ビルド
npm run build

# 生成されるファイル
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   └── index-[hash].css
└── data/
    └── classDefinitions.json
```

### 2. バックエンド（Express）

```
server/
├── server.js
├── package.json
└── package-lock.json
```

### 3. データディレクトリ

```
data/
├── classDefinitions.json
└── {eventId}/
    ├── init.json
    ├── schedule.json
    └── court/
        └── {courtId}/
            ├── settings.json
            └── game.json
```

---

## 🚀 デプロイ手順（簡易版）

### ステップ1: ローカルでビルド

```bash
# プロジェクトルート
npm run build

# サーバー側の依存関係を確認
cd server
npm install --production
```

### ステップ2: サーバーにアップロード

```bash
# dist/フォルダをサーバーにアップロード
scp -r dist/* ユーザー名@boccia.app:/var/www/boccia-app/dist/

# server/フォルダをサーバーにアップロード
scp -r server/* ユーザー名@boccia.app:/var/www/boccia-app/server/
```

### ステップ3: サーバーで設定

```bash
# SSHでサーバーに接続
ssh ユーザー名@boccia.app

# ディレクトリ構成を確認
cd /var/www/boccia-app
ls -la

# サーバー側の依存関係をインストール
cd server
npm install --production

# PM2でサーバーを起動
pm2 start server.js --name boccia-api
pm2 save
pm2 startup
```

### ステップ4: Nginx設定を確認

```bash
# Nginx設定を確認
sudo nano /etc/nginx/sites-available/boccia.app

# 設定を反映
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📝 Nginx設定例

```nginx
server {
    listen 443 ssl http2;
    server_name boccia.app;

    # SSL証明書（Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/boccia.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/boccia.app/privkey.pem;

    # 静的ファイル（React SPA）
    location / {
        root /var/www/boccia-app/dist;
        try_files $uri $uri/ /index.html;
    }

    # APIエンドポイント
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # データファイル（直接アクセス）
    location /data/ {
        root /var/www/boccia-app/dist;
        add_header Cache-Control "no-cache, must-revalidate";
    }
}

# HTTPからHTTPSへリダイレクト
server {
    listen 80;
    server_name boccia.app;
    return 301 https://$host$request_uri;
}
```

---

## 🔍 デプロイ後の確認

### 動作確認

- [ ] **スタンドアロンモード**
  - https://boccia.app/scoreboard?p=ctrl（タブレット）
  - https://boccia.app/scoreboard（ディスプレイ）

- [ ] **大会モード**
  - https://boccia.app/event/test/court/A/scoreboard?p=ctrl

### トラブルシューティング

```bash
# サーバーログの確認
pm2 logs boccia-api

# Nginxログの確認
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# プロセスの状態確認
pm2 status
```

---

## 🛠️ よくあるトラブル

### 1. APIが404エラー

**原因**: Expressサーバーが起動していない

**解決策**:
```bash
cd /var/www/boccia-app/server
pm2 restart boccia-api
```

### 2. ページが表示されない

**原因**: Nginx設定の問題

**解決策**:
```bash
sudo nginx -t  # 設定ファイルの構文チェック
sudo systemctl reload nginx
```

### 3. データが保存されない

**原因**: ディレクトリの書き込み権限がない

**解決策**:
```bash
sudo chown -R www-data:www-data /var/www/boccia-app/dist/data
sudo chmod -R 755 /var/www/boccia-app/dist/data
```

---

## 📞 サポート情報

### エックスサーバーVPS

- コントロールパネル: https://vps.xserver.ne.jp/
- サポート: https://www.xserver.ne.jp/support/

### 参考リンク

- [Nginx公式ドキュメント](https://nginx.org/en/docs/)
- [PM2公式ドキュメント](https://pm2.keymetrics.io/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

---

## ✅ デプロイ完了後のタスク

- [ ] 動作確認（全機能）
- [ ] パフォーマンステスト
- [ ] バックアップの設定
- [ ] 監視設定（オプション）
- [ ] ドキュメント更新

---

**最終更新**: 2026-01-15
