import * as path from 'path'
import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(path.resolve(__dirname, 'assets', '*.png')),
          dest: 'assets',
        },
        {
          src: normalizePath(path.resolve(__dirname, 'src', 'assets', '*.png')),
          dest: 'assets',
        },
      ],
    }),
  ],
  // root: path.join(__dirname, 'src', 'main'),
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: path.join(__dirname, 'src', 'main', 'main.ts'),
        preload: path.join(__dirname, 'src', 'main', 'preload.ts'),
        // renderer: path.join(__dirname, 'src', 'renderer', 'index.html'),
      },
    },
    lib: {
      entry: path.join(__dirname, 'src', 'main', 'main.ts'),
      name: 'main',
      formats: ['cjs'],
      // fileName: (format) => `main.${format}.js`,
      fileName: (format) => `main.js`,
    },
    outDir: path.join(__dirname, 'build'),
    minify: true,
    ssr: true,
    emptyOutDir: false,
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
    },
  },
})
