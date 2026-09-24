import { defineConfig } from 'vite';

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import importToCDN from 'vite-plugin-cdn-import'

export default defineConfig({
  base: './', // use relative paths in the bundled html

  plugins: [
/*
    importToCDN({
      modules: [
        {
          name: 'fuse.js',
          var: 'Fuse',
          path: 'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/7.5.0/fuse-worker.mjs',
        },
        {
          name: 'maptalks-gl',
          var: 'maptalks',
          path: 'https://cdn.jsdelivr.net/npm/maptalks-gl@0.124.4/dist/maptalks-gl.min.js',
          css: 'https://cdn.jsdelivr.net/npm/maptalks-gl@0.124.4/dist/maptalks-gl.css',
        },
        {
          name: '@fortawesome/fontawesome-free',
          var: 'FontAwesome',
          path: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/js/all.min.js',
        },
      ],
    }),
*/
    // Force type="module" on the fuse-worker script tag in the built HTML
    {
      name: 'add-module-type-to-fuse-worker',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(/<script([^>]*fuse-worker\.mjs[^>]*)>/g, (match, attrs) => {
          if (/type\s*=/.test(attrs)) return match; // already has a type
          return `<script type="module"${attrs}>`;
        });
      }
    },

  ],

  //appType: 'mpa', 

  server: {
    port: 3000,
    open: true,
    watch: {
        ignored: [
        '**/archive/**',
        '**/examples/**',
        '**/submodules/**',
      ]
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

});
