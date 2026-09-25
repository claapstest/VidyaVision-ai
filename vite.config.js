import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          const ignoredCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT']);
          proxy.on('error', (err) => {
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
  }
})
