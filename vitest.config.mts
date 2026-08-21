import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

const projectRoot = process.cwd()

export default defineConfig({
  root: projectRoot,
  server: {
    fs: {
      allow: [ projectRoot, fs.realpathSync(projectRoot) ],
    },
  },
  plugins: [ react() ],
  resolve: {
    preserveSymlinks: true,
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [ 'test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx' ],
    setupFiles: [ './test/setup.ts' ],
  },
})
