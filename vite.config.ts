import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'electron/main.ts',
        vite: {
          build: {
            sourcemap: command === 'serve',
            minify: command !== 'serve',
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'path', 'fs', 'url', 'electron-store', 'electron-log'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            sourcemap: command === 'serve' ? 'inline' : undefined,
            minify: command !== 'serve',
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
        onstart(options) {
          // Reload the renderer after preload recompiles
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
}))
