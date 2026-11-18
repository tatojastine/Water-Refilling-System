import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function apiOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_API_URL must contain only the backend origin, without an API path or credentials.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use an HTTPS backend origin or HTTP localhost in VITE_API_URL.');
  }
  return url.origin;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredBackend = process.env.VITE_API_URL ?? env.VITE_API_URL;
  const backend = apiOrigin(configuredBackend || 'http://127.0.0.1:8765');

  return {
    plugins: [
      react(),
      {
        name: 'aquarefresh-netlify-api',
        apply: 'build',
        buildStart() {
          if (process.env.NETLIFY === 'true' && !backend.startsWith('https://')) {
            throw new Error('Set VITE_API_URL to the HTTPS Render backend origin in Netlify.');
          }
        },
        generateBundle() {
          if (configuredBackend) {
            this.emitFile({
              type: 'asset',
              fileName: '_redirects',
              source: `/api/* ${backend}/api/:splat 200\n`,
            });
          }
        },
      },
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: !['localhost', '127.0.0.1'].includes(new URL(backend).hostname) } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
    },
  };
});
