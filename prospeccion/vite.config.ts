import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  base: '/static/prospeccion-app/',
  build: {
    outDir: '../public/prospeccion-app',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'prospeccion.js',
        chunkFileNames: 'prospeccion-[name].js',
        assetFileNames: 'prospeccion-[name][extname]',
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
      '/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nominatim/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            req.setHeader('User-Agent', 'ProspectAI/0.1 (ReservAI interno)');
          });
        },
      },
    },
  },
});
