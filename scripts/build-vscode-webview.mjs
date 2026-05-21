#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const result = spawnSync('npx', ['vite', 'build', '--config', './vite.vscode.config.mts'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH ?? ''}`,
  },
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log('VS Code webview build complete.')
