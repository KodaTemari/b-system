# ボッチャスコアボードシステム - デプロイスクリプト（Windows PowerShell版）
# 使い方: .\deploy.ps1 -Server "ユーザー名@boccia.app"
# 例: .\deploy.ps1 -Server "user@boccia.app"

param(
    [Parameter(Mandatory=$true)]
    [string]$Server,
    
    [string]$RemoteDir = "/var/www/boccia-app"
)

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

Write-Info "デプロイを開始します: $Server"

# ステップ1: ローカルでビルド
Write-Info "フロントエンドをビルド中..."
npm run build

if (-not (Test-Path "dist")) {
    Write-Err "dist/ディレクトリが見つかりません。ビルドが失敗した可能性があります。"
    exit 1
}

Write-Info "ビルド完了"

# ステップ2: サーバーにディレクトリを作成
Write-Info "サーバーにディレクトリを作成中..."
ssh $Server "mkdir -p $RemoteDir/dist $RemoteDir/server"

# ステップ3: ファイルをアップロード
# 注意: scpまたはWinSCPなどのツールが必要
Write-Info "dist/をアップロード中..."
Write-Warn "PowerShellではrsyncが使えません。以下のいずれかの方法でアップロードしてください："
Write-Host ""
Write-Host "方法1: WSL（Windows Subsystem for Linux）を使用" -ForegroundColor Cyan
Write-Host "  wsl bash deploy.sh $Server" -ForegroundColor White
Write-Host ""
Write-Host "方法2: scpコマンドを使用" -ForegroundColor Cyan
Write-Host "  scp -r dist/* ${Server}:${RemoteDir}/dist/" -ForegroundColor White
Write-Host "  scp -r server/* ${Server}:${RemoteDir}/server/" -ForegroundColor White
Write-Host ""
Write-Host "方法3: WinSCPなどのGUIツールを使用" -ForegroundColor Cyan
Write-Host ""

$continue = Read-Host "ファイルのアップロードが完了したら 'y' を入力してください (y/n)"

if ($continue -ne "y") {
    Write-Info "デプロイを中断しました"
    exit 0
}

# ステップ4: サーバー側で依存関係をインストール
Write-Info "サーバー側で依存関係をインストール中..."
ssh $Server "cd $RemoteDir/server && npm install --production"

# ステップ5: PM2でサーバーを再起動
Write-Info "Node.jsサーバーを再起動中..."
ssh $Server "pm2 restart boccia-api || pm2 start $RemoteDir/server/server.js --name boccia-api"
ssh $Server "pm2 save"

# ステップ6: 動作確認
Write-Info "動作確認中..."
try {
    $response = Invoke-WebRequest -Uri "https://boccia.app" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Info "✅ デプロイ成功！ https://boccia.app で確認できます"
    } else {
        Write-Warn "⚠️ サイトの応答が正常ではありません（HTTP $($response.StatusCode)）"
    }
} catch {
    Write-Warn "⚠️ サイトへの接続に失敗しました: $($_.Exception.Message)"
    Write-Warn "手動で確認してください: https://boccia.app"
}

Write-Info "デプロイ完了"
