import fs from 'fs';
import path from 'path';

function watchFiles(patterns) {
  return {name:'watch-files',configureServer(s) {
    for (const p of patterns) {
      const a=p.split('/'), dirs=a.slice(0,-1), mask=new RegExp('^'+a.at(-1).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');
      const walk=(d,i)=>{
        if (!fs.existsSync(d)) return;
        if (i<dirs.length) {
          for (const x of fs.readdirSync(d,{withFileTypes:true})) if (x.isDirectory() && (dirs[i]==='*'||x.name===dirs[i])) walk(`${d}/${x.name}`,i+1);
        } else for (const f of fs.readdirSync(d).filter(f=>mask.test(f))) fs.watch(`${d}/${f}`,()=>s.ws.send({type:'full-reload'}));
      };
      walk(dirs[0],1);
    }
  }};
}

export default {
  plugins: [
    watchFiles([
      'submodules/*/data/*.json',
      'submodules/*/scripts/*.json',
    ])  
  ],
  server: {
    port: 3000,
    open: true,
    watch: {
      ignored: /[\\/]((archive|examples|submodules|lib))[\\/]/,
    },
    hmr: {
      overlay: false,
    },
  },

  build: {
    outDir: 'dist',

    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'maps.min.js',
        chunkFileNames: '[name].min.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'maps.min.css';
          }
          return '[name].[ext]';
        }
      }
    },
  },

  optimizeDeps: {
    entries: ['index.html']
  },

};
