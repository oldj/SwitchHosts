import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  aggregate_selected_content_wasm,
  legacy_root_to_v5_wasm,
  ping,
  remove_duplicate_records_wasm,
  v5_root_to_legacy_wasm,
} from '../../wasm/pkg/switchhosts_wasm'

export interface HostNode {
  id: string
  title?: string
  type?: string
  on?: boolean
  children?: HostNode[]
  [key: string]: unknown
}

export interface BasicData {
  list: HostNode[]
  dataDir: string
  wasmPing: string
}

const DATA_DIR = path.join(os.homedir(), '.SwitchHosts')

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function readEntryContents(entriesDir: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(entriesDir)) {
    return out
  }
  for (const name of fs.readdirSync(entriesDir)) {
    if (!name.endsWith('.hosts')) {
      continue
    }
    const id = name.slice(0, -'.hosts'.length)
    const filePath = path.join(entriesDir, name)
    out[id] = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  }
  return out
}

function loadCollapsedNodeIds(dataDir: string): string[] {
  const statePath = path.join(dataDir, 'internal', 'state.json')
  const state = readJsonFile<{ tree?: { collapsedNodeIds?: string[] } }>(statePath, {})
  return state.tree?.collapsedNodeIds ?? []
}

function loadLegacyList(dataDir: string): HostNode[] {
  const manifestPath = path.join(dataDir, 'manifest.json')
  const manifest = readJsonFile<{ root?: unknown[] }>(manifestPath, { root: [] })
  const root = Array.isArray(manifest.root) ? manifest.root : []
  const collapsed = loadCollapsedNodeIds(dataDir)
  const legacyJson = v5_root_to_legacy_wasm(JSON.stringify(root), JSON.stringify(collapsed))
  return JSON.parse(legacyJson) as HostNode[]
}

function loadRemoveDuplicateFlag(dataDir: string): boolean {
  const configPath = path.join(dataDir, 'internal', 'config.json')
  const config = readJsonFile<{ remove_duplicate_records?: boolean }>(configPath, {})
  return config.remove_duplicate_records === true
}

export async function initWasm(): Promise<void> {
  // wasm-pack nodejs target initializes on first import; ping verifies load.
  if (ping() !== 'pong') {
    throw new Error('switchhosts WASM failed to initialize')
  }
}

export function getBasicData(): BasicData {
  const list = loadLegacyList(DATA_DIR)
  return {
    list,
    dataDir: DATA_DIR,
    wasmPing: ping(),
  }
}

export function getAggregatedHostsContent(list: HostNode[]): string {
  const entries = readEntryContents(path.join(DATA_DIR, 'entries'))
  const removeDup = loadRemoveDuplicateFlag(DATA_DIR)
  const lineEnding = os.EOL
  return aggregate_selected_content_wasm(
    JSON.stringify(list),
    JSON.stringify(entries),
    removeDup,
    lineEnding,
  )
}

export function normalizeHostsContent(content: string): string {
  return remove_duplicate_records_wasm(content, os.EOL)
}

export function serializeListForDisk(list: HostNode[]): {
  root: unknown[]
  collapsedNodeIds: string[]
} {
  const payloadJson = legacy_root_to_v5_wasm(JSON.stringify(list))
  return JSON.parse(payloadJson) as { root: unknown[]; collapsedNodeIds: string[] }
}

export { ping }
