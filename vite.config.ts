import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// Dev-only: serve the local `seed_properties/` folder (panoramas, floor plans, and
// generated tour.json files) over `/seed_properties/*` so the spatial-tour harness
// (LocalTourPage at /local/:propertyId) can render real tours without uploading
// images to Cloudinary. This middleware is NOT part of the production build.
function servePropertiesDevDir(): PluginOption {
  const root = path.resolve(__dirname, 'seed_properties');
  const MIME: Record<string, string> = {
    '.webp': 'image/webp',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return {
    name: 'serve-properties-dev-dir',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/seed_properties', (req, res, next) => {
        try {
          const rawUrl = (req.url ?? '').split('?')[0];
          const rel = decodeURIComponent(rawUrl).replace(/^\/+/, '');
          // Resolve and confine to the seed_properties dir (no path traversal).
          const filePath = path.resolve(root, rel);
          if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return next();
          }
          const ext = path.extname(filePath).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(filePath).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), servePropertiesDevDir()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3600',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          tanstack: ['@tanstack/react-query'],
          charts: ['recharts'],
          viewer: ['@photo-sphere-viewer/core', '@photo-sphere-viewer/markers-plugin'],
        },
      },
    },
  },
});
