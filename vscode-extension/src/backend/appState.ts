import * as path from 'path'

import { initWasm } from '../core/wasmBridge'
import { applyConfigPatch, loadConfig, saveConfig, type AppConfig } from './storage/config'
import { atomicWrite, ensureDirs, readJsonFile, resolveDefaultPaths, type V5Paths } from './storage/paths'

export interface RuntimeContext {
  panel?: { dispose(): void; reveal(): void }
}

export class AppState {
  readonly paths: V5Paths
  config: AppConfig
  private storeLock = false
  private configLock = false

  constructor(paths: V5Paths = resolveDefaultPaths()) {
    this.paths = paths
    ensureDirs(paths)
    this.config = loadConfig(paths.configFile)
  }

  withStoreLock<T>(fn: () => T): T {
    if (this.storeLock) throw new Error('store lock already held')
    this.storeLock = true
    try {
      return fn()
    } finally {
      this.storeLock = false
    }
  }

  updateConfig(patch: Record<string, unknown>): void {
    if (this.configLock) throw new Error('config lock already held')
    this.configLock = true
    try {
      this.config = applyConfigPatch(this.config, patch)
      saveConfig(this.paths.configFile, this.config)
    } finally {
      this.configLock = false
    }
  }

  reloadConfig(): void {
    this.config = loadConfig(this.paths.configFile)
  }
}

let appState: AppState | undefined
let wasmReady: Promise<void> | undefined

export async function getAppState(): Promise<AppState> {
  if (!wasmReady) {
    wasmReady = initWasm()
  }
  await wasmReady
  if (!appState) {
    appState = new AppState()
  }
  return appState
}

export function readHistoryFile(paths: V5Paths, name: string): unknown[] {
  return readJsonFile<unknown[]>(path.join(paths.historiesDir, name), [])
}

export function writeHistoryFile(paths: V5Paths, name: string, items: unknown[]): void {
  atomicWrite(path.join(paths.historiesDir, name), JSON.stringify(items, null, 2))
}
