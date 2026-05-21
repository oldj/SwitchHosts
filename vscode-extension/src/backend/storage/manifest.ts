import * as fs from 'fs'
import * as path from 'path'

import {
  aggregate_selected_content_wasm,
  legacy_root_to_v5_wasm,
  v5_root_to_legacy_wasm,
} from '../../core/wasmBridge'
import { atomicWrite, normalizeToLf, readJsonFile, type V5Paths } from './paths'

export type JsonNode = Record<string, unknown>

export interface Manifest {
  root: JsonNode[]
}

export function loadManifest(paths: V5Paths): Manifest {
  const raw = readJsonFile<{ root?: unknown[] }>(paths.manifestFile, { root: [] })
  const root = Array.isArray(raw.root) ? raw.root : []
  const state = readJsonFile<{ tree?: { collapsedNodeIds?: string[] } }>(paths.stateFile, {})
  const collapsed = state.tree?.collapsedNodeIds ?? []
  const legacyJson = v5_root_to_legacy_wasm(JSON.stringify(root), JSON.stringify(collapsed))
  return { root: JSON.parse(legacyJson) as JsonNode[] }
}

export function saveManifest(paths: V5Paths, manifest: Manifest): void {
  const payloadJson = legacy_root_to_v5_wasm(JSON.stringify(manifest.root))
  const payload = JSON.parse(payloadJson) as { root: unknown[]; collapsedNodeIds: string[] }

  const state = readJsonFile<Record<string, unknown>>(paths.stateFile, {})
  const tree = (state.tree as Record<string, unknown> | undefined) ?? {}
  state.tree = { ...tree, collapsedNodeIds: payload.collapsedNodeIds }
  atomicWrite(paths.stateFile, JSON.stringify(state, null, 2))

  const envelope = {
    format: 'switchhosts-data',
    schemaVersion: 1,
    root: payload.root,
  }
  atomicWrite(paths.manifestFile, JSON.stringify(envelope, null, 2))
}

export function findNode(nodes: JsonNode[], id: string): JsonNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const children = node.children as JsonNode[] | undefined
    if (children?.length) {
      const found = findNode(children, id)
      if (found) return found
    }
  }
  return null
}

export function removeNode(
  nodes: JsonNode[],
  id: string,
  parentId: string | null = null,
): { node: JsonNode; parentId: string | null } | null {
  const index = nodes.findIndex((n) => n.id === id)
  if (index >= 0) {
    const [node] = nodes.splice(index, 1)
    return { node, parentId }
  }
  for (const node of nodes) {
    const children = node.children as JsonNode[] | undefined
    if (children?.length && typeof node.id === 'string') {
      const result = removeNode(children, id, node.id)
      if (result) return result
    }
  }
  return null
}

export function insertNode(nodes: JsonNode[], node: JsonNode, parentId?: string | null): void {
  if (parentId) {
    const parent = findNode(nodes, parentId)
    if (parent && parent.type === 'folder') {
      const children = (parent.children as JsonNode[] | undefined) ?? []
      children.push(node)
      parent.children = children
      return
    }
  }
  nodes.push(node)
}

export function collectContentIds(nodes: JsonNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    const type = String(node.type ?? 'local')
    if ((type === 'local' || type === 'remote') && typeof node.id === 'string' && node.id !== '0') {
      out.push(node.id)
    }
    const children = node.children as JsonNode[] | undefined
    if (children?.length) collectContentIds(children, out)
  }
  return out
}

export function readEntry(entriesDir: string, id: string): string {
  validateEntryId(id)
  const filePath = path.join(entriesDir, `${id}.hosts`)
  if (!fs.existsSync(filePath)) return ''
  return normalizeToLf(fs.readFileSync(filePath, 'utf8'))
}

export function writeEntry(entriesDir: string, id: string, content: string): void {
  validateEntryId(id)
  const filePath = path.join(entriesDir, `${id}.hosts`)
  atomicWrite(filePath, normalizeToLf(content))
}

export function deleteEntry(entriesDir: string, id: string): void {
  validateEntryId(id)
  const filePath = path.join(entriesDir, `${id}.hosts`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function validateEntryId(id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0')) {
    throw new Error(`illegal entry id: ${id}`)
  }
}

export function readAllEntries(entriesDir: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(entriesDir)) return out
  for (const name of fs.readdirSync(entriesDir)) {
    if (!name.endsWith('.hosts')) continue
    const id = name.slice(0, -'.hosts'.length)
    out[id] = readEntry(entriesDir, id)
  }
  return out
}

export function aggregateSelectedContent(
  list: JsonNode[],
  paths: V5Paths,
  removeDuplicate: boolean,
): string {
  const entries = readAllEntries(paths.entriesDir)
  const lineEnding = process.platform === 'win32' ? '\r\n' : '\n'
  return aggregate_selected_content_wasm(
    JSON.stringify(list),
    JSON.stringify(entries),
    removeDuplicate,
    lineEnding,
  )
}

export interface TrashcanItem extends Record<string, unknown> {}

export function loadTrashcan(trashcanFile: string): TrashcanItem[] {
  const raw = readJsonFile<{ items?: TrashcanItem[] }>(trashcanFile, { items: [] })
  return Array.isArray(raw.items) ? raw.items : []
}

export function saveTrashcan(trashcanFile: string, items: TrashcanItem[]): void {
  atomicWrite(
    trashcanFile,
    JSON.stringify(
      {
        format: 'switchhosts-trashcan',
        schemaVersion: 1,
        items,
      },
      null,
      2,
    ),
  )
}

export function findTrashcanIndex(items: TrashcanItem[], id: string): number {
  return items.findIndex((item) => {
    const data = item.data as JsonNode | undefined
    return data?.id === id
  })
}
