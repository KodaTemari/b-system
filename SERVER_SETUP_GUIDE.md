# サーバーセットアップガイド

## 📌 このガイドの使い方

既にboccia.appにHTTPS対応のサーバーがある状態から、現在のシステムをデプロイするための手順です。

---

## ステップ1: 現在のサーバー状況を確認

### SSHで接続

```bash
ssh ユーザー名@boccia.app
```

### 現在の環境を確認

```bash
# 1. OSバージョン
cat /etc/os-release

# 2. Webサーバー
systemctl status nginx
# または
systemctl status apache2

# 3. Node.jsのインストール状況
node -v
npm -v

# 4. PM2のインストール状況
pm2 -v

# 5. 現在のファイル構成
ls -la /var/www/
```

---

## ステップ2: 必要なソフトウェアのインストール

### Node.js（v18以上推奨）

```bash
# Node.jsがインストールされていない、または古い場合
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 確認
node -v  # v20.x.x
npm -v   # 10.x.x
```

### PM2（プロセス管理）

```bash
sudo npm install -g pm2

# 確認
pm2 -v
```

---

## ステップ3: ディレクトリ構造の準備

### 推奨ディレクトリ構成

```
/var/www/boccia-app/
├── dist/                # Reactビルド後の静的ファイル
│   ├── index.html
│   ├── assets/
│   └── data/
│       └── classDefinitions.json
├── server/              # Expressサーバー
│   ├── server.js
│   ├── package.json
│   └── node_modules/
└── data/                # 試合データ（シンボリックリンク）
    └── {eventId}/
```

### ディレクトリの作成

```bash
# ディレクトリ作成
sudo mkdir -p /var/www/boccia-app/dist
sudo mkdir -p /var/www/boccia-app/server
sudo mkdir -p /var/www/boccia-app/data

# 所有者を変更
sudo chown -R $USER:$USER /var/www/boccia-app

# dataディレクトリは書き込み可能に
sudo chown -R www-data:www-data /var/www/boccia-app/data
sudo chmod -R 755 /var/www/boccia-app/data
```

---

## ステップ4: Nginx設定

### 既存の設定を確認

```bash
# 設定ファイルの場所を確認
ls /etc/nginx/sites-available/
ls /etc/nginx/sites-enabled/

# 現在の設定を確認
cat /etc/nginx/sites-available/boccia.app
# または
cat /etc/nginx/sites-available/default
```

### 新しい設定ファイルを作成

```bash
sudo nano /etc/nginx/sites-available/boccia.app
```

以下の内容を貼り付け：

```nginx
server {
    listen 443 ssl http2;
    server_name boccia.app;

    # SSL証明書（既存の証明書パスを確認してください）
    ssl_certificate /etc/letsencrypt/live/boccia.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/boccia.app/privkey.pem;
    
    # SSL設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ログ設定
    access_log /var/log/nginx/boccia-app-access.log;
    error_log /var/log/nginx/boccia-app-error.log;

    # 静的ファイル（React SPA）
    location / {
        root /var/www/boccia-app/dist;
        try_files $uri $uri/ /index.html;
        
        # キャッシュ設定
        location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # APIエンドポイント
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # タイムアウト設定
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # データファイル（直接アクセス）
    location /data/ {
        root /var/www/boccia-app/dist;
        add_header Cache-Control "no-cache, must-revalidate";
        
        # JSON以外のアクセスを拒否
        location ~ \.json$ {
            add_header Content-Type application/json;
        }
    }
}

# HTTPからHTTPSへリダイレクト
server {
    listen 80;
    server_name boccia.app;
    return 301 https://$host$request_uri;
}
```

### 設定を有効化

```bash
# シンボリックリンクを作成（まだの場合）
sudo ln -s /etc/nginx/sites-available/boccia.app /etc/nginx/sites-enabled/

# 既存のdefault設定を無効化（必要に応じて）
sudo rm /etc/nginx/sites-enabled/default

# 設定ファイルの構文チェック
sudo nginx -t

# Nginxを再起動
sudo systemctl reload nginx
```

---

## ステップ5: ファイアウォール設定

```bash
# UFW（Uncomplicated Firewall）を確認
sudo ufw status

# 必要なポートを開放
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# ファイアウォールを有効化
sudo ufw enable
```

---

## ステップ6: SSL証明書の確認

### Let's Encryptの証明書を確認

```bash
# 証明書の場所を確認
sudo ls -la /etc/letsencrypt/live/boccia.app/

# 証明書の有効期限を確認
sudo certbot certificates
```

### 自動更新が設定されているか確認

```bash
# Certbotの自動更新タイマー
sudo systemctl status certbot.timer

# 自動更新のテスト
sudo certbot renew --dry-run
```

---

## ステップ7: Node.jsサーバーの起動

### PM2でサーバーを起動

```bash
# サーバーディレクトリに移動
cd /var/www/boccia-app/server

# 依存関係をインストール
npm install --production

# PM2でサーバーを起動
pm2 start server.js --name boccia-api

# PM2を自動起動に設定
pm2 startup
# 表示されたコマンドを実行してください

# 現在の状態を保存
pm2 save

# ログを確認
pm2 logs boccia-api
```

### PM2の基本コマンド

```bash
# プロセス一覧
pm2 list

# ログを表示
pm2 logs boccia-api

# サーバーを再起動
pm2 restart boccia-api

# サーバーを停止
pm2 stop boccia-api

# サーバーを削除
pm2 delete boccia-api
```

---

## ステップ8: デプロイの実行

ローカル（Windows）から：

```powershell
# PowerShellを使用
.\deploy.ps1 -Server "ユーザー名@boccia.app"
```

または、WSL/Git Bashを使用：

```bash
# deploy.shに実行権限を付与
chmod +x deploy.sh

# デプロイ実行
./deploy.sh ユーザー名@boccia.app
```

---

## ステップ9: 動作確認

### ブラウザでアクセス

1. **スタンドアロンモード**
   - https://boccia.app/scoreboard?p=ctrl（タブレット）
   - https://boccia.app/scoreboard（ディスプレイ）

2. **大会モード**
   - https://boccia.app/event/test/court/A/scoreboard?p=ctrl

### サーバー側で確認

```bash
# Nginxのステータス
sudo systemctl status nginx

# Node.jsサーバーのステータス
pm2 status

# ログを確認
pm2 logs boccia-api
sudo tail -f /var/log/nginx/boccia-app-error.log
```

---

## 🛠️ トラブルシューティング

### APIエラー（404 Not Found）

**原因**: Node.jsサーバーが起動していない

**解決策**:
```bash
cd /var/www/boccia-app/server
pm2 restart boccia-api
pm2 logs boccia-api
```

### ページが表示されない（502 Bad Gateway）

**原因**: Nginx設定の問題、またはNode.jsサーバーが停止

**解決策**:
```bash
# Nginx設定をチェック
sudo nginx -t

# PM2を確認
pm2 status

# エラーログを確認
sudo tail -f /var/log/nginx/boccia-app-error.log
```

### SSL証明書エラー

**原因**: 証明書の有効期限切れ、または証明書のパスが間違っている

**解決策**:
```bash
# 証明書を更新
sudo certbot renew

# Nginxを再起動
sudo systemctl reload nginx
```

### データが保存されない

**原因**: ディレクトリの書き込み権限がない

**解決策**:
```bash
sudo chown -R www-data:www-data /var/www/boccia-app/dist/data
sudo chmod -R 755 /var/www/boccia-app/dist/data
```

---

## 📊 監視とメンテナンス

### ログのローテーション

```bash
# PM2のログローテーション
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 定期的なバックアップ

```bash
# データディレクトリのバックアップスクリプト例
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf /backup/boccia-data-$DATE.tar.gz /var/www/boccia-app/data
# 古いバックアップを削除（7日以上前）
find /backup -name "boccia-data-*.tar.gz" -mtime +7 -delete
```

---

## ✅ デプロイ完了チェックリスト

- [ ] Node.js v18以上がインストール済み
- [ ] PM2がインストール済み
- [ ] Nginx設定が完了
- [ ] SSL証明書が有効
- [ ] ファイアウォール設定が完了
- [ ] Node.jsサーバーが起動
- [ ] https://boccia.app にアクセスできる
- [ ] スタンドアロンモードが動作
- [ ] 大会モードが動作（テストデータ）
- [ ] PM2が自動起動に設定済み

---

**最終更新**: 2026-01-15
