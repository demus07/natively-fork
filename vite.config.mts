import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart: () => {
          // Dev startup is managed by scripts/dev.mjs so Electron is spawned only once.
        },
        vite: {
          build: {
            outDir: 'dist/electron',
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'bufferutil', 'utf-8-validate', 'ws']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart: (options) => options.reload(),
        vite: {
          build: {
            outDir: 'dist/electron',
            rollupOptions: {
              output: {
                format: 'cjs'
              }
            }
          }
        }
      }
    ])
  ],
  server: {
    port: 5180
  },
  build: {
    outDir: 'dist/renderer'
  },
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer')
    }
  }
});