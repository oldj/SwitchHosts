import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

import { AppState, getAppState, readHistoryFile, writeHistoryFile, type RuntimeContext } from './appState'
import {
  applyHostsSelection,
  exportBackup,
  importBackup,
  loadApplyHistory,
  saveApplyHistory,
} from './storage/apply'
import { getConfigKey } from './storage/config'
import {
  aggregateSelectedContent,
  deleteEntry,
  findNode,
  findTrashcanIndex,
  insertNode,
  loadManifest,
  loadTrashcan,
  readEntry,
  removeNode,
  saveManifest,
  saveTrashcan,
  writeEntry,
  type JsonNode,
} from './storage/manifest'
import { readJsonFile, systemHostsPath } from './storage/paths'

const VERSION = '5.0.0'

export async function dispatchCommand(
  cmd: string,
  args: unknown[],
  ctx: RuntimeContext,
): Promise<unknown> {
  const state = await getAppState()

  switch (cmd) {
    case 'ping':
      return 'pong'
    case 'migration_status':
      return false
    case 'get_basic_data': {
      const manifest = loadManifest(state.paths)
      const trashcan = loadTrashcan(state.paths.trashcanFile)
      return { list: manifest.root, trashcan, version: VERSION }
    }
    case 'config_all':
      return state.config
    case 'config_get':
      return getConfigKey(state.config, String(args[0] ?? ''))
    case 'config_set': {
      const key = String(args[0] ?? '')
      state.updateConfig({ [key]: args[1] ?? null })
      return null
    }
    case 'config_update': {
      const patch = (args[0] ?? {}) as Record<string, unknown>
      state.updateConfig(patch)
      return null
    }
    case 'get_list':
      return loadManifest(state.paths).root
    case 'get_item_from_list': {
      const id = String(args[0] ?? '')
      return findNode(loadManifest(state.paths).root, id) ?? null
    }
    case 'get_content_of_list': {
      const list = normalizeListArg(args[0])
      const removeDup = Boolean(state.config.remove_duplicate_records)
      return aggregateSelectedContent(list, state.paths, removeDup)
    }
    case 'set_list': {
      const list = normalizeListArg(args[0])
      return state.withStoreLock(() => {
        saveManifest(state.paths, { root: list })
        return null
      })
    }
    case 'move_to_trashcan':
      return state.withStoreLock(() => {
        moveIdsToTrashcan(state, [String(args[0] ?? '')])
        return null
      })
    case 'move_many_to_trashcan':
      return state.withStoreLock(() => {
        moveIdsToTrashcan(state, normalizeStringArray(args[0]))
        return null
      })
    case 'get_trashcan_list':
      return loadTrashcan(state.paths.trashcanFile)
    case 'clear_trashcan':
      return state.withStoreLock(() => {
        const items = loadTrashcan(state.paths.trashcanFile)
        for (const item of items) {
          const data = item.data as JsonNode | undefined
          if (data?.id && typeof data.id === 'string') {
            deleteEntry(state.paths.entriesDir, data.id)
          }
        }
        saveTrashcan(state.paths.trashcanFile, [])
        return null
      })
    case 'delete_item_from_trashcan': {
      const id = String(args[0] ?? '')
      return state.withStoreLock(() => {
        const items = loadTrashcan(state.paths.trashcanFile)
        const index = findTrashcanIndex(items, id)
        if (index < 0) return false
        deleteEntry(state.paths.entriesDir, id)
        items.splice(index, 1)
        saveTrashcan(state.paths.trashcanFile, items)
        return true
      })
    }
    case 'restore_item_from_trashcan': {
      const id = String(args[0] ?? '')
      return state.withStoreLock(() => {
        const items = loadTrashcan(state.paths.trashcanFile)
        const index = findTrashcanIndex(items, id)
        if (index < 0) return false
        const item = items[index]
        const data = item.data as JsonNode
        const parentId = (item.parent_id as string | null | undefined) ?? null
        const manifest = loadManifest(state.paths)
        insertNode(manifest.root, data, parentId)
        saveManifest(state.paths, manifest)
        items.splice(index, 1)
        saveTrashcan(state.paths.trashcanFile, items)
        return true
      })
    }
    case 'get_hosts_content':
      return readEntry(state.paths.entriesDir, String(args[0] ?? ''))
    case 'set_hosts_content':
      writeEntry(state.paths.entriesDir, String(args[0] ?? ''), String(args[1] ?? ''))
      return null
    case 'get_system_hosts':
      return readSystemHostsSafe()
    case 'get_path_of_system_hosts':
      return systemHostsPath()
    case 'apply_hosts_selection':
      return applyHostsSelection(state.paths, String(args[0] ?? ''))
    case 'get_apply_history':
      return loadApplyHistory(state.paths)
    case 'delete_apply_history_item': {
      const id = String(args[0] ?? '')
      const items = loadApplyHistory(state.paths).filter(
        (item) => (item as { id?: string }).id !== id,
      )
      saveApplyHistory(state.paths, items)
      return null
    }
    case 'cmd_get_history_list':
      return readHistoryFile(state.paths, 'cmd-after-apply.json')
    case 'cmd_delete_history_item': {
      const id = String(args[0] ?? '')
      const items = readHistoryFile(state.paths, 'cmd-after-apply.json').filter(
        (item) => (item as { id?: string }).id !== id,
      )
      writeHistoryFile(state.paths, 'cmd-after-apply.json', items)
      return null
    }
    case 'cmd_clear_history':
      writeHistoryFile(state.paths, 'cmd-after-apply.json', [])
      return null
    case 'get_data_dir':
      return state.paths.root
    case 'update_tray_title':
    case 'dark_mode_toggle':
      return null
    case 'hide_main_window':
      ctx.panel?.dispose()
      return null
    case 'focus_main_window':
      ctx.panel?.reveal()
      return null
    case 'quit_app':
      ctx.panel?.dispose()
      return null
    case 'open_url':
      await vscode.env.openExternal(vscode.Uri.parse(String(args[0] ?? '')))
      return null
    case 'show_item_in_folder':
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(String(args[0] ?? '')))
      return null
    case 'export_data': {
      const picked = await vscode.window.showSaveDialog({
        filters: { JSON: ['json'] },
        defaultUri: vscode.Uri.file(
          path.join(state.paths.root, `switchhosts_${formatTimestamp(new Date())}.json`),
        ),
      })
      if (!picked) return null
      return state.withStoreLock(() => {
        exportBackup(state.paths, picked.fsPath)
        return picked.fsPath
      })
    }
    case 'import_data': {
      const picked = await vscode.window.showOpenDialog({
        filters: { JSON: ['json'] },
        canSelectMany: false,
      })
      if (!picked?.[0]) return null
      const bytes = fs.readFileSync(picked[0].fsPath)
      return state.withStoreLock(() => importBackup(state.paths, bytes))
    }
    case 'import_data_from_url':
      return importFromUrl(state, String(args[0] ?? ''))
    case 'find_show':
      return null
    case 'find_set_window_title':
      return null
    case 'find_by':
      return findBy(state, args[0] as Record<string, unknown> | undefined)
    case 'find_replace_one':
    case 'find_replace_all':
      throw new Error('Find replace is not fully implemented in the VS Code extension yet')
    case 'find_get_history':
      return readHistoryFile(state.paths, 'find.json')
    case 'find_set_history':
      writeHistoryFile(state.paths, 'find.json', normalizeArrayArg(args[0]))
      return null
    case 'find_add_history': {
      const items = readHistoryFile(state.paths, 'find.json')
      items.unshift(args[0])
      writeHistoryFile(state.paths, 'find.json', items.slice(0, 20))
      return items.slice(0, 20)
    }
    case 'find_get_replace_history':
      return readHistoryFile(state.paths, 'replace.json').map(String)
    case 'find_set_replace_history':
      writeHistoryFile(
        state.paths,
        'replace.json',
        normalizeArrayArg(args[0]).map(String),
      )
      return null
    case 'find_add_replace_history': {
      const items = readHistoryFile(state.paths, 'replace.json').map(String)
      items.unshift(String(args[0] ?? ''))
      writeHistoryFile(state.paths, 'replace.json', items.slice(0, 20))
      return items.slice(0, 20)
    }
    case 'refresh_remote_hosts':
    case 'refresh_all_remote_hosts':
      throw new Error('Remote hosts refresh is not implemented in the VS Code extension yet')
    case 'check_update':
      return { hasUpdate: false }
    case 'download_update':
    case 'install_update':
      throw new Error('Auto update is not available in the VS Code extension')
    case 'popup_menu':
      return null
    default:
      throw new Error(`Unknown command: ${cmd}`)
  }
}

function normalizeListArg(value: unknown): JsonNode[] {
  if (Array.isArray(value)) return value as JsonNode[]
  if (value == null) return []
  throw new Error('expected an array of host nodes')
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('expected an array of ids')
  return value.map(String)
}

function normalizeArrayArg(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function moveIdsToTrashcan(state: AppState, ids: string[]): void {
  const manifest = loadManifest(state.paths)
  const trashcan = loadTrashcan(state.paths.trashcanFile)
  for (const id of ids) {
    const removed = removeNode(manifest.root, id)
    if (!removed) continue
    trashcan.push({
      id,
      data: removed.node,
      add_time_ms: Date.now(),
      parent_id: removed.parentId,
    })
  }
  saveManifest(state.paths, manifest)
  saveTrashcan(state.paths.trashcanFile, trashcan)
}

function readSystemHostsSafe(): string {
  try {
    const target = systemHostsPath()
    if (!fs.existsSync(target)) return ''
    return fs.readFileSync(target, 'utf8')
  } catch {
    return ''
  }
}

async function importFromUrl(state: AppState, url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    return 'parse_error'
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return state.withStoreLock(() => importBackup(state.paths, bytes))
}

function findBy(state: AppState, options?: Record<string, unknown>): unknown[] {
  const keyword = String(options?.keyword ?? options?.value ?? '')
  if (!keyword) return []
  const isRegexp = Boolean(options?.is_regexp ?? state.config.find_is_regexp)
  const ignoreCase = Boolean(options?.is_ignore_case ?? state.config.find_is_ignore_case)
  let matcher: (line: string) => boolean
  if (isRegexp) {
    const re = new RegExp(keyword, ignoreCase ? 'i' : '')
    matcher = (line) => re.test(line)
  } else {
    const needle = ignoreCase ? keyword.toLowerCase() : keyword
    matcher = (line) => {
      const hay = ignoreCase ? line.toLowerCase() : line
      return hay.includes(needle)
    }
  }

  const manifest = loadManifest(state.paths)
  const results: unknown[] = []
  walkFind(manifest.root, state.paths.entriesDir, matcher, results)
  return results
}

function walkFind(
  nodes: JsonNode[],
  entriesDir: string,
  matcher: (line: string) => boolean,
  out: unknown[],
): void {
  for (const node of nodes) {
    const type = String(node.type ?? 'local')
    if ((type === 'local' || type === 'remote') && typeof node.id === 'string') {
      const content = readEntry(entriesDir, node.id)
      const lines = content.split('\n')
      lines.forEach((line, index) => {
        if (matcher(line)) {
          out.push({
            item_id: node.id,
            title: node.title,
            type: node.type,
            line,
            line_number: index + 1,
            pos: index,
          })
        }
      })
    }
    const children = node.children as JsonNode[] | undefined
    if (children?.length) walkFind(children, entriesDir, matcher, out)
  }
}

function formatTimestamp(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}
