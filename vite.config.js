import fs from 'fs';
import { defineConfig } from 'vite';
import importToCDN from 'vite-plugin-cdn-import';

const FUSE_WORKER_CLASS_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/7.5.0/fuse-worker.mjs';

const FUSE_WORKER_REMOTE_CDN =
  'https://cdn.jsdelivr.net/npm/fuse.js@7.5.0/dist/fuse.worker.mjs';

function fuseWorkerCdn() {
  return {
    name: 'fuse-worker-cdn',
    enforce: 'pre',
    resolveId(s) {
      if (s === 'fuse.js/worker') {
        return { id: FUSE_WORKER_CLASS_CDN, external: true };
      }
      return null;
    },
  };
}

function watchFiles(patterns) {
  return {
    name: 'watch-files',
    configureServer(s) {
      const seen = new Map();
      const kill = [];
      const fire = (f) => {
        try {
          const m = fs.statSync(f).mtimeMs;
          if (seen.get(f) === m) return;
          seen.set(f, m);
        } catch {}
        s.ws.send({ type: 'full-reload' });
      };

      for (const p of patterns) {
        const a = p.split('/'), dirs = a.slice(0, -1);
        const mask = new RegExp(
          '^' +
            a.at(-1)
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '.*') +
            '$'
        );
        const walk = (d, i) => {
          if (!fs.existsSync(d)) return;
          if (i < dirs.length) {
            for (const x of fs.readdirSync(d, { withFileTypes: true }))
              if (x.isDirectory() && (dirs[i] === '*' || x.name === dirs[i]))
                walk(`${d}/${x.name}`, i + 1);
          } else {
            for (const f of fs.readdirSync(d).filter((f) => mask.test(f))) {
              const file = `${d}/${f}`;
              try {
                seen.set(file, fs.statSync(file).mtimeMs);
              } catch {}
              kill.push(fs.watch(file, (e) => e === 'change' && fire(file)));
            }
          }
        };
        walk(dirs[0], 1);
      }

      s.httpServer?.on('close', () => kill.forEach((w) => w.close()));
    },
  };
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const isProd = !isDev;

  return {
    define: {
      __FUSE_WORKER_CDN__: JSON.stringify(FUSE_WORKER_REMOTE_CDN),
    },

    plugins: [
      watchFiles(['submodules/*/data/*.json', 'submodules/*/scripts/*.json']),

      // Prod only: keep `fuse.js/worker` external so it's NOT bundled.
      // Dev resolves it from node_modules normally.
      ...(isProd ? [fuseWorkerCdn()] : []),

      importToCDN({
        modules: [
          {
            name: 'maptalks-gl',
            var: 'maptalks',
            path: 'https://cdn.jsdelivr.net/npm/maptalks-gl@0.124.4/dist/maptalks-gl.min.js',
            css: 'https://cdn.jsdelivr.net/npm/maptalks-gl@0.124.4/dist/maptalks-gl.css',
          },
          {
            name: '@fortawesome/fontawesome-free/js/all.js',
            var: 'FontAwesome',
            path: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/js/all.min.js',
            css: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/css/all.min.css',
          },
        ],
      }),
    ],

    server: {
      port: 3000,
      open: true,
      watch: { ignored: /[\\/]((archive|examples|submodules|lib))[\\/]/ },
      hmr: { overlay: false },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'maps.min.js',
          chunkFileNames: '[name].min.js',
          assetFileNames: (a) =>
            a.name?.endsWith('.css') ? 'maps.min.css' : '[name].[ext]',
        },
      },
    },
    base: './',
    optimizeDeps: {
      entries: ['index.html'],
      exclude: ['fuse.js/worker'],
    },
  };
});
