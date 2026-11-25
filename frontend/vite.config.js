import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const backendPort = env.PORT || 5005

  return {
    root: __dirname,
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: true,
      port: 5174,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            const ignoredCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT']);
            proxy.on('error', (err, req, res) => {
              if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Backend server is initializing. Retrying...', code: err.code }));
                return;
              }
              if (!ignoredCodes.has(err.code)) {
                console.warn('[vite-proxy]', err.message);
              }
            });
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              socket.on('error', (err) => {
                if (!ignoredCodes.has(err.code)) {
                  console.warn('[vite-proxy-ws]', err.message);
                }
              });
            });
          }
        }
      }
    },
    build: {
      outDir: path.resolve(__dirname, '..', 'dist'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/exceljs')) {
              return 'vendor-exceljs';
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
          }
        }
      }
    }
  }
})
