import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  server: {
    port: 1337,
    proxy: {
      '/api': {
        target: 'http://localhost:1338',
        changeOrigin: true,
      },
      '/ws/terminal': {
        target: 'http://localhost:1338',
        ws: true,
        changeOrigin: true,
        on: {
          error: () => {},
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
