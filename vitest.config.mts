import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [ react() ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [ 'test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx' ],
    setupFiles: [ './test/setup.ts' ],
  },
})
