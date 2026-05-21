#!/usr/bin/env node
/**
 * Build switchhosts-wasm for the VS Code extension (Node.js target).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const wasmCrate = join(repoRoot, 'src-tauri/crates/switchhosts-wasm')
const outDir = join(repoRoot, 'vscode-extension/wasm/pkg')

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH ?? ''}`,
    },
    ...opts,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function ensureWasmPack() {
  const check = spawnSync('wasm-pack', ['--version'], { stdio: 'pipe' })
  if (check.status === 0) {
    return
  }
  console.log('wasm-pack not found; installing via cargo...')
  run('cargo', ['install', 'wasm-pack', '--locked'])
}

console.log('Adding wasm32-unknown-unknown target if needed...')
run('rustup', ['target', 'add', 'wasm32-unknown-unknown'])

ensureWasmPack()

console.log(`Building WASM → ${outDir}`)
run('wasm-pack', [
  'build',
  wasmCrate,
  '--target',
  'nodejs',
  '--out-dir',
  outDir,
  '--out-name',
  'switchhosts_wasm',
])

if (!existsSync(join(outDir, 'switchhosts_wasm.js'))) {
  console.error('WASM build did not produce switchhosts_wasm.js')
  process.exit(1)
}

console.log('WASM build complete.')
