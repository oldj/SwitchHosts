import * as fs from 'fs/promises'
import * as path from 'path'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const copyMainAssetsPlugin = () => ({
  name: 'copy-main-assets',
  apply: 'build' as const,
  async closeBundle() {
    const outAssetsDir = path.resolve(__dirname, 'build', 'assets')
    const srcDirs = [path.resolve(__dirname, 'assets'), path.resolve(__dirname, 'src', 'assets')]

    await fs.mkdir(outAssetsDir, { recursive: true })

    for (const srcDir of srcDirs) {
      let entries: string[] = []
      try {
        entries = await fs.readdir(srcDir)
      } catch {
        continue
      }

      for (const entry of entries) {
        if (!entry.endsWith('.png')) {
          continue
        }
        await fs.copyFile(path.join(srcDir, entry), path.join(outAssetsDir, entry))
      }
    }
  },
})

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    copyMainAssetsPlugin(),
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
