import fs from 'fs';

function watchFiles(patterns) {
  return { name: 'watch-files', configureServer(s) {
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
      const mask = new RegExp('^' + a.at(-1).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      const walk = (d, i) => {
        if (!fs.existsSync(d)) return;
        if (i < dirs.length) {
          for (const x of fs.readdirSync(d, { withFileTypes: true }))
            if (x.isDirectory() && (dirs[i] === '*' || x.name === dirs[i])) walk(`${d}/${x.name}`, i + 1);
        } else {
          for (const f of fs.readdirSync(d).filter(f => mask.test(f))) {
            const file = `${d}/${f}`;
            try { seen.set(file, fs.statSync(file).mtimeMs); } catch {}
            kill.push(fs.watch(file, (e) => e === 'change' && fire(file)));
          }
        }
      };
      walk(dirs[0], 1);
    }

    s.httpServer?.on('close', () => kill.forEach(w => w.close()));
  }};
}

export default {
  plugins: [
    watchFiles(['submodules/*/data/*.json', 'submodules/*/scripts/*.json']),
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
        assetFileNames: (a) => a.name?.endsWith('.css') ? 'maps.min.css' : '[name].[ext]',
      },
    },
  },
  base: './',
  optimizeDeps: { entries: ['index.html'] },
};
