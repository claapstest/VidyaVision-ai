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
          proxy.on('error', (err) => {
            // Gracefully ignore ECONNRESET / ECONNREFUSED during server reloads
            if (err.code !== 'ECONNRESET' && err.code !== 'ECONNREFUSED') {
              console.warn('[vite-proxy]', err.message);
            }
          });
        }
      }
    }
  }
})
