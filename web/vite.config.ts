import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

const chunkGroups: Record<string, string[]> = {
  'react-vendor': ['react', 'react-dom'],
  router: ['react-router', 'react-router-dom'],
  tanstack: ['@tanstack/react-query', '@tanstack/react-query-devtools'],
  charts: ['recharts'],
  forms: ['@hookform/resolvers', 'react-hook-form', 'zod'],
  'three-vendor': ['three'],
  viewer: [
    '@photo-sphere-viewer/core',
    '@photo-sphere-viewer/gyroscope-plugin',
    '@photo-sphere-viewer/markers-plugin',
    '@photo-sphere-viewer/stereo-plugin',
  ],
  'ui-vendor': [
    '@radix-ui',
    'class-variance-authority',
    'clsx',
    'lucide-react',
    'tailwind-merge',
  ],
  network: ['@supabase/supabase-js', 'axios'],
};

function matchesPackage(id: string, packageName: string): boolean {
  const normalizedId = id.split(path.sep).join('/');
  const packageRoot = `/node_modules/${packageName}`;

  return normalizedId.includes(`${packageRoot}/`) || normalizedId.endsWith(packageRoot);
}

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  for (const [chunkName, packages] of Object.entries(chunkGroups)) {
    if (packages.some((packageName) => matchesPackage(id, packageName))) {
      return chunkName;
    }
  }

  return undefined;
}

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
      server.middlewares.use('/seed_properties', async (req, res, next) => {
        try {
          const rawUrl = (req.url ?? '').split('?')[0];
          const rel = decodeURIComponent(rawUrl).replace(/^\/+/, '');
          // Resolve and confine to the seed_properties dir (no path traversal).
          const filePath = path.resolve(root, rel);
          const relativePath = path.relative(root, filePath);

          if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            return next();
          }

          const fileStat = await stat(filePath).catch(() => null);
          if (!fileStat?.isFile()) {
            return next();
          }

          const ext = path.extname(filePath).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          createReadStream(filePath)
            .on('error', () => {
              if (res.headersSent) {
                res.destroy();
                return;
              }

              next();
            })
            .pipe(res);
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
        manualChunks,
      },
    },
  },
});
