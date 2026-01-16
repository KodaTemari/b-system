#!/bin/bash

# ボッチャスコアボードシステム - デプロイスクリプト
# 使い方: ./deploy.sh [ユーザー名@ホスト]
# 例: ./deploy.sh user@boccia.app

set -e  # エラーで停止

# 色付きログ
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 引数チェック
if [ -z "$1" ]; then
    log_error "使い方: ./deploy.sh [ユーザー名@ホスト]"
    log_error "例: ./deploy.sh user@boccia.app"
    exit 1
fi

SERVER=$1
REMOTE_DIR="/var/www/boccia-app"

log_info "デプロイを開始します: $SERVER"

# ステップ1: ローカルでビルド
log_info "フロントエンドをビルド中..."
npm run build

if [ ! -d "dist" ]; then
    log_error "dist/ディレクトリが見つかりません。ビルドが失敗した可能性があります。"
    exit 1
fi

log_info "ビルド完了"

# ステップ2: サーバーにディレクトリを作成
log_info "サーバーにディレクトリを作成中..."
ssh $SERVER "mkdir -p $REMOTE_DIR/dist $REMOTE_DIR/server"

# ステップ3: ファイルをアップロード
log_info "dist/をアップロード中..."
rsync -avz --delete dist/ $SERVER:$REMOTE_DIR/dist/

log_info "server/をアップロード中..."
rsync -avz --exclude 'node_modules' server/ $SERVER:$REMOTE_DIR/server/

# ステップ4: サーバー側で依存関係をインストール
log_info "サーバー側で依存関係をインストール中..."
ssh $SERVER "cd $REMOTE_DIR/server && npm install --production"

# ステップ5: PM2でサーバーを再起動
log_info "Node.jsサーバーを再起動中..."
ssh $SERVER "pm2 restart boccia-api || pm2 start $REMOTE_DIR/server/server.js --name boccia-api"
ssh $SERVER "pm2 save"

# ステップ6: 動作確認
log_info "動作確認中..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://boccia.app)

if [ "$RESPONSE" == "200" ]; then
    log_info "✅ デプロイ成功！ https://boccia.app で確認できます"
else
    log_warn "⚠️ サイトの応答が正常ではありません（HTTP $RESPONSE）"
    log_warn "手動で確認してください: https://boccia.app"
fi

log_info "デプロイ完了"
