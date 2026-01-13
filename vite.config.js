import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'

// ローカルIPアドレスを取得する関数
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部ループバックでない、かつ有効なアドレス
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

// IPアドレス表示プラグイン
const ipDisplayPlugin = () => {
  return {
    name: 'ip-display',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const localIP = getLocalIPAddress()
        const port = server.config.server.port || 5173
        console.log(`\n  Local:   http://localhost:${port}`)
        console.log(`  Network: http://${localIP}:${port}`)
        console.log(`  IP: ${localIP}:${port}\n`)
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ipDisplayPlugin()],
  publicDir: 'public',
  server: {
    host: '0.0.0.0', // ネットワーク全体からアクセス可能にする
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/data': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  }
})
