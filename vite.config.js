import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'force-mjs-mime-type',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // ✅ FIX: Intercepts requests for .mjs files and forces the correct header
          if (req.url.includes('/ort/') && req.url.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            // Allow cross-origin for WASM threads
            res.setHeader('Access-Control-Allow-Origin', '*');
          }
          next();
        });
      },
    },
  ],

  // ✅ Worker configuration for Transformers.js v3
  worker: {
    format: 'es',
  },

  server: {
    fs: {
      strict: false,
    },
    // ✅ Required for high-performance WASM (SharedArrayBuffer)
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  optimizeDeps: {
    // Prevents Vite from trying to "bundle" the CDN library
    exclude: ['@huggingface/transformers'],
  },
});