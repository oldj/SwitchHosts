import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [ tsconfigPaths() ],
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [ 'test/**/*.test.ts', 'src/**/*.test.ts' ],
    setupFiles: [ './test/setup.ts' ],
  },
})
