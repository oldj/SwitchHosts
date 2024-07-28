import react from '@vitejs/plugin-react'
import * as path from 'path'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths(), svgr({}), react()],
  base: './',
  root: path.join(__dirname, 'src', 'renderer'),
  build: {
    rollupOptions: {
      input: {
        renderer: path.join(__dirname, 'src', 'renderer', 'index.html'),
      },
    },
    outDir: path.join(__dirname, 'build'),
    minify: true,
    ssr: false,
    emptyOutDir: false,
  },
  css: {
    modules: {
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@root': path.resolve(__dirname),
      '@assets': path.resolve(__dirname, 'assets'),
      '@src': path.resolve(__dirname, 'src'),
      '@common': path.resolve(__dirname, 'src', 'common'),
      '@main': path.resolve(__dirname, 'src', 'main'),
      '@renderer': path.resolve(__dirname, 'src', 'renderer'),
      '@styles': path.resolve(__dirname, 'src', 'renderer', 'styles'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8220,
  },
})
