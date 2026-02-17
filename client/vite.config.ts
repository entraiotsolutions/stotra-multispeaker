import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: __dirname,
  server: {
    host: '0.0.0.0',
    port: 8080,
    open: true,
    // Proxy API calls to backend server in development
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'es2019',
  },
  // Vite automatically exposes env variables prefixed with VITE_ to import.meta.env
  // Only VITE_LIVEKIT_URL is needed (frontend uses relative API calls: /api/...)
});
