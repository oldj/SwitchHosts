import react from '@vitejs/plugin-react'
import * as path from 'path'
import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(path.resolve(__dirname, 'src', 'assets', 'logoTemplate*.png')),
          dest: 'assets',
        },
      ],
    }),
  ],
  base: './',
  root: path.join(__dirname, 'src', 'renderer'),
  define: {
    'import.meta.env.VITE_RUNTIME': JSON.stringify('vscode'),
  },
  build: {
    rolldownOptions: {
      input: {
        renderer: path.join(__dirname, 'src', 'renderer', 'index.html'),
      },
    },
    outDir: path.join(__dirname, 'vscode-extension', 'media', 'app'),
    minify: true,
    ssr: false,
    emptyOutDir: true,
  },
  css: {
    modules: {
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@root': path.resolve(__dirname),
      '@assets': path.resolve(__dirname, 'assets'),
      '@src': path.resolve(__dirname, 'src'),
      '@common': path.resolve(__dirname, 'src', 'common'),
      '@renderer': path.resolve(__dirname, 'src', 'renderer'),
      '@styles': path.resolve(__dirname, 'src', 'renderer', 'styles'),
      '@renderer/core/agent': path.resolve(__dirname, 'src', 'renderer', 'core', 'agent.vscode.ts'),
    },
  },
})
