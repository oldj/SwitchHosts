#!/usr/bin/env node
/**
 * Lipo the extra cargo bin target(s) into the universal-apple-darwin build
 * so the Tauri bundler can copy them into the app bundle.
 *
 * Why this exists:
 *   `tauri build --target universal-apple-darwin` compiles the crate for
 *   both aarch64 and x86_64, then `lipo`-combines the two slices into one
 *   fat binary — but the Tauri CLI (2.x) does this only for the *main* app
 *   binary (`switchhosts`). Any additional cargo bin target — here
 *   `swh_helper`, the privileged hosts-writing helper from
 *   `src-tauri/src/bin/swh_helper.rs` — is left un-merged. It exists at
 *       target/{aarch64,x86_64}-apple-darwin/release/swh_helper
 *   but NOT at
 *       target/universal-apple-darwin/release/swh_helper
 *   so the bundler, which iterates over *all* bin targets and copies each
 *   from the universal dir into `Contents/MacOS/`, fails with
 *       failed to bundle project Failed to copy binary ... swh_helper ...
 *       does not exist
 *   The single-arch macOS jobs are unaffected — cargo emits swh_helper
 *   straight into their per-arch release dir.
 *
 * Fix: wired up as tauri.conf.json `beforeBundleCommand`, which fires
 *   AFTER the compile + main-binary lipo and BEFORE the bundler copies
 *   binaries. We lipo each extra bin into the universal dir ourselves.
 *
 * Cross-platform & safe on every other build: `beforeBundleCommand` also
 *   runs on the Windows and Linux release jobs (where `node` is present
 *   but `lipo` and the universal dir are not) and on single-arch macOS
 *   builds. It no-ops unless we are on macOS AND the universal target dir
 *   exists, i.e. an actual universal build.
 */

import { existsSync, chmodSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Windows / Linux release jobs run this hook too — nothing to merge there.
if (process.platform !== 'darwin') {
  process.exit(0)
}

const targetRoot = join(root, 'src-tauri', 'target')
const universalDir = join(targetRoot, 'universal-apple-darwin', 'release')

// Single-arch macOS builds (--target {aarch64,x86_64}-apple-darwin) never
// create this dir; only a universal build does, and by the time this hook
// fires the main binary has already been lipo'd into it. No dir → no-op.
if (!existsSync(universalDir)) {
  process.exit(0)
}

// Extra cargo bin targets (besides the main `switchhosts` app binary) that
// Tauri's universal lipo step skips. Keep in sync with src-tauri/src/bin/.
const EXTRA_BINS = ['swh_helper']
const ARCHES = ['aarch64-apple-darwin', 'x86_64-apple-darwin']

for (const bin of EXTRA_BINS) {
  const out = join(universalDir, bin)

  // Idempotent: a re-run — or a future Tauri that learns to lipo extra
  // bins itself — leaves an already-fat binary untouched.
  if (existsSync(out)) {
    console.log(`[universal-helper] ${bin} already present in universal dir`)
    continue
  }

  const inputs = ARCHES.map((arch) => join(targetRoot, arch, 'release', bin))
  const missing = inputs.filter((p) => !existsSync(p))
  if (missing.length > 0) {
    // The per-arch builds must have produced this bin. If they didn't,
    // bundling would fail downstream with the same "does not exist"; fail
    // loudly here with a clearer message instead of shipping a broken app.
    console.error(
      `[universal-helper] cannot lipo ${bin}: missing per-arch build(s):\n  ` +
        missing.join('\n  '),
    )
    process.exit(1)
  }

  console.log(`[universal-helper] lipo ${bin} → ${out}`)
  const res = spawnSync('lipo', ['-create', '-output', out, ...inputs], {
    stdio: 'inherit',
  })
  if (res.error || res.status !== 0) {
    console.error(
      `[universal-helper] lipo failed for ${bin}` +
        (res.error ? `: ${res.error.message}` : ` (exit ${res.status})`),
    )
    process.exit(res.status || 1)
  }

  // lipo's output may not carry the executable bit; the bundler copies and
  // code-signs this as Contents/MacOS/swh_helper, which must be runnable.
  chmodSync(out, 0o755)
}
